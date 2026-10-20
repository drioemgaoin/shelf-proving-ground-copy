// Violations memory — rolling log of QA-caught rule violations.
//
// Persisted across sandcastle runs so the implementer learns from past
// mistakes.  The last N entries are injected into the implementer prompt
// as {{VIOLATIONS_MEMORY}}.

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const VIOLATIONS_FILE = ".sandcastle/violations.jsonl";
const MAX_ENTRIES_IN_PROMPT = 10;

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
  /** Which gate caught it (review, visual-qa) */
  gate: string;
}

/** Append a violation to the rolling log. */
export function recordViolation(entry: ViolationEntry): void {
  mkdirSync(dirname(VIOLATIONS_FILE), { recursive: true });
  appendFileSync(VIOLATIONS_FILE, JSON.stringify(entry) + "\n");
}

/** Read the last N violations and format as prompt context. */
export function loadViolationsMemory(): string {
  if (!existsSync(VIOLATIONS_FILE)) return "";

  const lines = readFileSync(VIOLATIONS_FILE, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  if (lines.length === 0) return "";

  // Take the last N entries
  const recent = lines.slice(-MAX_ENTRIES_IN_PROMPT);
  const entries: ViolationEntry[] = recent.map((l) => JSON.parse(l));

  // Format as concise lessons
  const lessons = entries.map(
    (e) =>
      `- [${e.ruleId}] in ${e.file}: wrote \`${e.wrote}\` → fix: ${e.fix}`,
  );

  return [
    "# Past violations (learn from these — do not repeat)",
    "",
    "These were caught by QA in previous sandcastle runs. Apply these lessons on the first pass.",
    "",
    ...lessons,
  ].join("\n");
}
