#!/usr/bin/env node
/**
 * Tests for the review script.
 * Seeds tracker data and log files, verifies aggregated output and exit codes.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts/review.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'review-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function runReview(cwd) {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function test(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─── Tests ───────────────────────────────────────────────────────

test('empty state exits 0', () => {
  // No tracker, no logs, no git — should exit 0
  const tmp = makeTempProject({
    'placeholder.txt': 'empty project',
  });
  try {
    const result = runReview(tmp);
    assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}`);
    assert(result.stdout.includes('Nothing needs review'), 'expected "Nothing needs review" message');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('overflow-skipped.jsonl is reported', () => {
  const tmp = makeTempProject({
    '.sandcastle/logs/run-001/overflow-skipped.jsonl':
      '{"rule":"no-raw-colors","reason":"budget exceeded"}\n' +
      '{"rule":"spacing-tokens","reason":"overflow limit"}\n',
    'placeholder.txt': '',
  });
  try {
    const result = runReview(tmp);
    assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
    assert(result.stdout.includes('no-raw-colors'), 'expected no-raw-colors in output');
    assert(result.stdout.includes('spacing-tokens'), 'expected spacing-tokens in output');
    assert(result.stdout.includes('budget exceeded'), 'expected reason in output');
    assert(result.stdout.includes('Triage overflow'), 'expected section title');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('latest overflow run is used', () => {
  const tmp = makeTempProject({
    '.sandcastle/logs/run-old/overflow-skipped.jsonl':
      '{"rule":"old-rule","reason":"old run"}\n',
    '.sandcastle/logs/run-new/overflow-skipped.jsonl':
      '{"rule":"new-rule","reason":"new run"}\n',
    'placeholder.txt': '',
  });
  // Touch the "new" file to ensure it has a later mtime
  const newPath = join(tmp, '.sandcastle/logs/run-new/overflow-skipped.jsonl');
  const futureTime = new Date(Date.now() + 10000);
  utimesSync(newPath, futureTime, futureTime);

  try {
    const result = runReview(tmp);
    assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
    assert(result.stdout.includes('new-rule'), 'expected new-rule from latest run');
    assert(!result.stdout.includes('old-rule'), 'should not include old-rule from older run');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('human-tier rules are surfaced from audit:rules', () => {
  // This test runs against the real project's audit:rules script
  // which has 3 Human-tier rules with only "created" verdicts
  const result = runReview(process.cwd());
  assert(result.stdout.includes('Human-tier rules'), 'expected Human-tier section');
  assert(result.stdout.includes('glossary-terms-in-ui'), 'expected specific human-tier rule');
});

test('report includes item count', () => {
  const tmp = makeTempProject({
    '.sandcastle/logs/run-001/overflow-skipped.jsonl':
      '{"rule":"test-rule","reason":"overflow"}\n',
    'placeholder.txt': '',
  });
  try {
    const result = runReview(tmp);
    assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
    assert(result.stdout.includes('1 item(s) pending review'), 'expected item count');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Report ──────────────────────────────────────────────────────

console.log('');
console.log(`Review Script Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) {
    console.log(`  ${f}`);
  }
  process.exit(1);
}
