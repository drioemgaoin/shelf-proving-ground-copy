#!/usr/bin/env node
/**
 * Tests for the apply-t3.mjs script.
 * Creates temporary project dirs with rules files and verifies
 * payload output, exit codes, and edge-case handling.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
  readFileSync, existsSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts/apply-t3.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'apply-t3-test-'));
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

function gitCommit(cwd, msg, opts) {
  return execFileSync('git', ['commit', ...(opts ?? []), '-m', msg], {
    cwd, stdio: 'pipe', encoding: 'utf8',
  });
}

function gitAdd(cwd) {
  execFileSync('git', ['add', '.'], { cwd, stdio: 'pipe' });
}

/** Set up a git repo with two commits, where diffRef changed the given file. */
function setupGitWithDiff(tmp, filePath, contentBefore, contentAfter) {
  gitInit(tmp);
  mkdirSync(join(tmp, join(filePath, '..')), { recursive: true });
  writeFileSync(join(tmp, filePath), contentBefore);
  gitAdd(tmp);
  gitCommit(tmp, 'init');
  writeFileSync(join(tmp, filePath), contentAfter);
  gitAdd(tmp);
  gitCommit(tmp, 'change');
}

/** Set up a git repo with one empty commit. */
function setupGitEmpty(tmp) {
  gitInit(tmp);
  gitCommit(tmp, 'init', ['--allow-empty']);
}

function runApplyT3(tmpDir, args) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
    cwd: tmpDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return { exitCode: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function readPayloads(tmpDir, ticketId) {
  const dir = join(tmpDir, '.sandcastle', 'payloads', ticketId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
    .map((f) => ({ name: f, content: readFileSync(join(dir, f), 'utf8') }));
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

// ─── Minimal rules file with one visual-qa and one reviewer block ───

const RULES_WITH_BOTH_AGENTS = `# Test rules

- Visual check: states are correct.

  \`\`\`enforcement
  id: "vqa-states"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  instruction: "Check all interactive states are visually distinct."
  \`\`\`

- Code check: tokens used correctly.

  \`\`\`enforcement
  id: "rev-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  triage_hint: "Flag when: token variable referenced"
  instruction: "Check that each design token is used for its intended semantic role."
  \`\`\`
`;

// ─── Test: missing arguments → exit 2 ────────────────────────────

test('missing arguments → exit 2', () => {
  const tmp = makeTempProject({});
  const { exitCode } = runApplyT3(tmp, []);
  assert(exitCode === 2, `Expected exit 2, got ${exitCode}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('missing diffRef → exit 2', () => {
  const tmp = makeTempProject({});
  const { exitCode } = runApplyT3(tmp, ['ticket-03']);
  assert(exitCode === 2, `Expected exit 2, got ${exitCode}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: run with issueId + diffRef → payload files ────────────

test('produces payload files with correct instructions', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_BOTH_AGENTS,
  });
  setupGitWithDiff(tmp, 'src/foo.css', 'body { color: red; }', 'body { color: blue; }');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-03', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);

  const payloads = readPayloads(tmp, 'ticket-03');
  assert(payloads.length > 0, `Expected payload files, got ${payloads.length}`);

  const vqa = payloads.find((p) => p.name.includes('visual-qa'));
  assert(vqa !== undefined, `Expected visual-qa payload. Files: ${payloads.map((p) => p.name).join(', ')}`);
  assert(vqa.content.includes('Check all interactive states'), `Expected instruction in visual-qa payload`);

  const rev = payloads.find((p) => p.name.includes('reviewer'));
  assert(rev !== undefined, `Expected reviewer payload. Files: ${payloads.map((p) => p.name).join(', ')}`);
  assert(rev.content.includes('design token'), `Expected instruction in reviewer payload`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: zero matching rules → "No T3 rules apply" literal ─────

test('zero matching T3 rules → "No T3 rules apply" literal', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- A T1 rule only.

  \`\`\`enforcement
  id: "t1-only"
  tier: T1
  scope: "src/**/*.ts"
  pattern: "badThing"
  rule: "No bad things"
  fix: "Remove it"
  \`\`\`
`,
  });
  setupGitWithDiff(tmp, 'src/foo.ts', 'const x = 1;', 'const x = 2;');

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const payloads = readPayloads(tmp, 'ticket-03');
  const allContent = payloads.map((p) => p.content).join('\n');
  assert(
    allContent.includes('No T3 rules apply to this evaluation.'),
    `Expected "No T3 rules apply to this evaluation." literal in payloads. Got: ${allContent}`,
  );

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: budget exceeded → exit 1 ──────────────────────────────

test('visual-qa single group > 80 → exit 1', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 81; i++) {
    rules += `- VQA rule ${i}.

  \`\`\`enforcement
  id: "vqa-${i}"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  instruction: "Check state ${i} is correct."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitEmpty(tmp);

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD']);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  rmSync(tmp, { recursive: true, force: true });
});

test('total T3 > 300 → exit 1', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 301; i++) {
    rules += `- Review rule ${i}.

  \`\`\`enforcement
  id: "rev-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  instruction: "Check rule ${i}."
  triage_hint: "rule ${i}"
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD~1']);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: reviewer scope-gating excludes non-matching ───────────

test('reviewer scope-gating excludes non-matching rules', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- CSS-only rule.

  \`\`\`enforcement
  id: "rev-css"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  triage_hint: "Flag when: CSS changed"
  instruction: "Check CSS tokens."
  \`\`\`

- TS-only rule.

  \`\`\`enforcement
  id: "rev-ts"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  group: code
  triage_hint: "Flag when: TS changed"
  instruction: "Check TS code."
  \`\`\`
`,
  });
  setupGitWithDiff(tmp, 'src/foo.css', 'body {}', 'body { color: red; }');

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const payloads = readPayloads(tmp, 'ticket-03');
  const rev = payloads.find((p) => p.name.includes('reviewer'));
  assert(rev !== undefined, 'Expected reviewer payload');
  assert(rev.content.includes('Check CSS tokens'), 'Expected CSS rule in payload');
  assert(!rev.content.includes('Check TS code'), 'Expected TS rule excluded from payload');

  const excPath = join(tmp, '.sandcastle', 'payloads', 'ticket-03', 'triage-exclusions.jsonl');
  assert(existsSync(excPath), 'Expected triage-exclusions.jsonl');
  const excContent = readFileSync(excPath, 'utf8');
  assert(excContent.includes('rev-ts'), 'Expected excluded rule in triage-exclusions.jsonl');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: unrecognized agent → skipped with warning ──────────────

test('unrecognized agent → skipped with warning', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Unknown agent rule.

  \`\`\`enforcement
  id: "unknown-agent"
  tier: T3
  agent: some-unknown-agent
  scope: "*"
  group: misc
  instruction: "This should be skipped."
  \`\`\`
`,
  });
  setupGitEmpty(tmp);

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-03', 'HEAD']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
  assert(stderr.includes('unrecognized agent') || stderr.includes('some-unknown-agent'),
    `Expected warning about unrecognized agent. stderr: ${stderr}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: out-of-range priority → default 2, warning ────────────

test('out-of-range priority → default 2, warning', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Bad priority rule.

  \`\`\`enforcement
  id: "bad-priority"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  priority: 99
  instruction: "Check states."
  \`\`\`
`,
  });
  setupGitEmpty(tmp);

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-03', 'HEAD']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
  assert(stderr.includes('priority') || stderr.includes('default'),
    `Expected warning about priority. stderr: ${stderr}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: payload directory cleared before writing ───────────────

test('payload directory cleared before writing', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_BOTH_AGENTS,
  });
  setupGitWithDiff(tmp, 'src/foo.css', 'body {}', 'body { x: 1; }');

  const payloadDir = join(tmp, '.sandcastle', 'payloads', 'ticket-03');
  mkdirSync(payloadDir, { recursive: true });
  writeFileSync(join(payloadDir, 'old-stale-file.txt'), 'stale content');

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
  assert(!existsSync(join(payloadDir, 'old-stale-file.txt')), 'Expected old payload file to be removed');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: visual-qa > 80 total → split by group ─────────────────

test('visual-qa > 80 total → split by group', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 45; i++) {
    rules += `- VQA states rule ${i}.

  \`\`\`enforcement
  id: "vqa-states-${i}"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  instruction: "Check state ${i}."
  \`\`\`

`;
  }
  for (let i = 0; i < 45; i++) {
    rules += `- VQA layout rule ${i}.

  \`\`\`enforcement
  id: "vqa-layout-${i}"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: layout
  instruction: "Check layout ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitEmpty(tmp);

  const { exitCode } = runApplyT3(tmp, ['ticket-03', 'HEAD']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const payloads = readPayloads(tmp, 'ticket-03');
  const vqaPayloads = payloads.filter((p) => p.name.includes('visual-qa'));
  assert(vqaPayloads.length >= 2, `Expected multiple visual-qa payloads (one per group), got ${vqaPayloads.length}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Summary ────────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`apply-t3 tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
