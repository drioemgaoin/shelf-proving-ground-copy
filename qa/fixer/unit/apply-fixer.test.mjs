#!/usr/bin/env node
/**
 * Tests for the apply-fixer.mjs script.
 *
 * Tests cover: finding validation, partial malformation, patch model
 * (content matching), processing order, verify failure + revert cascade,
 * T1 rejection cap, file-not-found → blocked, and finding-states.jsonl output.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
  readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  validateFinding,
  parseFindings,
  detectReportStatus,
  findCurrentInFile,
  applyPatch,
  sortFindings,
  processFindings,
} from '../../../scripts/apply-fixer.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => { passed++; }).catch((e) => {
        failed++;
        failures.push(`FAIL: ${label} — ${e.message}`);
      });
    }
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'apply-fixer-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function gitInit(cwd) {
  execFileSync('git', ['init'], { cwd, stdio: 'pipe' });
  execFileSync('git', ['-C', cwd, 'config', 'commit.gpgsign', 'false'], { stdio: 'pipe' });
  execFileSync('git', ['-C', cwd, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
  execFileSync('git', ['-C', cwd, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
}

function gitAdd(cwd) {
  execFileSync('git', ['add', '.'], { cwd, stdio: 'pipe' });
}

function gitCommitAll(cwd, msg) {
  execFileSync('git', ['commit', '-m', msg], { cwd, stdio: 'pipe', encoding: 'utf8' });
}

function readStates(statesPath) {
  if (!existsSync(statesPath)) return [];
  return readFileSync(statesPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// ─── Finding validation tests ───────────────────────────────────

const VALID_FINDING = {
  fileLine: 'src/App.css:42',
  cause: '[ui-base.md > Layout > No overflow] horizontal overflow on mobile',
  current: 'width: 100vw;',
  fix: 'width: 100%;',
  verify: 'npm run typecheck',
};

async function runAll() {

await test('validateFinding: valid finding passes', () => {
  const result = validateFinding(VALID_FINDING);
  assert(result.valid === true, `Expected valid, got ${JSON.stringify(result)}`);
});

await test('validateFinding: missing file:line', () => {
  const result = validateFinding({ ...VALID_FINDING, fileLine: '' });
  assert(result.valid === false, 'Expected invalid');
  assert(result.reason.includes('file:line'), `Expected file:line reason, got ${result.reason}`);
});

await test('validateFinding: malformed file:line (no line number)', () => {
  const result = validateFinding({ ...VALID_FINDING, fileLine: 'src/App.css' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: missing Cause', () => {
  const result = validateFinding({ ...VALID_FINDING, cause: '' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: malformed Cause (no brackets)', () => {
  const result = validateFinding({ ...VALID_FINDING, cause: 'just a description' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: missing Current', () => {
  const result = validateFinding({ ...VALID_FINDING, current: '' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: missing Fix', () => {
  const result = validateFinding({ ...VALID_FINDING, fix: '' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: Fix equals Current (no-op)', () => {
  const result = validateFinding({ ...VALID_FINDING, fix: 'width: 100vw;' });
  assert(result.valid === false, 'Expected invalid');
  assert(result.reason.includes('no-op'), `Expected no-op reason, got ${result.reason}`);
});

await test('validateFinding: missing Verify', () => {
  const result = validateFinding({ ...VALID_FINDING, verify: '' });
  assert(result.valid === false, 'Expected invalid');
});

await test('validateFinding: multi-target valid', () => {
  const finding = {
    fileLine: 'src/App.css:42',
    cause: '[ui-base.md > Layout > No overflow] fix both',
    verify: 'npm run typecheck',
    targets: [
      { fileLine: 'src/App.css:42', current: 'width: 100vw;', fix: 'width: 100%;' },
      { fileLine: 'src/App.css:50', current: 'height: 100vh;', fix: 'height: 100%;' },
    ],
  };
  const result = validateFinding(finding);
  assert(result.valid === true, `Expected valid, got ${JSON.stringify(result)}`);
});

await test('validateFinding: multi-target malformed (Fix equals Current)', () => {
  const finding = {
    fileLine: 'src/App.css:42',
    cause: '[ui-base.md > Layout > No overflow] fix both',
    verify: 'npm run typecheck',
    targets: [
      { fileLine: 'src/App.css:42', current: 'width: 100vw;', fix: 'width: 100vw;' },
      { fileLine: 'src/App.css:50', current: 'height: 100vh;', fix: 'height: 100%;' },
    ],
  };
  const result = validateFinding(finding);
  assert(result.valid === false, 'Expected invalid');
  assert(result.reason.includes('no-op'), `Expected no-op reason, got ${result.reason}`);
});

// ─── Report parser tests ────────────────────────────────────────

await test('detectReportStatus: PASS', () => {
  assert(detectReportStatus('PASS\nNo issues.') === 'PASS', 'Expected PASS');
});

await test('detectReportStatus: CLEAN', () => {
  assert(detectReportStatus('CLEAN\nNo issues found.') === 'CLEAN', 'Expected CLEAN');
});

await test('detectReportStatus: DEFER', () => {
  assert(detectReportStatus('DEFER\n- description') === 'DEFER', 'Expected DEFER');
});

await test('detectReportStatus: FINDINGS returns null', () => {
  assert(detectReportStatus('FINDINGS\n- src/App.css:42') === null, 'Expected null');
});

await test('parseFindings: single finding', () => {
  const text = `FINDINGS
- src/App.css:42 \`.shelf\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: npm run typecheck
`;
  const findings = parseFindings(text);
  assert(findings.length === 1, `Expected 1 finding, got ${findings.length}`);
  assert(findings[0].fileLine === 'src/App.css:42', `Expected file:line, got ${findings[0].fileLine}`);
  assert(findings[0].cause.includes('[ui-base.md'), `Expected cause, got ${findings[0].cause}`);
  assert(findings[0].current === 'width: 100vw;', `Expected current, got ${findings[0].current}`);
  assert(findings[0].fix === 'width: 100%;', `Expected fix, got ${findings[0].fix}`);
  assert(findings[0].verify === 'npm run typecheck', `Expected verify, got ${findings[0].verify}`);
});

await test('parseFindings: multiple findings', () => {
  const text = `FINDINGS
- src/App.css:42 \`.shelf\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: npm run typecheck
- src/App.tsx:10 \`App\`
  Cause: [CODING_STANDARDS.md > Style > Explicit] unclear naming
  Current: const x = 1;
  Fix: const count = 1;
  Verify: npm run test
`;
  const findings = parseFindings(text);
  assert(findings.length === 2, `Expected 2 findings, got ${findings.length}`);
});

// ─── Patch model tests ──────────────────────────────────────────

await test('findCurrentInFile: exact match at hinted line', () => {
  const content = 'line1\nline2\nwidth: 100vw;\nline4\n';
  const idx = findCurrentInFile(content, 'width: 100vw;', 3);
  assert(idx !== -1, 'Expected match');
  assert(content.slice(idx, idx + 'width: 100vw;'.length) === 'width: 100vw;', 'Expected exact match');
});

await test('findCurrentInFile: match not at hinted line, found elsewhere', () => {
  const content = 'line1\nline2\nline3\nline4\nwidth: 100vw;\nline6\n';
  // Hint at line 2, but text is at line 5
  const idx = findCurrentInFile(content, 'width: 100vw;', 2);
  assert(idx !== -1, 'Expected match via full-file search');
});

await test('findCurrentInFile: not found anywhere', () => {
  const content = 'line1\nline2\nline3\n';
  const idx = findCurrentInFile(content, 'not-here', 1);
  assert(idx === -1, 'Expected -1');
});

await test('applyPatch: replaces current with fix', () => {
  const content = 'before\nwidth: 100vw;\nafter\n';
  const idx = content.indexOf('width: 100vw;');
  const result = applyPatch(content, 'width: 100vw;', 'width: 100%;', idx);
  assert(result.includes('width: 100%;'), 'Expected fix applied');
  assert(!result.includes('width: 100vw;'), 'Expected original removed');
});

// ─── Sort order tests ───────────────────────────────────────────

await test('sortFindings: by priority, then file, then reverse line', () => {
  const findings = [
    { fileLine: 'src/a.ts:10', priority: 2 },
    { fileLine: 'src/a.ts:20', priority: 2 },
    { fileLine: 'src/b.ts:5', priority: 1 },
    { fileLine: 'src/a.ts:5', priority: 2 },
  ];
  const sorted = sortFindings(findings);
  // Priority 1 first
  assert(sorted[0].fileLine === 'src/b.ts:5', `Expected src/b.ts:5 first, got ${sorted[0].fileLine}`);
  // Then priority 2, file a.ts, reverse line order (20, 10, 5)
  assert(sorted[1].fileLine === 'src/a.ts:20', `Expected src/a.ts:20, got ${sorted[1].fileLine}`);
  assert(sorted[2].fileLine === 'src/a.ts:10', `Expected src/a.ts:10, got ${sorted[2].fileLine}`);
  assert(sorted[3].fileLine === 'src/a.ts:5', `Expected src/a.ts:5, got ${sorted[3].fileLine}`);
});

// ─── Integration: mixed report → valid applied + committed, malformed skipped ──

await test('mixed report: valid applied + committed, malformed skipped', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n  color: red;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/app.css:3
  Cause: bad cause no brackets
  Current: color: red;
  Fix: color: blue;
  Verify: echo "ok"
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.applied === 1, `Expected 1 applied, got ${result.applied}`);
  assert(result.skipped === 1, `Expected 1 skipped, got ${result.skipped}`);

  // Check finding-states.jsonl
  const states = readStates(statesPath);
  assert(states.length >= 1, `Expected at least 1 state entry, got ${states.length}`);
  const malformedState = states.find((s) => s.state === 'malformed');
  assert(malformedState !== undefined, 'Expected malformed state entry');

  // Check file was patched
  const patched = readFileSync(join(tmp, 'src/app.css'), 'utf8');
  assert(patched.includes('width: 100%;'), 'Expected fix applied');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: Current not found → blocked ───────────────────

await test('Current not found → blocked', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  color: blue;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.blocked === 1, `Expected 1 blocked, got ${result.blocked}`);

  const states = readStates(statesPath);
  const blockedState = states.find((s) => s.state === 'blocked');
  assert(blockedState !== undefined, 'Expected blocked state entry');
  assert(blockedState.detail.includes('not found'), `Expected "not found" detail, got ${blockedState.detail}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: file not found → blocked ──────────────────────

await test('file not found on disk → blocked', async () => {
  const tmp = makeTempProject({
    'findings.md': `FINDINGS
- src/missing.css:2 \`.gone\`
  Cause: [ui-base.md > Layout > No overflow] file removed
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.blocked === 1, `Expected 1 blocked, got ${result.blocked}`);

  const states = readStates(statesPath);
  const blockedState = states.find((s) => s.state === 'blocked');
  assert(blockedState !== undefined, 'Expected blocked state entry');
  assert(blockedState.detail.includes('file not found'), `Expected "file not found" detail, got ${blockedState.detail}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: verify fails → reverted ───────────────────────

await test('verify fails → reverted', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: exit 1
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  assert(result.reverted >= 1, `Expected at least 1 reverted, got ${result.reverted}`);

  // File should be reverted
  const content = readFileSync(join(tmp, 'src/app.css'), 'utf8');
  assert(content.includes('width: 100vw;'), 'Expected file reverted to original');

  const states = readStates(statesPath);
  const revertedState = states.find((s) => s.state === 'reverted');
  assert(revertedState !== undefined, 'Expected reverted state entry');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: verify passes → committed ─────────────────────

await test('verify passes → committed with correct prefix', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  assert(result.committed === 1, `Expected 1 committed, got ${result.committed}`);

  // Check git log for commit message
  const log = execFileSync('git', ['log', '--oneline', '-1'], {
    cwd: tmp, encoding: 'utf8',
  });
  assert(log.includes('fix(review-r1)'), `Expected commit prefix, got ${log}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: 3 T1 rejections → t1-conflict settled ────────

await test('3 T1 rejections → t1-conflict settled', async () => {
  // Create a verify script that outputs T1 and fails
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'verify.sh': '#!/bin/sh\necho "T1 rejection: rule conflict" >&2\nexit 1\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: sh verify.sh
`,
  });
  execFileSync('chmod', ['+x', join(tmp, 'verify.sh')], { stdio: 'pipe' });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');

  // Single call — the T1 retry loop retries up to 3 times internally
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  assert(result.settled === 1, `Expected 1 settled, got ${result.settled}`);

  const states = readStates(statesPath);
  const settledState = states.find((s) => s.state === 'settled');
  assert(settledState !== undefined, `Expected settled state. States: ${JSON.stringify(states.map((s) => s.state))}`);
  assert(settledState.detail.includes('t1-conflict'), `Expected t1-conflict detail, got ${settledState.detail}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: ALL malformed → escalate malformed-report ─────

await test('ALL malformed → escalate malformed-report', async () => {
  const tmp = makeTempProject({
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: bad cause no brackets
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/app.css:5 \`div\`
  Cause: also bad no brackets
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.escalation === 'malformed-report', `Expected malformed-report escalation, got ${result.escalation}`);
  assert(result.exitCode === 1, `Expected exit 1, got ${result.exitCode}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: PASS/CLEAN/DEFER report → no action ───────────

await test('PASS report → no action, exit 0', async () => {
  const tmp = makeTempProject({
    'findings.md': 'PASS\nNo issues found.\n',
  });

  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
  });

  assert(result.status === 'PASS', `Expected PASS status, got ${result.status}`);
  assert(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: finding-states.jsonl has required fields ──────

await test('finding-states.jsonl has required fields', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  const states = readStates(statesPath);
  assert(states.length >= 1, 'Expected at least 1 state');

  const s = states[0];
  assert(s.runId === 'test-run', `Expected runId=test-run, got ${s.runId}`);
  assert(s.findingId !== undefined, 'Expected findingId');
  assert(s.ruleId !== undefined, 'Expected ruleId');
  assert(s.fileLine !== undefined, 'Expected fileLine');
  assert(s.state !== undefined, 'Expected state');
  assert(s.round === 1, `Expected round=1, got ${s.round}`);
  assert(s.gate === 'review', `Expected gate=review, got ${s.gate}`);
  assert(s.timestamp !== undefined, 'Expected timestamp');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Integration: verify cascade ────────────────────────────────

await test('revert cascade: second finding revert triggers cascade re-verify', async () => {
  // Set up two findings in same file.
  // First succeeds, second fails verification → cascade should re-check first.
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n  height: 100vh;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:3 \`body\`
  Cause: [ui-base.md > Layout > No overflow] height overflow
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: echo "ok"
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] width overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: exit 1
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  // At least one reverted
  assert(result.reverted >= 1, `Expected at least 1 reverted, got ${result.reverted}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-36e: Within file: reverse line order ───────────────────

await test('UC-36e: sortFindings same file reverse line order', () => {
  const findings = [
    { fileLine: 'src/a.ts:10', priority: 2 },
    { fileLine: 'src/a.ts:20', priority: 2 },
  ];
  const sorted = sortFindings(findings);
  assert(sorted[0].fileLine === 'src/a.ts:20', `Expected line 20 first, got ${sorted[0].fileLine}`);
  assert(sorted[1].fileLine === 'src/a.ts:10', `Expected line 10 second, got ${sorted[1].fileLine}`);
});

// ─── UC-37b: T2-relayed findings default to priority 2 ─────────

await test('UC-37b: parseFindings defaults priority to 2', () => {
  const text = `FINDINGS
- src/app.css:5 \`.card\`
  Cause: [ui-base.md > Layout > No overflow] overflow issue
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`;
  const findings = parseFindings(text);
  assert(findings.length === 1, `Expected 1 finding, got ${findings.length}`);
  assert(findings[0].priority === 2, `Expected priority 2, got ${findings[0].priority}`);
});

// ─── UC-38j: Two findings in different files both applied ───────

await test('UC-38j: two findings in different files both applied via processFindings', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'src/layout.css': 'main {\n  height: 100vh;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] fix width
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/layout.css:2 \`main\`
  Cause: [ui-base.md > Layout > No overflow] fix height
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.applied === 2, `Expected 2 applied, got ${result.applied}`);

  const patchedApp = readFileSync(join(tmp, 'src/app.css'), 'utf8');
  assert(patchedApp.includes('width: 100%;'), 'Expected app.css patched');
  assert(!patchedApp.includes('width: 100vw;'), 'Expected original removed from app.css');

  const patchedLayout = readFileSync(join(tmp, 'src/layout.css'), 'utf8');
  assert(patchedLayout.includes('height: 100%;'), 'Expected layout.css patched');
  assert(!patchedLayout.includes('height: 100vh;'), 'Expected original removed from layout.css');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-39a: Verify timeout → kill + revert ────────────────────

await test('UC-39a: verify timeout kills and reverts', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: sleep 60
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 2000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  assert(result.reverted >= 1, `Expected at least 1 reverted, got ${result.reverted}`);

  // File should be reverted to original
  const content = readFileSync(join(tmp, 'src/app.css'), 'utf8');
  assert(content.includes('width: 100vw;'), 'Expected file reverted to original after timeout');

  const states = readStates(statesPath);
  const revertedState = states.find((s) => s.state === 'reverted' && s.detail === 'verify timed out');
  assert(revertedState !== undefined, 'Expected reverted state with "verify timed out" detail');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-40b: Git commit fails twice → infra-failure ────────────

await test('UC-40b: git commit fails twice → infra-failure exitCode 2', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  // Create a lock file to prevent git commits
  writeFileSync(join(tmp, '.git/index.lock'), 'locked');

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  assert(result.exitCode === 2, `Expected exitCode 2, got ${result.exitCode}`);

  const states = readStates(statesPath);
  const infraState = states.find((s) => s.detail && s.detail.includes('infra-failure'));
  assert(infraState !== undefined, 'Expected infra-failure state entry');

  // Clean up lock file before rmSync
  try { rmSync(join(tmp, '.git/index.lock')); } catch { /* ignore */ }
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-43e: Terminal states don't transition ───────────────────

await test('UC-43e: terminal state (blocked) has no further transitions', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  color: blue;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`,
  });
  gitInit(tmp);
  gitAdd(tmp);
  gitCommitAll(tmp, 'init');

  const statesPath = join(tmp, 'finding-states.jsonl');
  await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  const states = readStates(statesPath);
  const findingStates = states.filter((s) => s.findingId === 'src/app.css:2');
  assert(findingStates.length >= 1, 'Expected at least 1 state entry');

  // The last state should be blocked (terminal)
  const lastState = findingStates[findingStates.length - 1];
  assert(lastState.state === 'blocked', `Expected terminal state blocked, got ${lastState.state}`);

  // No state after blocked for this finding
  const statesAfterBlocked = findingStates.filter((s, i) => {
    if (i === 0) return false;
    return findingStates[i - 1].state === 'blocked';
  });
  assert(statesAfterBlocked.length === 0, `Expected no transitions after blocked, got ${statesAfterBlocked.length}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-56b: FINDINGS report with findings list parsed correctly ─

await test('UC-56b: FINDINGS report extracts findings list', () => {
  const text = `FINDINGS
- src/app.css:42 \`.shelf\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: npm run typecheck
- src/app.css:50 \`.card\`
  Cause: [ui-base.md > Layout > No overflow] vertical overflow
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: npm run typecheck
`;
  // detectReportStatus returns null for FINDINGS (not PASS/CLEAN/DEFER)
  const status = detectReportStatus(text);
  assert(status === null, `Expected null for FINDINGS, got ${status}`);

  // parseFindings extracts both findings
  const findings = parseFindings(text);
  assert(findings.length === 2, `Expected 2 findings, got ${findings.length}`);
  assert(findings[0].fileLine === 'src/app.css:42', `Expected first fileLine, got ${findings[0].fileLine}`);
  assert(findings[1].fileLine === 'src/app.css:50', `Expected second fileLine, got ${findings[1].fileLine}`);
});

// ─── UC-56d: FINDINGS with zero findings → malformed-report ─────

await test('UC-56d: FINDINGS header with zero parseable findings → malformed-report', async () => {
  const tmp = makeTempProject({
    'findings.md': 'FINDINGS\n\nSome random text that is not a finding.\n',
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.escalation === 'malformed-report', `Expected malformed-report, got ${result.escalation}`);
  assert(result.exitCode === 1, `Expected exitCode 1, got ${result.exitCode}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-56e: Unparseable output → DEFER ─────────────────────────

await test('UC-56e: unparseable report output → DEFER status', async () => {
  const tmp = makeTempProject({
    'findings.md': 'Some random output\nthat does not start with PASS, CLEAN, DEFER, or FINDINGS.\n',
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.status === 'DEFER', `Expected DEFER status, got ${result.status}`);
  assert(result.escalation === 'gate-defer', `Expected gate-defer escalation, got ${result.escalation}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-42a: Partial revert failure → infra-failure ─────────────

await test('UC-42a: file deleted during processing → blocked gracefully', async () => {
  // Test that when a file referenced in findings doesn't exist,
  // processing handles it as blocked rather than crashing.
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] fix width
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/deleted.css:2 \`gone\`
  Cause: [ui-base.md > Layout > No overflow] fix deleted file
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  // The deleted file finding should be blocked, the existing file finding should be applied
  assert(result.blocked === 1, `Expected 1 blocked, got ${result.blocked}`);
  assert(result.applied === 1, `Expected 1 applied, got ${result.applied}`);

  const states = readStates(statesPath);
  const blockedState = states.find((s) => s.state === 'blocked' && s.fileLine === 'src/deleted.css:2');
  assert(blockedState !== undefined, 'Expected blocked state for deleted file');

  rmSync(tmp, { recursive: true, force: true });
});

// Print summary
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`apply-fixer tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

} // end runAll

runAll().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(2);
});
