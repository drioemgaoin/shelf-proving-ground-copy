// Violations memory — rolling log of QA-caught rule violations.
//
// Persisted across sandcastle runs so agents learn from past mistakes.
// Entries are grouped by (ruleId, direction) and compressed into a
// compact prompt section injected via {{VIOLATIONS_MEMORY}}.

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const VIOLATIONS_FILE = ".sandcastle/violations.jsonl";

// Budget for the formatted prompt section (~400 tokens).
const MAX_CHARS_IN_PROMPT = 1600;

export interface ViolationEntry {
  /** ISO timestamp */
  ts: string;
  /** Issue/ticket ID */
  issueId: string;
  /** Rule ID that was violated */
  ruleId: string;
  /** File where the violation occurred */
  file: string;
  /** What the agent wrote (one-line summary) */
  wrote: string;
  /** What the fix was */
  fix: string;
  /** Which gate caught it (review, visual-qa, test-author, implementer-lint, implementer-a11y) */
  gate: string;
  /** Failure mode label — the reusable lesson (e.g., "raw-literal", "wrong-semantic-tier") */
  direction?: string;
  /** "violation" (default) or "defer" — deferred items need human decision */
  status?: "violation" | "defer";
  /** Why this was deferred (required when status=defer) */
  reason?: string;
}

/** Append a violation to the rolling log. */
export function recordViolation(entry: ViolationEntry): void {
  mkdirSync(dirname(VIOLATIONS_FILE), { recursive: true });
  appendFileSync(VIOLATIONS_FILE, JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Normalization — fallback when `direction` is not set on an entry.
// Strips file paths, token names, numbers, and backticks from `wrote` so
// textually different entries that teach the same lesson collapse.
// ---------------------------------------------------------------------------

function normalizeWrote(wrote: string): string {
  return wrote
    .replace(/`/g, "")
    .replace(/["']/g, "")
    .replace(/--[\w-]+/g, "TK")
    .replace(/var\(TK\)/g, "TK")
    .replace(/src\/[\w/.@-]*/g, "")
    .replace(/\b\d+(\.\d+)?/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 50);
}

// ---------------------------------------------------------------------------
// Grouping and compression
// ---------------------------------------------------------------------------

interface DirectionGroup {
  ruleId: string;
  direction: string;
  /** Total occurrences with this (ruleId, direction) */
  count: number;
  /** Most recent representative entry */
  representative: ViolationEntry;
}

interface RuleGroup {
  ruleId: string;
  totalCount: number;
  directions: DirectionGroup[];
  deferred: ViolationEntry[];
}

function groupViolations(
  entries: ViolationEntry[],
  filterRuleIds?: string[],
): RuleGroup[] {
  const filtered = filterRuleIds
    ? entries.filter((e) => filterRuleIds.includes(e.ruleId))
    : entries;

  // Group by ruleId
  const byRule = new Map<string, ViolationEntry[]>();
  for (const e of filtered) {
    const list = byRule.get(e.ruleId) ?? [];
    list.push(e);
    byRule.set(e.ruleId, list);
  }

  const ruleGroups: RuleGroup[] = [];

  for (const [ruleId, ruleEntries] of byRule) {
    const violations = ruleEntries.filter((e) => e.status !== "defer");
    const deferred = ruleEntries.filter((e) => e.status === "defer");

    // Group violations by direction (explicit field or normalized wrote)
    const byDirection = new Map<string, ViolationEntry[]>();
    for (const v of violations) {
      const dir = v.direction ?? normalizeWrote(v.wrote);
      const list = byDirection.get(dir) ?? [];
      list.push(v);
      byDirection.set(dir, list);
    }

    const directions: DirectionGroup[] = [];
    for (const [direction, dirEntries] of byDirection) {
      // Most recent entry as representative
      const representative = dirEntries[dirEntries.length - 1];
      directions.push({
        ruleId,
        direction,
        count: dirEntries.length,
        representative,
      });
    }

    ruleGroups.push({
      ruleId,
      totalCount: ruleEntries.length,
      directions,
      deferred,
    });
  }

  // Sort by total count descending — most-violated rules first
  ruleGroups.sort((a, b) => b.totalCount - a.totalCount);

  return ruleGroups;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatDirectionExample(dg: DirectionGroup): string {
  const e = dg.representative;
  const wrote = e.wrote.replace(/`/g, "").substring(0, 30);
  // When direction is explicit, it IS the lesson — show a short example only
  if (e.direction) {
    return `${e.direction} (e.g. ${wrote})`;
  }
  // Fallback: wrote→fix for unclassified entries
  const fix = e.fix.replace(/`/g, "").substring(0, 30);
  return `${wrote} → ${fix}`;
}

function formatRuleLine(rg: RuleGroup): string {
  const examples = rg.directions.map(formatDirectionExample);
  return `- [${rg.ruleId}] (${rg.totalCount}×): ${examples.join(" | ")}`;
}

function formatDeferLine(e: ViolationEntry): string {
  const reason = e.reason ?? e.fix;
  return `- [${e.ruleId}]: ${reason.substring(0, 120)}`;
}

/**
 * Read all violations, group by (ruleId, direction), and format as
 * compressed prompt context.
 *
 * @param filterRuleIds  When provided, only include violations for these
 *   ruleIds. Use for the fixer (scoped to current findings). Omit for
 *   the implementer (full history).
 */
export function loadViolationsMemory(filterRuleIds?: string[]): string {
  if (!existsSync(VIOLATIONS_FILE)) return "";

  const lines = readFileSync(VIOLATIONS_FILE, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  if (lines.length === 0) return "";

  const entries: ViolationEntry[] = lines.map((l) => JSON.parse(l));
  const ruleGroups = groupViolations(entries, filterRuleIds);

  if (ruleGroups.length === 0) return "";

  const sections: string[] = [
    "# Past violations (do not repeat)",
    "",
  ];

  // Violations — one line per rule, pipe-separated direction examples
  let charCount = sections.join("\n").length;
  for (const rg of ruleGroups) {
    if (rg.directions.length === 0) continue;
    const line = formatRuleLine(rg);
    if (charCount + line.length + 1 > MAX_CHARS_IN_PROMPT) break;
    sections.push(line);
    charCount += line.length + 1;
  }

  // Deferred — always shown (they're few and need human attention)
  const allDeferred = ruleGroups.flatMap((rg) => rg.deferred);
  if (allDeferred.length > 0) {
    sections.push(
      "",
      "# Deferred (needs human decision — do not resolve)",
      "",
    );
    for (const d of allDeferred) {
      sections.push(formatDeferLine(d));
    }
  }

  return sections.join("\n");
}
