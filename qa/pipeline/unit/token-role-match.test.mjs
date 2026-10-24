#!/usr/bin/env node
/**
 * RED/GREEN tests for token-role-match T1 enforcement.
 *
 * Gap: color-accepting CSS properties can use tokens from the wrong semantic
 * role (e.g., fgColor on background-color) with no T1 block. The reviewer
 * catches it at T3 — too late, wastes full review rounds.
 *
 * Run: node qa/pipeline/unit/token-role-match.test.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const hookPath = join(PROJECT_ROOT, '.claude', 'hooks', 'apply-t1.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} \u2014 ${e.message}`); console.log(`  \u2717 ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function runT1(filePath, content) {
  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: join(PROJECT_ROOT, filePath), content },
  });
  const r = spawnSync('node', [hookPath], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_ROOT },
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
  return { exitCode: r.status, stderr: r.stderr };
}

// ══════════════════════════════════════════════════════════════════════
// bgColor role: must appear only on background properties
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- bgColor role ---');

test('BLOCKS fgColor on background-color', () => {
  const r = runT1('src/components/test.css', '.skeleton { background-color: var(--shelf-fgColor-muted); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS borderColor on background-color', () => {
  const r = runT1('src/components/test.css', '.card { background-color: var(--shelf-borderColor-subtle); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS fgColor on background shorthand', () => {
  const r = runT1('src/components/test.css', '.card { background: var(--shelf-fgColor-default); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('ALLOWS bgColor on background-color', () => {
  const r = runT1('src/components/test.css', '.card { background-color: var(--shelf-bgColor-raised); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

test('ALLOWS bgColor on background shorthand', () => {
  const r = runT1('src/components/test.css', '.card { background: var(--shelf-bgColor-default); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

test('ALLOWS transparent on background-color (not a token)', () => {
  const r = runT1('src/components/test.css', '.card { background-color: transparent; }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

// ══════════════════════════════════════════════════════════════════════
// fgColor role: must appear only on text/foreground properties
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- fgColor role ---');

test('BLOCKS bgColor on color', () => {
  const r = runT1('src/components/test.css', '.badge { color: var(--shelf-bgColor-accent); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS borderColor on color', () => {
  const r = runT1('src/components/test.css', '.link { color: var(--shelf-borderColor-default); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('ALLOWS fgColor on color', () => {
  const r = runT1('src/components/test.css', '.title { color: var(--shelf-fgColor-default); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

test('ALLOWS fgColor on caret-color', () => {
  const r = runT1('src/components/test.css', '.input { caret-color: var(--shelf-fgColor-accent); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

test('ALLOWS inherit on color', () => {
  const r = runT1('src/components/test.css', '.link { color: inherit; }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

// ══════════════════════════════════════════════════════════════════════
// borderColor role: must appear only on border/outline properties
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- borderColor role ---');

test('BLOCKS bgColor on border-color', () => {
  const r = runT1('src/components/test.css', '.chip { border-color: var(--shelf-bgColor-accent); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS fgColor on border-color', () => {
  const r = runT1('src/components/test.css', '.chip { border-color: var(--shelf-fgColor-danger); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS bgColor on border-top-color', () => {
  const r = runT1('src/components/test.css', '.card { border-top-color: var(--shelf-bgColor-accent); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('BLOCKS bgColor on outline-color', () => {
  const r = runT1('src/components/test.css', '.btn { outline-color: var(--shelf-bgColor-danger); }');
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}`);
});

test('ALLOWS borderColor on border-color', () => {
  const r = runT1('src/components/test.css', '.chip { border-color: var(--shelf-borderColor-default); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

test('ALLOWS borderColor on outline-color', () => {
  const r = runT1('src/components/test.css', '.btn { outline-color: var(--shelf-borderColor-subtle); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

// ══════════════════════════════════════════════════════════════════════
// Edge cases: non-Color tokens, shorthand, multi-var lines
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Edge cases ---');

test('ALLOWS non-Color token on background (e.g. spacing — caught elsewhere)', () => {
  // space token on background is wrong but not THIS rule's job
  const r = runT1('src/components/test.css', '.card { background: var(--shelf-space-md); }');
  // Should not be blocked by token-role-match (other rules catch this)
  assert(r.exitCode === 0 || r.stderr.includes('values-from-tokens'),
    `Blocked by wrong rule. stderr: ${r.stderr.slice(0, 200)}`);
});

test('ALLOWS border shorthand with borderWidth + borderColor tokens', () => {
  // Uses borderWidth-default to avoid pre-existing false positive where
  // the thin/medium/thick T1 pattern matches "thin" inside token names.
  const r = runT1('src/components/test.css',
    '.chip { border: var(--shelf-borderWidth-default) solid var(--shelf-borderColor-default); }');
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}`);
});

// ══════════════════════════════════════════════════════════════════════
// Rule text: must mention role matching for implementer guidance
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Rule text guidance ---');

test('values-from-tokens rule text mentions role matching', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-base.md'), 'utf8');
  const lines = rulesContent.split('\n');
  const fenceIdx = lines.findIndex(l => l.includes('id: "values-from-tokens"'));
  assert(fenceIdx > 0, 'values-from-tokens block not found');
  let bulletLine = '';
  for (let i = fenceIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) { bulletLine = trimmed; break; }
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('CORRECT:') && !trimmed.startsWith('WRONG:')) break;
  }
  assert(bulletLine, 'No bullet found before values-from-tokens block');
  const mentionsRoles = /bgColor.*background|background.*bgColor|fgColor.*text|role/i.test(bulletLine);
  assert(mentionsRoles, `Rule text must mention token role matching (bgColor for backgrounds, etc). Got: "${bulletLine}"`);
});

test('values-from-tokens rule text fits within 180 char constraint limit', () => {
  const rulesContent = readFileSync(join(PROJECT_ROOT, '.claude', 'rules', 'ui-base.md'), 'utf8');
  const lines = rulesContent.split('\n');
  const fenceIdx = lines.findIndex(l => l.includes('id: "values-from-tokens"'));
  let bulletLine = '';
  for (let i = fenceIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) { bulletLine = trimmed.slice(2); break; }
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('CORRECT:') && !trimmed.startsWith('WRONG:')) break;
  }
  assert(bulletLine.length <= 180, `Rule text is ${bulletLine.length} chars (max 180): "${bulletLine}"`);
});

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
