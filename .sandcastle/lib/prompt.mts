// Prompt expansion — three-stage template engine used by main and all replays.
//
// Stage 1: {{VAR}} substitution (same regex as sandcastle SDK)
// Stage 2: !`cmd` shell expansion (runs on the host — same git history)
// Stage 3: T3 rule payload injection ({{T3_VISUAL_CHECKS}}, {{T3_REVIEW_CHECKS}})

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

// Recognized VAR whitelist — Stage 1 substitutes only these.
// {{T3_VISUAL_CHECKS}} and {{T3_REVIEW_CHECKS}} are reserved for Stage 3.
const STAGE1_WHITELIST = new Set([
  // Original vars
  "ISSUE_ID",
  "ISSUE_TITLE",
  "ISSUE_BODY",
  "ISSUE_LABELS",
  "CODEMAP",
  "DIFF_REF",
  "FIX_HISTORY",
  // Implementer vars (phases.mts)
  "TASK_ID",
  "BRANCH",
  "ISSUE_DETAILS",
  "CODING_STANDARDS",
  "COMMENT_TASK_COMMAND",
  "LABEL_TASK_COMMAND",
  "CREATE_BUG_COMMAND",
  // Planner vars (phases.mts)
  "READY_ISSUES",
  // Merger vars (phases.mts)
  "BRANCHES",
  "ISSUES",
  "CLOSE_TASK_COMMAND",
  // QA gate vars (gates.mts)
  "FINDINGS_FILE",
  "VERIFY_COMMAND",
  "BASE_BRANCH",
  // Code review pre-computed vars (gates.mts)
  "BRANCH_DIFF",
  "BRANCH_LOG",
]);

/** Substitute {{VAR}} placeholders in a template string. */
export function substituteVars(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) =>
      STAGE1_WHITELIST.has(key) && key in vars ? vars[key] : match,
  );
}

/** Expand !`cmd` shell expressions in a template string. */
export function expandShellExpressions(template: string): string {
  return template.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 30_000 }).trimEnd();
    } catch {
      console.warn(`[prompt] shell expansion failed: ${cmd}`);
      return "";
    }
  });
}

/** Options for Stage 3 T3 payload injection. */
export interface ExpandOptions {
  /** Ticket ID — resolves to .sandcastle/payloads/{ticketId}/ */
  ticketId?: string;
  /** Override T3 payload directory (takes precedence over ticketId) */
  payloadDir?: string;
}

/**
 * Load T3 payload files for a given agent from the payload directory.
 * Returns concatenated content, or empty string if no payloads exist.
 */
function loadT3Payload(payloadDir: string, agentPrefix: string): string {
  if (!existsSync(payloadDir)) return "";
  try {
    const files = readdirSync(payloadDir)
      .filter((f) => f.startsWith(agentPrefix) && f.endsWith(".md"))
      .sort();
    if (files.length === 0) return "";
    return files
      .map((f) => readFileSync(join(payloadDir, f), "utf8"))
      .join("\n\n");
  } catch {
    return "";
  }
}

/** Stage 3: replace T3 placeholders with payload content. */
function injectT3Payloads(text: string, options: ExpandOptions): string {
  const effectiveDir =
    options.payloadDir ??
    (options.ticketId
      ? join(".sandcastle", "payloads", options.ticketId)
      : null);

  if (!effectiveDir) return text;

  const t3Visual = loadT3Payload(effectiveDir, "visual-qa");
  const t3Review = loadT3Payload(effectiveDir, "reviewer");
  return text
    .replace(/\{\{\s*T3_VISUAL_CHECKS\s*\}\}/g, t3Visual)
    .replace(/\{\{\s*T3_REVIEW_CHECKS\s*\}\}/g, t3Review);
}

/**
 * Full three-stage expansion: shell → vars → T3 injection.
 * Reads the template from disk, writes the expanded result to outputPath.
 */
export function expandAndSave(
  promptFile: string,
  promptArgs: Record<string, string>,
  outputPath: string,
  options: ExpandOptions = {},
): void {
  const raw = readFileSync(promptFile, "utf8");
  const afterStages1and2 = substituteVars(
    expandShellExpressions(raw),
    promptArgs,
  );
  const expanded = injectT3Payloads(afterStages1and2, options);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, expanded);
}

/**
 * Expand a prompt file in-memory (no file write). Used by replay scripts
 * that want the expanded string without saving it separately.
 */
export function expandPrompt(
  promptFile: string,
  promptArgs: Record<string, string>,
  options: ExpandOptions = {},
): string {
  const raw = readFileSync(promptFile, "utf8");
  const afterStages1and2 = substituteVars(
    expandShellExpressions(raw),
    promptArgs,
  );
  return injectT3Payloads(afterStages1and2, options);
}
