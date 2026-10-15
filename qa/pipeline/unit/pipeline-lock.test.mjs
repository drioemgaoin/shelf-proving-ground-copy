#!/usr/bin/env node
/**
 * Tests for pipeline lock (concurrent run prevention).
 * Tests the lock file protocol: acquire, fresh/stale detection, release.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

// Reimplement lock logic for testing (mirrors pipeline-lock.mts)
function acquireLock(projectRoot, runId) {
  const lockPath = join(projectRoot, '.sandcastle', 'pipeline.lock');
  try {
    const content = readFileSync(lockPath, 'utf8').trim();
    const st = statSync(lockPath);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs < STALE_THRESHOLD_MS) {
      return { acquired: false, holder: content, ageMs };
    }
    // Stale — replace
  } catch {
    // No lock file
  }
  mkdirSync(join(projectRoot, '.sandcastle'), { recursive: true });
  writeFileSync(lockPath, runId + '\n');
  return { acquired: true };
}

function releaseLock(projectRoot) {
  const lockPath = join(projectRoot, '.sandcastle', 'pipeline.lock');
  try { rmSync(lockPath); } catch { /* already gone */ }
}

// UC-55a: No lock → acquire and proceed
test('UC-55a: no lock → acquire and proceed', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'));
  const result = acquireLock(tmp, 'run-001');
  assert(result.acquired === true, 'Expected lock acquired');
  const lockPath = join(tmp, '.sandcastle', 'pipeline.lock');
  assert(existsSync(lockPath), 'Expected lock file created');
  assert(readFileSync(lockPath, 'utf8').trim() === 'run-001', 'Expected run ID in lock');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-55b: Fresh lock exists → exit 0 (not acquired)
test('UC-55b: fresh lock exists → not acquired', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'));
  mkdirSync(join(tmp, '.sandcastle'), { recursive: true });
  writeFileSync(join(tmp, '.sandcastle', 'pipeline.lock'), 'run-existing\n');
  const result = acquireLock(tmp, 'run-new');
  assert(result.acquired === false, 'Expected lock NOT acquired');
  assert(result.holder === 'run-existing', 'Expected existing holder');
  // Lock file should still contain original holder
  assert(readFileSync(join(tmp, '.sandcastle', 'pipeline.lock'), 'utf8').trim() === 'run-existing', 'Lock unchanged');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-55c: Stale lock (>4h) → replaced
test('UC-55c: stale lock (>4h) → replaced', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'));
  mkdirSync(join(tmp, '.sandcastle'), { recursive: true });
  const lockPath = join(tmp, '.sandcastle', 'pipeline.lock');
  writeFileSync(lockPath, 'run-old\n');
  // Set mtime to 5 hours ago
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
  utimesSync(lockPath, fiveHoursAgo, fiveHoursAgo);
  const result = acquireLock(tmp, 'run-new');
  assert(result.acquired === true, 'Expected stale lock replaced');
  assert(readFileSync(lockPath, 'utf8').trim() === 'run-new', 'Expected new run ID');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-55d: Lock removed at completion
test('UC-55d: lock removed at completion', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'));
  acquireLock(tmp, 'run-001');
  const lockPath = join(tmp, '.sandcastle', 'pipeline.lock');
  assert(existsSync(lockPath), 'Lock should exist after acquire');
  releaseLock(tmp);
  assert(!existsSync(lockPath), 'Lock should be removed after release');
  rmSync(tmp, { recursive: true, force: true });
});

// Summary
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`Pipeline lock tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
