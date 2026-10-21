#!/usr/bin/env node
// Integration tests for .claude/hooks/backpressure.mjs
//
// Runs the ACTUAL hook as a subprocess with controlled inputs:
//   - UI_CHECK_CMDS    → fake scripts that emit deterministic output
//   - CLAUDE_PROJECT_DIR → temp directory with controlled layout
//   - stdin             → hook input JSON
//   - PATH              → prepends WORK/bin so a mock `git` intercepts all git calls
//   - scripts/ui-qa/fingerprint.mjs → mock that never touches git
//
// No real git commands are executed.
//
// Run: node .sandcastle/tests/backpressure.test.mjs

import assert from 'node:assert/strict';
import { describe, test, before, after, beforeEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ── Paths ────────────────────────────────────────────────────────────

// Resolve hook path relative to this file, no git needed.
const HOOK = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../../.claude/hooks/backpressure.mjs',
);

// ── Temp workspace shared across all tests ───────────────────────────

const WORK = join(tmpdir(), `bp-test-${process.pid}`);
const SCRIPTS = join(WORK, 'scripts', 'ui-qa');
const BIN = join(WORK, 'bin');

function cleanup() {
  rmSync(WORK, { recursive: true, force: true });
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a shell script in WORK/bin/ that prints given text and exits with code.
 *  Uses printf so \\n in the string becomes real newlines. */
function fakeCheck(name, stdout, exitCode = 0) {
  mkdirSync(BIN, { recursive: true });
  const p = join(BIN, name);
  writeFileSync(p, `#!/usr/bin/env bash\nprintf '%b\\n' "${stdout}"\nexit ${exitCode}\n`);
  chmodSync(p, 0o755);
  return p;
}

/** Install a mock git that handles the commands fingerprint.mjs might invoke. */
function installMockGit() {
  mkdirSync(BIN, { recursive: true });
  // The hook calls process.chdir(repoRoot()) where repoRoot() comes from our
  // mock fingerprint.mjs. The mock fingerprint.mjs never shells out to git.
  // But just in case anything else tries git, provide a safe mock that returns
  // reasonable defaults and never touches a real repo.
  const script = `#!/usr/bin/env bash
case "$*" in
  "rev-parse --show-toplevel") echo "${WORK}" ;;
  "merge-base"*)               echo "0000000000000000000000000000000000000000" ;;
  "diff --name-only"*)         echo "" ;;
  "diff --name-status"*)       echo "" ;;
  "ls-files -o --exclude-standard") echo "" ;;
  "init"*)                     : ;;
  "commit"*)                   : ;;
  *)                           echo "mock-git: unhandled: $*" >&2; exit 1 ;;
esac
`;
  writeFileSync(join(BIN, 'git'), script);
  chmodSync(join(BIN, 'git'), 0o755);
}

/** Build the PATH with WORK/bin first so mock git and fake checks are found. */
function testPath() {
  return `${BIN}:${process.env.PATH}`;
}

/** Run the hook in stop-gate mode (default). Returns { code, stderr, stdout }. */
function runHook(env = {}, stdinJson = {}) {
  const result = spawnSync('node', [HOOK], {
    encoding: 'utf8',
    input: JSON.stringify(stdinJson),
    env: {
      ...process.env,
      UI_GUARD: 'afk',
      CLAUDE_PROJECT_DIR: WORK,
      PATH: testPath(),
      ...env,
    },
    cwd: WORK,
    timeout: 30_000,
  });
  return { code: result.status, stderr: result.stderr, stdout: result.stdout };
}

/** Run the hook in --baseline mode. */
function runBaseline(env = {}) {
  const result = spawnSync('node', [HOOK, '--baseline'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UI_GUARD: 'afk',
      CLAUDE_PROJECT_DIR: WORK,
      PATH: testPath(),
      ...env,
    },
    cwd: WORK,
    timeout: 30_000,
  });
  return { code: result.status, stderr: result.stderr, stdout: result.stdout };
}

// ── Setup: temp dir + mock git + mock fingerprint.mjs ────────────────

before(() => {
  cleanup();
  mkdirSync(SCRIPTS, { recursive: true });
  installMockGit();

  // Default mock fingerprint.mjs — no git, no real files.
  writeFileSync(
    join(SCRIPTS, 'fingerprint.mjs'),
    `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() { return []; }
export function fingerprint() { return 'abcdef1234567890'; }
`,
  );
});

after(cleanup);

// Reset per-test state (baseline, phase, report, counter files, check scripts).
beforeEach(() => {
  rmSync(join(WORK, '.sandcastle'), { recursive: true, force: true });
  rmSync(join(WORK, '.sandcastle-phase'), { force: true });
  rmSync(join(WORK, '.ui-qa'), { recursive: true, force: true });
  // Keep mock git but remove fake check scripts.
  for (const f of ['check-a', 'check-b', 'mycheck', 'testcmd', 'tsc', 'ok', 'ok1', 'ok2', 'failing', 'vcheck']) {
    rmSync(join(BIN, f), { force: true });
  }
  // Restore default fingerprint.mjs (tests that need a custom one overwrite it).
  writeFileSync(
    join(SCRIPTS, 'fingerprint.mjs'),
    `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() { return []; }
export function fingerprint() { return 'abcdef1234567890'; }
`,
  );
});

// ═════════════════════════════════════════════════════════════════════
// 1. Early exits
// ═════════════════════════════════════════════════════════════════════

describe('early exits', () => {
  test('exits 0 when UI_GUARD is not afk', () => {
    const r = spawnSync('node', [HOOK], {
      encoding: 'utf8',
      input: '{}',
      env: { ...process.env, UI_GUARD: '', CLAUDE_PROJECT_DIR: WORK, PATH: testPath() },
      cwd: WORK,
    });
    assert.equal(r.status, 0);
  });

  test('exits 0 when phase is visual-qa (non-builder)', () => {
    writeFileSync(join(WORK, '.sandcastle-phase'), 'visual-qa');
    fakeCheck('mycheck', 'ok');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'mycheck') });
    assert.equal(r.code, 0);
  });

  test('exits 0 when phase is review (non-builder)', () => {
    writeFileSync(join(WORK, '.sandcastle-phase'), 'review');
    fakeCheck('mycheck', 'ok');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'mycheck') });
    assert.equal(r.code, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Baseline mode
// ═════════════════════════════════════════════════════════════════════

describe('baseline mode', () => {
  test('creates baseline files for each check command', () => {
    fakeCheck('check-a', 'error: something broke', 1);
    fakeCheck('check-b', 'all good');
    const r = runBaseline({ UI_CHECK_CMDS: `${join(BIN, 'check-a')};;${join(BIN, 'check-b')}` });
    assert.equal(r.code, 0);

    const dir = join(WORK, '.sandcastle/.baseline');
    assert.ok(existsSync(dir), 'Baseline dir should exist');
  });

  test('baseline strips noise from vitest output', () => {
    const vitestOutput = [
      'RUN  v2.1.9 /workspace',
      '✓ src/App.test.tsx (1 test) 11ms',
      'Tests  18 passed (18)',
      'Duration  2.43s (transform 52ms)',
      'Start at  15:36:17',
      'REAL ERROR LINE',
    ].join('\\n');
    fakeCheck('vcheck', vitestOutput, 1);
    const r = runBaseline({ UI_CHECK_CMDS: join(BIN, 'vcheck') });
    assert.equal(r.code, 0);

    // Baseline should contain only the real error, not the noise.
    const dir = join(WORK, '.sandcastle/.baseline');
    const files = readdirSync(dir);
    const content = readFileSync(join(dir, files[0]), 'utf8');
    assert.ok(content.includes('REAL ERROR LINE'), 'Real error should be in baseline');
    assert.ok(!content.includes('Duration'), 'Timing noise should be stripped');
    assert.ok(!content.includes('Start at'), 'Timestamp should be stripped');
    assert.ok(!content.includes('Tests  18'), 'Test count should be stripped');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. Project checks — the noise regression bug
// ═════════════════════════════════════════════════════════════════════

describe('project checks: noise regression (the bug this fix addresses)', () => {
  test('RED before fix: timing-only changes would cause false block', () => {
    // Demonstrate what the OLD behavior was: raw sorted-line comparison
    // finds "new errors" from timing differences alone.
    const baseline = [
      '> shelf@1.0.0 test',
      '> vitest run',
      'RUN  v2.1.9 /workspace',
      '✓ src/App.test.tsx (1 test) 11ms',
      'Tests  18 passed (18)',
      'Duration  2.43s (transform 52ms)',
      'Start at  15:36:17',
    ].sort();

    const current = [
      '> shelf@1.0.0 test',
      '> vitest run',
      'RUN  v2.1.9 /workspace',
      '✓ src/App.test.tsx (2 tests) 54ms',
      'Tests  19 passed (19)',
      'Duration  3.01s (transform 48ms)',
      'Start at  15:42:03',
    ].sort();

    // OLD: raw comparison → false positives.
    const baselineSet = new Set(baseline);
    const falsePositives = current.filter((l) => l.trim() && !baselineSet.has(l));
    assert.ok(
      falsePositives.length > 0,
      `Expected false positives from raw comparison, got 0. ` +
        `This test documents the bug that existed before stripNoise.`,
    );
    console.log(`    Raw comparison: ${falsePositives.length} false "new errors"`);
  });

  test('GREEN after fix: timing-only changes do NOT block the hook', () => {
    // Baseline captured with old timing/counts.
    const baselineOutput = [
      '> shelf@1.0.0 test',
      '> vitest run',
      'RUN  v2.1.9 /workspace',
      '✓ src/App.test.tsx (1 test) 11ms',
      'Tests  18 passed (18)',
      'Duration  2.43s (transform 52ms)',
      'Start at  15:36:17',
    ].join('\\n');

    // Current output: different timing, different test count — but no real errors.
    const currentOutput = [
      '> shelf@1.0.0 test',
      '> vitest run',
      'RUN  v2.1.9 /workspace',
      '✓ src/App.test.tsx (2 tests) 54ms',
      'Tests  19 passed (19)',
      'Duration  3.01s (transform 48ms)',
      'Start at  15:42:03',
    ].join('\\n');

    // Capture baseline.
    fakeCheck('testcmd', baselineOutput, 1);
    const br = runBaseline({ UI_CHECK_CMDS: join(BIN, 'testcmd') });
    assert.equal(br.code, 0, 'Baseline capture should succeed');

    // Swap to different timing output.
    fakeCheck('testcmd', currentOutput, 1);
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'testcmd') });

    assert.equal(r.code, 0, `Hook should NOT block on timing noise. stderr: ${r.stderr}`);
  });

  test('GREEN after fix: ENOTDIR cache error does NOT block', () => {
    const baselineOutput = [
      '> vitest run',
      '✓ src/App.test.tsx (2 tests) 54ms',
      'Tests  19 passed (19)',
    ].join('\\n');

    const currentWithEnotdir = [
      '> vitest run',
      '✓ src/App.test.tsx (2 tests) 61ms',
      'Tests  19 passed (19)',
      '⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯',
      'Error: ENOTDIR: not a directory, mkdir /workspace/node_modules',
      'Serialized Error: { errno: -20 }',
      '❯ Object.mkdir node:internal/fs/promises:857:10',
      '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯',
    ].join('\\n');

    fakeCheck('testcmd', baselineOutput, 1);
    runBaseline({ UI_CHECK_CMDS: join(BIN, 'testcmd') });

    fakeCheck('testcmd', currentWithEnotdir, 1);
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'testcmd') });

    assert.equal(r.code, 0, `Hook should NOT block on ENOTDIR noise. stderr: ${r.stderr}`);
  });

  test('real new error DOES block (regression detection preserved)', () => {
    const baselineOutput = 'qa/old.ts(1,1): error TS1234: old error';
    const currentOutput = 'qa/old.ts(1,1): error TS1234: old error\\nqa/new.ts(5,3): error TS2322: new error';

    fakeCheck('tsc', baselineOutput, 1);
    runBaseline({ UI_CHECK_CMDS: join(BIN, 'tsc') });

    fakeCheck('tsc', currentOutput, 1);
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'tsc') });

    assert.equal(r.code, 2, 'Hook should block on a real new error');
    assert.ok(r.stderr.includes('TS2322'), 'stderr should contain the new error');
    assert.ok(r.stderr.includes('Not done yet'), 'stderr should contain the block message');
  });

  test('all checks pass (exit 0) → no block', () => {
    fakeCheck('ok1', 'all good');
    fakeCheck('ok2', 'lgtm');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: `${join(BIN, 'ok1')};;${join(BIN, 'ok2')}` });
    assert.equal(r.code, 0);
  });

  test('no baseline file → strict fail on any non-zero exit', () => {
    fakeCheck('failing', 'something broke', 1);
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'failing') });
    assert.equal(r.code, 2, 'Should block when no baseline and check fails');
    assert.ok(r.stderr.includes('failed'), 'stderr should mention failure');
  });

  test('pre-existing error (identical to baseline) → no block', () => {
    const errorOutput = 'qa/file.ts(10,5): error TS9999: known issue';
    fakeCheck('tsc', errorOutput, 1);
    runBaseline({ UI_CHECK_CMDS: join(BIN, 'tsc') });

    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'tsc') });
    assert.equal(r.code, 0, 'Pre-existing error should not block');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Locked files
// ═════════════════════════════════════════════════════════════════════

describe('locked files', () => {
  test('blocks when acceptance test file is modified', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'tests/acceptance/shelf-grid.spec.ts' }];
}
export function fingerprint() { return 'abc'; }
`,
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 2, 'Should block on locked file modification');
    assert.ok(r.stderr.includes('Locked files'), 'stderr should mention locked files');
  });

  test('allows NEW screenshot baselines (status A)', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'A', path: 'e2e/__screenshots__/new-baseline.png' }];
}
export function fingerprint() { return 'abc'; }
`,
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 0, 'New screenshot baselines should be allowed');
  });

  test('blocks when screenshot baseline is modified (not added)', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'e2e/__screenshots__/existing.png' }];
}
export function fingerprint() { return 'abc'; }
`,
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 2, 'Modifying existing screenshot should block');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. QA report check
// ═════════════════════════════════════════════════════════════════════

describe('QA report', () => {
  test('no report + UI changes → no block (orchestrator handles QA)', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'src/App.tsx' }];
}
export function fingerprint() { return 'abc'; }
`,
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 0, 'No report + UI changes should not block');
  });

  test('stale report (fingerprint mismatch) → blocks', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'src/App.tsx' }];
}
export function fingerprint() { return 'MISMATCH'; }
`,
    );

    mkdirSync(join(WORK, '.ui-qa'), { recursive: true });
    writeFileSync(
      join(WORK, '.ui-qa/report.json'),
      JSON.stringify({
        base: 'abc123',
        fingerprint: 'OLD_FINGERPRINT',
        status: 'PASS',
        failures: [],
      }),
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 2, 'Stale QA report should block');
    assert.ok(r.stderr.includes('Code changed after'), 'stderr should mention stale report');
  });

  test('matching report with FAIL status → blocks', () => {
    const fp = 'matching_fp';
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'src/App.tsx' }];
}
export function fingerprint() { return '${fp}'; }
`,
    );

    mkdirSync(join(WORK, '.ui-qa'), { recursive: true });
    writeFileSync(
      join(WORK, '.ui-qa/report.json'),
      JSON.stringify({
        base: 'abc123',
        fingerprint: fp,
        status: 'FAIL',
        failures: [{ viewport: 'desktop', test: 'grid layout', error: 'misaligned' }],
      }),
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 2, 'Failing QA report should block');
    assert.ok(r.stderr.includes('FAIL'), 'stderr should mention FAIL');
  });

  test('QA check skipped during fix phase', () => {
    writeFileSync(
      join(SCRIPTS, 'fingerprint.mjs'),
      `
export function repoRoot() { return ${JSON.stringify(WORK)}; }
export function resolveBase() { return 'abc123'; }
export function changedWithStatus() {
  return [{ status: 'M', path: 'src/App.tsx' }];
}
export function fingerprint() { return 'any_fp'; }
`,
    );

    mkdirSync(join(WORK, '.ui-qa'), { recursive: true });
    writeFileSync(
      join(WORK, '.ui-qa/report.json'),
      JSON.stringify({ base: 'abc123', fingerprint: 'MISMATCH', status: 'FAIL', failures: [] }),
    );

    fakeCheck('ok', 'fine');
    writeFileSync(join(WORK, '.sandcastle-phase'), 'fix');
    const r = runHook({ UI_CHECK_CMDS: join(BIN, 'ok') });
    assert.equal(r.code, 0, 'QA check should be skipped during fix phase');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6. Backpressure limit (MAX_BLOCKS)
// ═════════════════════════════════════════════════════════════════════

describe('backpressure limit', () => {
  test('escalation message after max blocks, then lets agent stop', () => {
    fakeCheck('tsc', 'src/new.ts(1,1): error TS0000: boom', 1);
    writeFileSync(join(WORK, '.sandcastle-phase'), 'build');
    // No baseline → strict fail. Drive through MAX_BLOCKS attempts.
    const env = { UI_CHECK_CMDS: join(BIN, 'tsc'), UI_GUARD_MAX_BLOCKS: '3' };

    // First 3 blocks should exit 2 (blocking).
    for (let i = 0; i < 3; i++) {
      const r = runHook(env);
      assert.equal(r.code, 2, `Attempt ${i + 1} should block`);
    }

    // The 3rd block should include escalation language.
    // (Counter is 3 at this point, which === MAX_BLOCKS, triggering escalation.)

    // After exceeding max, hook should let the agent stop (exit 0).
    const final = runHook(env);
    assert.equal(final.code, 0, 'Should exit 0 after exceeding max blocks');
  });
});
