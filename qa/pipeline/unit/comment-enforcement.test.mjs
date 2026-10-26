#!/usr/bin/env node
/**
 * RED/GREEN tests for comment enforcement T1 gaps.
 *
 * Two gaps:
 *   1. comment-brevity multi-line pattern is broken — apply-t1 tests line-by-line
 *      so patterns containing \n never match.
 *   2. JSDoc blocks (/** ... *​/) have no T1 pattern — only T3 reviewer catches them.
 *
 * Run: node qa/pipeline/unit/comment-enforcement.test.mjs
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
// Gap: Multi-line // comment blocks not caught by T1
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Multi-line // comment blocks ---');

test('BLOCKS three consecutive // comment lines', () => {
  const content = [
    '// null while the first load is in flight; an array once data (or an empty',
    '// shelf) has arrived. Skeletons render during the null phase.',
    '// The loading state is tracked by a null sentinel.',
    'const x = 1;',
  ].join('\n');
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. Multi-line // block was not caught.`);
});

test('ALLOWS one // comment line', () => {
  const content = '// null = loading; array = loaded\nconst x = 1;\n';
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Single comment was incorrectly blocked.`);
});

test('ALLOWS two // comment lines', () => {
  const content = [
    '// null = loading; array = loaded',
    '// See: state machine diagram',
    'const x = 1;',
  ].join('\n');
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Two-line comment was incorrectly blocked.`);
});

// ══════════════════════════════════════════════════════════════════════
// Gap: JSDoc blocks not caught by T1
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- JSDoc blocks ---');

test('BLOCKS multi-line JSDoc block', () => {
  const content = [
    '/**',
    ' * Multi-select filter chip bar.',
    ' * All is the default selection.',
    ' */',
    'const x = 1;',
  ].join('\n');
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. Multi-line JSDoc was not caught.`);
});

test('BLOCKS single-line JSDoc block', () => {
  const content = '/** Fixed number of skeleton placeholders. */\nconst SKELETON_COUNT = 6;';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. Single-line JSDoc was not caught.`);
});

test('ALLOWS JSDoc in CSS (only TS/TSX is scoped)', () => {
  // CSS uses /* */ for all comments — JSDoc pattern should not apply
  const content = '/** Component styles */\n.card { display: flex; }';
  const r = runT1('src/components/ChipBar/ChipBar.css', content);
  // Should not be blocked by comment-brevity (CSS is not in scope for this pattern)
  // May be blocked by other rules — check it's not blocked by comment-brevity specifically
  if (r.exitCode === 2) {
    assert(!r.stderr.includes('comment-brevity'),
      `JSDoc in CSS was blocked by comment-brevity but scope should be TS/TSX only`);
  }
});

test('ALLOWS // comment in TSX (not JSDoc)', () => {
  const content = '// null = loading; array = loaded\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Regular // comment incorrectly blocked.`);
});

test('ALLOWS JSDoc-like pattern inside string literal', () => {
  const content = 'const pattern = "/** not a real JSDoc */";\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. String literal incorrectly blocked.`);
});

// ══════════════════════════════════════════════════════════════════════
// Gap: Forward-looking architecture references not caught by T1
// Real-world violation from sandcastle djk.1 review-r1:
//   src/components/ChipBar/ChipBar.tsx:19
//   "// State is local; a parent component will lift it to drive grid filtering."
// ══════════════════════════════════════════════════════════════════════

console.log('\n--- Forward-looking architecture references ---');

test('BLOCKS comment referencing caller with future tense ("a parent component will lift it")', () => {
  const content = '// State is local; a parent component will lift it to drive grid filtering.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. Forward-reference to caller was not caught.`);
});

test('BLOCKS comment with "will wire" future promise', () => {
  const content = '// The consumer will wire this to the grid filter state.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. "will wire" future promise was not caught.`);
});

test('BLOCKS comment with "will provide" future promise', () => {
  const content = '// A wrapper will provide the filter context.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. "will provide" future promise was not caught.`);
});

test('BLOCKS comment with "will consume" future promise', () => {
  const content = '// The parent will consume this callback via props.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. "will consume" future promise was not caught.`);
});

test('BLOCKS comment with "will connect" future promise', () => {
  const content = '// A container will connect this to the store.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. "will connect" future promise was not caught.`);
});

test('BLOCKS comment with "will drive" future promise', () => {
  const content = '// The host will drive the animation externally.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 2, `Expected blocked (2), got ${r.exitCode}. "will drive" future promise was not caught.`);
});

test('ALLOWS comment describing current boundary (no forward reference)', () => {
  const content = '// Owns only visual pressed state; grid filtering is not wired.\nconst x = 1;\n';
  const r = runT1('src/components/ChipBar/ChipBar.tsx', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Boundary description was incorrectly blocked.`);
});

test('ALLOWS comment with "will" describing current code behavior ("will throw")', () => {
  const content = '// getBooks will throw if the network is down.\nconst x = 1;\n';
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Current behavior "will throw" was incorrectly blocked.`);
});

test('ALLOWS comment with "will" describing current code behavior ("will return")', () => {
  const content = '// Returns null while loading; will resolve to an array.\nconst x = 1;\n';
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Current behavior "will resolve" was incorrectly blocked.`);
});

test('ALLOWS comment with "will" in non-architecture context ("will retry")', () => {
  const content = '// Fetch will retry up to 3 times on transient failure.\nconst x = 1;\n';
  const r = runT1('src/hooks/test.ts', content);
  assert(r.exitCode === 0, `Expected allowed (0), got ${r.exitCode}. Legitimate "will retry" was incorrectly blocked.`);
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
