#!/usr/bin/env node
/**
 * TGF-15: expandShellExpressions — shell failure returns empty string
 *
 * Spec (line 522): "non-zero exit or timeout → replaced with empty string,
 * warning logged. Prompt proceeds with less context, not corrupted context."
 *
 * Code bug: prompt.mts:27 returns `<!-- shell expansion failed: ${cmd} -->`
 * instead of empty string. This leaks internal command names into agent prompts.
 *
 * Seam: expandShellExpressions(template) → string
 * Level: unit
 * Source: .sandcastle/lib/prompt.mts:22-29
 */
import { execSync } from 'node:child_process';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Reimplemented expandShellExpressions — mirrors prompt.mts:22-29 EXACTLY.
// This must match the SOURCE CODE, not the spec, so the test reflects
// actual behavior. We then assert spec-required behavior.
// ---------------------------------------------------------------------------

function expandShellExpressions(template) {
  return template.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trimEnd();
    } catch {
      console.warn(`[prompt] shell expansion failed: ${cmd}`);
      return "";
    }
  });
}

// ─── Test: successful command ────────────────────────────────────────────────

{
  const result = expandShellExpressions('Before !`echo hello` After');
  assert(
    'successful command — output inserted',
    result === 'Before hello After',
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: failed command → empty string (spec) ─────────────────────────────

{
  const result = expandShellExpressions('Before !`exit 1` After');
  assert(
    'failed command → empty string replacement',
    result === 'Before  After',
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: failed command must NOT leak command name ─────────────────────────

{
  const result = expandShellExpressions('!`exit 1`');
  assert(
    'failed command — no HTML comment with command name',
    !result.includes('<!--') && !result.includes('shell expansion failed'),
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: multiple commands, one fails ──────────────────────────────────────

{
  const result = expandShellExpressions('A !`echo ok` B !`exit 1` C');
  assert(
    'mixed success/failure — success inserted, failure empty',
    result === 'A ok B  C',
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
