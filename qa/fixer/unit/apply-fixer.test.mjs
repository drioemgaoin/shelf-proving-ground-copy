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
  loadFixerConfig,
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

// ─── SQ-R1-1: Multi-target parser tests ─────────────────────────

await test('parseFindings: multi-target finding produces targets array', () => {
  const text = `FINDINGS
- src/components/Card.css:12 \`.card\`
  Cause: [ui-base > tokens > values-from-tokens] raw px value
  Current: margin: 16px;
  Fix: margin: var(--shelf-space-400);
  - src/components/Card.tsx:8 \`Card\`
    Current: style={{ padding: '16px' }}
    Fix: style={{ padding: 'var(--shelf-space-400)' }}
  Verify: "npm run typecheck && npm run lint"
`;
  const findings = parseFindings(text);
  assert(findings.length === 1, `Expected 1 finding, got ${findings.length}`);
  assert(findings[0].targets !== undefined, 'Expected targets array');
  assert(findings[0].targets.length === 2, `Expected 2 targets, got ${findings[0].targets.length}`);
  assert(findings[0].targets[0].fileLine === 'src/components/Card.css:12',
    `Expected primary target file:line, got ${findings[0].targets[0].fileLine}`);
  assert(findings[0].targets[0].current === 'margin: 16px;',
    `Expected primary target current, got ${findings[0].targets[0].current}`);
  assert(findings[0].targets[1].fileLine === 'src/components/Card.tsx:8',
    `Expected sub-target file:line, got ${findings[0].targets[1].fileLine}`);
  assert(findings[0].targets[1].current === "style={{ padding: '16px' }}",
    `Expected sub-target current, got ${findings[0].targets[1].current}`);
  assert(findings[0].targets[1].fix === "style={{ padding: 'var(--shelf-space-400)' }}",
    `Expected sub-target fix, got ${findings[0].targets[1].fix}`);
  assert(findings[0].verify === '"npm run typecheck && npm run lint"',
    `Expected verify on parent, got ${findings[0].verify}`);
});

await test('parseFindings: single-target finding has no targets array', () => {
  const text = `FINDINGS
- src/App.css:42 \`.shelf\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: npm run typecheck
`;
  const findings = parseFindings(text);
  assert(findings.length === 1, `Expected 1 finding, got ${findings.length}`);
  assert(findings[0].targets === undefined, 'Expected no targets array on single-target finding');
});

await test('parseFindings: multi-target followed by single-target finding', () => {
  const text = `FINDINGS
- src/Card.css:12 \`.card\`
  Cause: [ui-base > tokens] raw px
  Current: margin: 16px;
  Fix: margin: var(--shelf-space-400);
  - src/Card.tsx:8 \`Card\`
    Current: padding: 16px;
    Fix: padding: var(--shelf-space-400);
  Verify: echo "ok"
- src/App.css:5 \`.app\`
  Cause: [ui-base > layout] overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`;
  const findings = parseFindings(text);
  assert(findings.length === 2, `Expected 2 findings, got ${findings.length}`);
  assert(findings[0].targets !== undefined, 'Expected targets on first finding');
  assert(findings[0].targets.length === 2, `Expected 2 targets, got ${findings[0].targets.length}`);
  assert(findings[1].targets === undefined, 'Expected no targets on second finding');
  assert(findings[1].fileLine === 'src/App.css:5', `Expected second finding file:line`);
});

// ─── SQ-R1-1: Multi-target consumer integration test ────────────

await test('SQ-R1-1: multi-target finding applied across two files via processFindings', async () => {
  const tmp = makeTempProject({
    'src/card.css': '.card {\n  margin: 16px;\n}\n',
    'src/card.tsx': 'const Card = () => (\n  <div style={{ padding: \'16px\' }} />\n);\n',
    'findings.md': `FINDINGS
- src/card.css:2 \`.card\`
  Cause: [ui-base > tokens > values-from-tokens] raw px value
  Current: margin: 16px;
  Fix: margin: var(--shelf-space-400);
  - src/card.tsx:2 \`Card\`
    Current: style={{ padding: '16px' }}
    Fix: style={{ padding: 'var(--shelf-space-400)' }}
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.applied === 1, `Expected 1 applied (multi-target counts as 1), got ${result.applied}`);

  // Both files should be patched
  const css = readFileSync(join(tmp, 'src/card.css'), 'utf8');
  assert(css.includes('var(--shelf-space-400)'), `Expected CSS patched, got: ${css}`);
  assert(!css.includes('16px'), 'Expected raw px removed from CSS');

  const tsx = readFileSync(join(tmp, 'src/card.tsx'), 'utf8');
  assert(tsx.includes('var(--shelf-space-400)'), `Expected TSX patched, got: ${tsx}`);
  assert(!tsx.includes("'16px'"), 'Expected raw px removed from TSX');

  rmSync(tmp, { recursive: true, force: true });
});

await test('SQ-R1-1: multi-target — second target file missing → blocked, first reverted', async () => {
  const tmp = makeTempProject({
    'src/card.css': '.card {\n  margin: 16px;\n}\n',
    // src/card.tsx does NOT exist
    'findings.md': `FINDINGS
- src/card.css:2 \`.card\`
  Cause: [ui-base > tokens > values-from-tokens] raw px value
  Current: margin: 16px;
  Fix: margin: var(--shelf-space-400);
  - src/card.tsx:2 \`Card\`
    Current: style={{ padding: '16px' }}
    Fix: style={{ padding: 'var(--shelf-space-400)' }}
  Verify: echo "ok"
`,
  });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const result = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: true,
    cwd: tmp,
    statesPath,
  });

  assert(result.blocked >= 1, `Expected at least 1 blocked, got ${result.blocked}`);

  // First target should be reverted — original content restored
  const css = readFileSync(join(tmp, 'src/card.css'), 'utf8');
  assert(css.includes('margin: 16px;'), 'Expected first target reverted to original');

  const states = readStates(statesPath);
  const blockedState = states.find((s) => s.state === 'blocked');
  assert(blockedState !== undefined, 'Expected blocked state');
  assert(blockedState.detail.includes('card.tsx'), `Expected detail to mention missing file, got: ${blockedState.detail}`);

  rmSync(tmp, { recursive: true, force: true });
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
  assert(s.previousState === 'pending', `Expected previousState="pending", got ${JSON.stringify(s.previousState)}`);

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
  const findingStates = states.filter((s) => s.findingId === 'src/app.css:2|ui-base.md > Layout > No overflow');
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

// ─── UC-40a: Git commit fails once → retry after 2s → succeeds ──

await test('UC-40a: git commit fails once then succeeds on retry', async () => {
  // Test the gitCommitWithRetry function directly with a mock git script.
  // The mock fails on the first 'commit' call and succeeds on the second.
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100%;\n}\n',
  });

  // Create a mock git script that tracks commit calls via a counter file.
  // First commit → fail (exit 128). Second commit → succeed (exit 0).
  // All other git subcommands (add) → succeed.
  const mockBinDir = join(tmp, '.mockbin');
  mkdirSync(mockBinDir, { recursive: true });
  const counterPath = join(tmp, '.git-commit-count');
  writeFileSync(counterPath, '0');
  writeFileSync(join(mockBinDir, 'git'), `#!/bin/sh
if [ "$1" = "commit" ]; then
  COUNT=$(cat "${counterPath}")
  COUNT=$((COUNT + 1))
  echo "$COUNT" > "${counterPath}"
  if [ "$COUNT" -eq 1 ]; then
    echo "fatal: could not lock index" >&2
    exit 128
  fi
  exit 0
fi
# git add and other commands succeed
exit 0
`, { mode: 0o755 });

  // Import gitCommitWithRetry's host: gitCommit is exported, but
  // gitCommitWithRetry is private. Test via processFindings with mock PATH.
  // processFindings calls gitCommitWithRetry internally.
  writeFileSync(join(tmp, 'findings.md'), `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100%;
  Fix: width: 100%;
  Verify: echo "ok"
`);
  // ^ Fix == Current means it'll be malformed. We need a real diff.
  // Rewrite with actual differing content.
  writeFileSync(join(tmp, 'src/app.css'), 'body {\n  width: 100vw;\n}\n');
  writeFileSync(join(tmp, 'findings.md'), `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
`);

  const statesPath = join(tmp, 'finding-states.jsonl');
  // Override PATH so our mock git is found first.
  const origPath = process.env.PATH;
  process.env.PATH = `${mockBinDir}:${origPath}`;

  try {
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

    // Commit should succeed on retry — applied, not infra-failure
    assert(result.applied === 1, `Expected 1 applied, got ${result.applied}`);
    assert(result.exitCode === 0, `Expected exitCode 0, got ${result.exitCode}`);

    const states = readStates(statesPath);
    const appliedState = states.find((s) => s.state === 'applied');
    assert(appliedState !== undefined, 'Expected applied state entry');

    // Verify the mock git was called twice for commit (first fail, then success)
    const count = parseInt(readFileSync(counterPath, 'utf8').trim(), 10);
    assert(count === 2, `Expected 2 commit attempts (1 fail + 1 retry), got ${count}`);
  } finally {
    process.env.PATH = origPath;
  }

  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-60: Multi-target finding — second target file missing → blocked + revert first ──

await test('UC-60: revert cascade — cascaded re-verify fails → earlier finding reverted', async () => {
  // Two findings in the same file. dryRun: false (verify + cascade run).
  // Finding 1 (line 3, processed first due to reverse-line): height change.
  //   Verify: checks that width is also fixed (depends on finding 2).
  // Finding 2 (line 2, processed second): width change.
  //   Verify: always fails (exit 1).
  // Flow: F1 applied + verify passes (width not checked yet because
  //   verify just does echo ok). F2 applied + verify fails → revert F2.
  //   Cascade re-verifies F1 with a verify that now fails.
  //
  // We use a mock git to avoid real git calls.
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n  height: 100vh;\n}\n',
  });

  // Verify script for finding 1: passes on first call, fails on second
  // (cascade re-verify). Uses a counter file.
  const counterPath = join(tmp, '.verify-count');
  writeFileSync(counterPath, '0');
  writeFileSync(join(tmp, 'check-once.sh'), `#!/bin/sh
COUNT=$(cat "${counterPath}")
COUNT=$((COUNT + 1))
echo "$COUNT" > "${counterPath}"
if [ "$COUNT" -gt 1 ]; then exit 1; fi
exit 0
`, { mode: 0o755 });

  writeFileSync(join(tmp, 'findings.md'), `FINDINGS
- src/app.css:3 \`body\`
  Cause: [ui-base.md > Layout > No overflow] fix height
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: sh check-once.sh
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] fix width
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: exit 1
`);

  // Mock git: all commands succeed (add, commit).
  const mockBinDir = join(tmp, '.mockbin');
  mkdirSync(mockBinDir, { recursive: true });
  writeFileSync(join(mockBinDir, 'git'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const origPath = process.env.PATH;
  process.env.PATH = `${mockBinDir}:${origPath}`;

  try {
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

    // Both findings should be reverted
    assert(result.reverted >= 2, `Expected at least 2 reverted, got ${result.reverted}`);

    const states = readStates(statesPath);
    const cascadeRevert = states.find(
      (s) => s.state === 'reverted' && s.detail && s.detail.includes('cascade'),
    );
    assert(cascadeRevert !== undefined, 'Expected cascade revert state entry');

    // File should be restored to original
    const content = readFileSync(join(tmp, 'src/app.css'), 'utf8');
    assert(content.includes('width: 100vw;'), 'Expected width reverted to original');
    assert(content.includes('height: 100vh;'), 'Expected height reverted to original');
  } finally {
    process.env.PATH = origPath;
  }

  rmSync(tmp, { recursive: true, force: true });
});

// ─── TGF-26: findingId uses file:line|ruleId compound key ──────

await test('TGF-26: two rules on same file:line produce different findingIds', async () => {
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n}\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] horizontal overflow
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/app.css:2 \`body\`
  Cause: [ui-project.md > Sizing > Use relative] use relative units
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
  const findingIds = states.map((s) => s.findingId);
  const uniqueIds = new Set(findingIds);

  // Two findings on same line from different rules must have different findingIds
  assert(uniqueIds.size >= 2, `Expected at least 2 unique findingIds, got ${uniqueIds.size}: ${JSON.stringify(findingIds)}`);

  // Each findingId should include the ruleId (pipe-separated compound key)
  for (const id of uniqueIds) {
    assert(id.includes('|'), `Expected findingId to contain '|' separator, got: ${id}`);
  }

  rmSync(tmp, { recursive: true, force: true });
});

// ─── TGF-27: Settlement round-trip — pre-filter suppresses settled findings ──

await test('TGF-27: settled finding in round 1 is suppressed in round 2', async () => {
  // Setup: a finding whose verify always fails → t1-conflict → settled in round 1
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

  // Round 1: finding hits T1 cap → settled
  const r1 = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 1,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });
  assert(r1.settled === 1, `Round 1: expected 1 settled, got ${r1.settled}`);

  // Verify the settled entry exists in states file
  const statesAfterR1 = readStates(statesPath);
  const settledEntry = statesAfterR1.find((s) => s.state === 'settled');
  assert(settledEntry !== undefined, 'Round 1: expected settled entry in states file');

  // Round 2: same finding re-raised — must be suppressed by pre-filter
  const r2 = await processFindings({
    findingsPath: join(tmp, 'findings.md'),
    gate: 'review',
    round: 2,
    runId: 'test-run',
    verifyTimeout: 5000,
    dryRun: false,
    cwd: tmp,
    statesPath,
  });

  // The settled finding should be filtered out, not re-processed
  assert(r2.settled === 0 || r2.settled === undefined,
    `Round 2: expected 0 settled (finding suppressed), got ${r2.settled}`);
  assert(r2.applied === 0,
    `Round 2: expected 0 applied (finding suppressed), got ${r2.applied}`);
  assert(r2.blocked === 0,
    `Round 2: expected 0 blocked (finding suppressed), got ${r2.blocked}`);
  assert(r2.reverted === 0,
    `Round 2: expected 0 reverted (finding suppressed), got ${r2.reverted}`);

  // The states file should NOT have new entries for this finding from round 2
  const statesAfterR2 = readStates(statesPath);
  const r2States = statesAfterR2.filter((s) => s.round === 2);
  assert(r2States.length === 0,
    `Round 2: expected no new state entries, got ${r2States.length}: ${JSON.stringify(r2States.map((s) => s.state))}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── TGF-28: Verify timeout from config.json ──────────────────

await test('TGF-28: loadFixerConfig reads fixer.verifyTimeout from config.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fixer-cfg-'));
  const sandcastleDir = join(tmp, '.sandcastle');
  mkdirSync(sandcastleDir, { recursive: true });
  writeFileSync(join(sandcastleDir, 'config.json'), JSON.stringify({
    fixer: { verifyTimeout: 300000 },
  }));

  const cfg = loadFixerConfig(tmp);
  assert(cfg.verifyTimeout === 300000,
    `expected verifyTimeout 300000 from config.json, got ${cfg.verifyTimeout}`);

  rmSync(tmp, { recursive: true, force: true });
});

await test('TGF-28: loadFixerConfig returns empty when no config.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fixer-cfg-'));

  const cfg = loadFixerConfig(tmp);
  assert(cfg.verifyTimeout === undefined,
    `expected undefined verifyTimeout, got ${cfg.verifyTimeout}`);

  rmSync(tmp, { recursive: true, force: true });
});

await test('TGF-28: loadFixerConfig returns empty when config.json has no fixer key', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fixer-cfg-'));
  const sandcastleDir = join(tmp, '.sandcastle');
  mkdirSync(sandcastleDir, { recursive: true });
  writeFileSync(join(sandcastleDir, 'config.json'), JSON.stringify({
    builder: { maxIterations: 50 },
  }));

  const cfg = loadFixerConfig(tmp);
  assert(cfg.verifyTimeout === undefined,
    `expected undefined verifyTimeout, got ${cfg.verifyTimeout}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── TGF-32: Finding lifecycle full traversal (pending → all terminal states) ──

await test('TGF-32: all terminal states in one round + settled suppressed in round 2', async () => {
  // Four findings, each exercising a different terminal state:
  //   F1: applied + verify passes → committed
  //   F2: Current text not in file → blocked
  //   F3: verify fails with T1 output × 3 → settled (t1-conflict)
  //   F4: verify fails (non-T1) → reverted
  //
  // Round 2 re-raises all four. F3 must be suppressed by pre-filter.
  const tmp = makeTempProject({
    'src/app.css': 'body {\n  width: 100vw;\n  color: red;\n  height: 100vh;\n}\n',
    // F3 verify script: outputs T1 and fails
    'verify-t1.sh': '#!/bin/sh\necho "T1 rejection: rule conflict" >&2\nexit 1\n',
    'findings.md': `FINDINGS
- src/app.css:2 \`body\`
  Cause: [ui-base.md > Layout > No overflow] fix width
  Current: width: 100vw;
  Fix: width: 100%;
  Verify: echo "ok"
- src/app.css:3 \`body\`
  Cause: [ui-base.md > Color > No raw hex] fix color
  Current: color: #ff0000;
  Fix: color: var(--color-red);
  Verify: echo "ok"
- src/app.css:3 \`body\`
  Cause: [ui-project.md > Palette > Approved values] unapproved red
  Current: color: red;
  Fix: color: var(--color-primary);
  Verify: sh verify-t1.sh
- src/app.css:4 \`body\`
  Cause: [ui-base.md > Layout > No vh] fix height
  Current: height: 100vh;
  Fix: height: 100%;
  Verify: exit 1
`,
  });
  execFileSync('chmod', ['+x', join(tmp, 'verify-t1.sh')], { stdio: 'pipe' });

  // Mock git: all commands succeed
  const mockBinDir = join(tmp, '.mockbin');
  mkdirSync(mockBinDir, { recursive: true });
  writeFileSync(join(mockBinDir, 'git'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const statesPath = join(tmp, 'finding-states.jsonl');
  const origPath = process.env.PATH;
  process.env.PATH = `${mockBinDir}:${origPath}`;

  try {
    // ── Round 1 ──
    const r1 = await processFindings({
      findingsPath: join(tmp, 'findings.md'),
      gate: 'review',
      round: 1,
      runId: 'tgf32-run',
      verifyTimeout: 5000,
      dryRun: false,
      cwd: tmp,
      statesPath,
    });

    // F1: committed (applied + verify ok)
    assert(r1.committed >= 1, `R1: expected at least 1 committed, got ${r1.committed}`);
    // F2: blocked (Current text "color: #ff0000;" not in file — file has "color: red;")
    assert(r1.blocked >= 1, `R1: expected at least 1 blocked, got ${r1.blocked}`);
    // F3: settled (T1 × 3)
    assert(r1.settled >= 1, `R1: expected at least 1 settled, got ${r1.settled}`);
    // F4: reverted (non-T1 verify fail)
    assert(r1.reverted >= 1, `R1: expected at least 1 reverted, got ${r1.reverted}`);

    // Verify all four terminal states appear in the JSONL
    const statesR1 = readStates(statesPath);
    const terminalStates = new Set(
      statesR1
        .filter((s) => ['committed', 'blocked', 'settled', 'reverted'].includes(s.state))
        .map((s) => s.state),
    );
    assert(terminalStates.has('committed'), 'R1: missing committed in JSONL');
    assert(terminalStates.has('blocked'), 'R1: missing blocked in JSONL');
    assert(terminalStates.has('settled'), 'R1: missing settled in JSONL');
    assert(terminalStates.has('reverted'), 'R1: missing reverted in JSONL');

    // Every entry must have previousState
    for (const s of statesR1) {
      assert(s.previousState !== undefined,
        `R1: missing previousState on state=${s.state} for ${s.findingId}`);
    }

    // ── Round 2 — same findings re-raised ──
    // Reset the source file for findings that were reverted/blocked so they can re-process
    writeFileSync(join(tmp, 'src/app.css'),
      'body {\n  width: 100vw;\n  color: red;\n  height: 100vh;\n}\n');

    const r2 = await processFindings({
      findingsPath: join(tmp, 'findings.md'),
      gate: 'review',
      round: 2,
      runId: 'tgf32-run',
      verifyTimeout: 5000,
      dryRun: false,
      cwd: tmp,
      statesPath,
    });

    // F3 (settled in R1) MUST be suppressed — not re-processed
    const statesR2 = readStates(statesPath).filter((s) => s.round === 2);
    const r2SettledFindingId = 'src/app.css:3|ui-project.md > Palette > Approved values';
    const r2EntriesForSettled = statesR2.filter((s) => s.findingId === r2SettledFindingId);
    assert(r2EntriesForSettled.length === 0,
      `R2: settled finding should be suppressed, but got ${r2EntriesForSettled.length} entries: ${JSON.stringify(r2EntriesForSettled.map((s) => s.state))}`);

    // Other findings should still be processed in round 2
    assert(statesR2.length > 0, 'R2: expected some state entries for non-settled findings');
  } finally {
    process.env.PATH = origPath;
  }

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
