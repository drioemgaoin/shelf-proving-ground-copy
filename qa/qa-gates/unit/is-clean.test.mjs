#!/usr/bin/env node
/**
 * TGF-1: isClean — gate verdict detection
 *
 * isClean(path, passWord) is the sole function deciding PASS/DEFER/FAIL
 * for every gate round. Reimplements the logic from qa-gates.mts:146-149.
 */
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// --- Reimplementation (mirrors qa-gates.mts:146-149) ---
import { readFileSync } from 'node:fs';

function isClean(path, passWord) {
  if (!existsSync(path)) return true;
  return readFileSync(path, 'utf8').trim().startsWith(passWord);
}

// --- Test fixtures ---
const testDir = join(tmpdir(), `isClean-test-${process.pid}`);
mkdirSync(testDir, { recursive: true });

function writeTmp(name, content) {
  const p = join(testDir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

// --- Tests ---

test('TGF-1a: missing file → true', () => {
  const result = isClean(join(testDir, 'nonexistent.txt'), 'PASS');
  assert(result === true, `Expected true, got ${result}`);
});

test('TGF-1b: file starting with passWord "PASS" → true', () => {
  const p = writeTmp('pass-report.txt', 'PASS — no violations found');
  const result = isClean(p, 'PASS');
  assert(result === true, `Expected true, got ${result}`);
});

test('TGF-1c: FAIL content with passWord "PASS" → false', () => {
  const p = writeTmp('fail-report.txt', 'FAIL — 3 violations found');
  const result = isClean(p, 'PASS');
  assert(result === false, `Expected false, got ${result}`);
});

test('TGF-1d: empty file → false', () => {
  const p = writeTmp('empty-report.txt', '');
  const result = isClean(p, 'PASS');
  assert(result === false, `Expected false, got ${result}`);
});

test('TGF-1e: file with "CLEAN" content + passWord "CLEAN" → true', () => {
  const p = writeTmp('clean-report.txt', 'CLEAN — all checks passed');
  const result = isClean(p, 'CLEAN');
  assert(result === true, `Expected true, got ${result}`);
});

test('TGF-1f: PASS content with passWord "CLEAN" → false (distinction)', () => {
  const p = writeTmp('pass-not-clean.txt', 'PASS — no violations found');
  const result = isClean(p, 'CLEAN');
  assert(result === false, `Expected false, got ${result}`);
});

// --- Cleanup & report ---
rmSync(testDir, { recursive: true, force: true });

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`isClean tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
