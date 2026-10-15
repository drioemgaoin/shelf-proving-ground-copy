// Prompt expansion — two-stage template engine used by main and all replays.
//
// Stage 1: {{VAR}} substitution (same regex as sandcastle SDK)
// Stage 2: !`cmd` shell expansion (runs on the host — same git history)

import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

/** Substitute {{VAR}} placeholders in a template string. */
export function substituteVars(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => (key in vars ? vars[key] : match),
  );
}

/** Expand !`cmd` shell expressions in a template string. */
export function expandShellExpressions(template: string): string {
  return template.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 30_000 }).trimEnd();
    } catch {
      return `<!-- shell expansion failed: ${cmd} -->`;
    }
  });
}

/**
 * Full two-stage expansion: substitute vars, then expand shell expressions.
 * Reads the template from disk, writes the expanded result to outputPath.
 */
export function expandAndSave(
  promptFile: string,
  promptArgs: Record<string, string>,
  outputPath: string,
): void {
  const raw = readFileSync(promptFile, "utf8");
  const expanded = expandShellExpressions(substituteVars(raw, promptArgs));
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
): string {
  const raw = readFileSync(promptFile, "utf8");
  return expandShellExpressions(substituteVars(raw, promptArgs));
}
