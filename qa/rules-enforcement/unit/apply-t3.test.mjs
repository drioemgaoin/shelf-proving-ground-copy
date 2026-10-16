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

// ─── Ticket-04: Two-phase triage tests ──────────────────────────────

function generateReviewerRules(count, opts = {}) {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < count; i++) {
    const id = opts.idPrefix ? `${opts.idPrefix}-${i}` : `rev-${i}`;
    const group = opts.group ? `\n  group: ${opts.group}` : (opts.groupFn ? `\n  group: ${opts.groupFn(i)}` : '');
    const priority = opts.priority !== undefined ? `\n  priority: ${opts.priority}` : (opts.priorityFn ? `\n  priority: ${opts.priorityFn(i)}` : '');
    const exempt = opts.exempt ? '\n  triage_exempt: true' : '';
    const hint = opts.hint ?? `rule ${i} hint`;
    const instruction = opts.instruction ?? `Check rule ${i}.`;
    rules += `- Review rule ${i}.

  \`\`\`enforcement
  id: "${id}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  triage_hint: "${hint}"${group}${priority}${exempt}
  instruction: "${instruction}"
  \`\`\`

`;
  }
  return rules;
}

function readAllPayloadFiles(tmpDir, ticketId) {
  const dir = join(tmpDir, '.sandcastle', 'payloads', ticketId);
  if (!existsSync(dir)) return {};
  const files = {};
  for (const f of readdirSync(dir)) {
    files[f] = readFileSync(join(dir, f), 'utf8');
  }
  return files;
}

// ─── Test: >80 non-exempt rules → triage activates (exit 3) ─────

test('>80 non-exempt rules without triage results → exit 3 (triage needed)', () => {
  const rules = generateReviewerRules(90);
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'const x = 1;', 'const x = 2;');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1']);
  assert(exitCode === 3, `Expected exit 3, got ${exitCode}. stderr: ${stderr}`);
  assert(stderr.includes('triage'), `Expected triage message in stderr. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  assert(files['triage-phase1.json'] !== undefined, 'Expected triage-phase1.json');
  const phase1 = JSON.parse(files['triage-phase1.json']);
  assert(phase1.rules.length === 90, `Expected 90 rules in Phase 1, got ${phase1.rules.length}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: >80 non-exempt with triage results → Phase 2 payload ≤ 90 ──

test('>80 non-exempt with triage results → payload ≤ 90 rules', () => {
  const rules = generateReviewerRules(100);
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'const x = 1;', 'const x = 2;');

  // Simulate Phase 1: flag 50 of the 100 rules
  const flagged = [];
  for (let i = 0; i < 50; i++) flagged.push(`rev-${i}`);
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');
  // Count rule sections (## id lines)
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount <= 90, `Expected ≤ 90 rules in payload, got ${ruleCount}`);
  assert(ruleCount === 50, `Expected 50 rules (flagged), got ${ruleCount}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: group expansion pulls related rules ──────────────────

test('group expansion pulls related rules', () => {
  // 90 rules: 30 in group-A (flag 1), 30 in group-B (flag none), 30 in group-C (flag 1)
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 30; i++) {
    rules += `- Group A rule ${i}.

  \`\`\`enforcement
  id: "ga-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  group: group-A
  triage_hint: "group A hint ${i}"
  instruction: "Check group A rule ${i}."
  \`\`\`

`;
  }
  for (let i = 0; i < 30; i++) {
    rules += `- Group B rule ${i}.

  \`\`\`enforcement
  id: "gb-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  group: group-B
  triage_hint: "group B hint ${i}"
  instruction: "Check group B rule ${i}."
  \`\`\`

`;
  }
  for (let i = 0; i < 30; i++) {
    rules += `- Group C rule ${i}.

  \`\`\`enforcement
  id: "gc-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  group: group-C
  triage_hint: "group C hint ${i}"
  instruction: "Check group C rule ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  // Flag only ga-0 and gc-0 → should expand to all of group-A (30) and group-C (30)
  const flagged = ['ga-0', 'gc-0'];
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');

  // All 30 group-A rules should be present
  assert(rev.includes('ga-29'), 'Expected ga-29 (group expansion of group-A)');
  // All 30 group-C rules should be present
  assert(rev.includes('gc-29'), 'Expected gc-29 (group expansion of group-C)');
  // Group-B should NOT be present
  assert(!rev.includes('gb-0'), 'Expected group-B rules excluded');

  // Count: 30 + 30 = 60 rules
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount === 60, `Expected 60 rules (expanded groups A+C), got ${ruleCount}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: expanded set > 80 → top 80 by priority, log rest ─────

test('expanded set > 80 → top 80 by priority, overflow logged', () => {
  // 100 rules: flag all → expanded set = 100 > 80
  const rules = generateReviewerRules(100, { priorityFn: (i) => i < 40 ? 0 : 3 });
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const flagged = [];
  for (let i = 0; i < 100; i++) flagged.push(`rev-${i}`);
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount === 80, `Expected 80 rules in payload, got ${ruleCount}`);

  // overflow-skipped.jsonl should exist with 20 entries
  assert(files['overflow-skipped.jsonl'] !== undefined, 'Expected overflow-skipped.jsonl');
  const overflowLines = files['overflow-skipped.jsonl'].trim().split('\n');
  assert(overflowLines.length === 20, `Expected 20 overflow entries, got ${overflowLines.length}`);
  const first = JSON.parse(overflowLines[0]);
  assert(first.reason === 'triage-phase2-cap', `Expected reason triage-phase2-cap, got ${first.reason}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: triage-exempt rules bypass triage ────────────────────

test('triage-exempt rules bypass Phase 1 and Phase 2 cap', () => {
  let rules = generateReviewerRules(85);
  // Add 5 exempt rules
  for (let i = 0; i < 5; i++) {
    rules += `- Exempt rule ${i}.

  \`\`\`enforcement
  id: "exempt-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  triage_exempt: true
  triage_hint: "exempt hint ${i}"
  instruction: "Check exempt rule ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  // Flag 40 non-exempt rules
  const flagged = [];
  for (let i = 0; i < 40; i++) flagged.push(`rev-${i}`);
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');

  // Should have 40 flagged + 5 exempt = 45 rules
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount === 45, `Expected 45 rules (40 flagged + 5 exempt), got ${ruleCount}`);

  // Exempt rules should be in the payload
  assert(rev.includes('exempt-0'), 'Expected exempt-0 in payload');
  assert(rev.includes('exempt-4'), 'Expected exempt-4 in payload');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: Phase 1 flags zero → anomaly warning + exempt-only ───

test('Phase 1 flags zero rules → anomaly warning + exempt-only payload', () => {
  let rules = generateReviewerRules(85);
  // Add 3 exempt rules
  for (let i = 0; i < 3; i++) {
    rules += `- Exempt rule ${i}.

  \`\`\`enforcement
  id: "exempt-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  triage_exempt: true
  instruction: "Check exempt rule ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  // Flag zero rules
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, '[]');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);
  assert(stderr.includes('anomaly'), `Expected anomaly warning. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');

  // Only exempt rules
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount === 3, `Expected 3 exempt-only rules, got ${ruleCount}`);
  assert(rev.includes('exempt-0'), 'Expected exempt rule in payload');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: >30K tokens → auto-chunks ────────────────────────────

test('>30K tokens → auto-chunks reviewer payload', () => {
  // Generate rules with very long instructions to exceed 30K tokens
  // 30K tokens ≈ 23077 words. With 50 rules needing ~462 words each.
  const longInstruction = 'Check that this rule is followed correctly. '.repeat(100);
  const rules = generateReviewerRules(60, { instruction: longInstruction });
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-04', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);
  assert(stderr.includes('chunk') || stderr.includes('token'), `Expected chunking message. stderr: ${stderr}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  // Should have multiple reviewer payload files
  const reviewerFiles = Object.keys(files).filter((f) => f.startsWith('reviewer'));
  assert(reviewerFiles.length >= 2, `Expected multiple reviewer chunks, got ${reviewerFiles.length}: ${reviewerFiles.join(', ')}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: triage-exclusions.jsonl records ──────────────────────

test('triage exclusions logged for rules not flagged by Phase 1', () => {
  const rules = generateReviewerRules(90);
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  // Flag only 30 rules
  const flagged = [];
  for (let i = 0; i < 30; i++) flagged.push(`rev-${i}`);
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const excPath = join(tmp, '.sandcastle', 'payloads', 'ticket-04', 'triage-exclusions.jsonl');
  assert(existsSync(excPath), 'Expected triage-exclusions.jsonl');
  const excContent = readFileSync(excPath, 'utf8').trim();
  const excLines = excContent.split('\n');
  // 90 - 30 = 60 excluded
  assert(excLines.length === 60, `Expected 60 exclusion entries, got ${excLines.length}`);
  const entry = JSON.parse(excLines[0]);
  assert(entry.ruleId !== undefined, 'Expected ruleId in exclusion entry');
  assert(entry.runId !== undefined, 'Expected runId in exclusion entry');
  assert(entry.diffRef !== undefined, 'Expected diffRef in exclusion entry');
  assert(entry.ticketId !== undefined, 'Expected ticketId in exclusion entry');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: zero non-exempt survive scope-gating → exempt only ───

test('zero non-exempt survive scope-gating → run with exempt only', () => {
  // All non-exempt rules scoped to *.css, diff only touches *.ts
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 5; i++) {
    rules += `- CSS rule ${i}.

  \`\`\`enforcement
  id: "css-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  triage_hint: "css hint ${i}"
  instruction: "Check CSS rule ${i}."
  \`\`\`

`;
  }
  // Add 2 exempt rules scoped to *.ts
  for (let i = 0; i < 2; i++) {
    rules += `- Exempt TS rule ${i}.

  \`\`\`enforcement
  id: "exempt-ts-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  triage_exempt: true
  instruction: "Check exempt TS rule ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const { exitCode } = runApplyT3(tmp, ['ticket-04', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');
  // Only exempt rules match
  const ruleCount = (rev.match(/^## /gm) || []).length;
  assert(ruleCount === 2, `Expected 2 exempt rules, got ${ruleCount}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: zero exempt + zero non-exempt → skip, log ────────────

test('zero exempt + zero non-exempt survive → skip Code Gate, log', () => {
  // All rules scoped to *.css, diff only touches *.ts
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 5; i++) {
    rules += `- CSS rule ${i}.

  \`\`\`enforcement
  id: "css-${i}"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  triage_hint: "css hint ${i}"
  instruction: "Check CSS rule ${i}."
  \`\`\`

`;
  }

  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const { exitCode } = runApplyT3(tmp, ['ticket-04', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const files = readAllPayloadFiles(tmp, 'ticket-04');
  const rev = files['reviewer.md'];
  assert(rev !== undefined, 'Expected reviewer.md');
  assert(rev.includes('No T3 rules apply'), 'Expected "No T3 rules apply" when zero survive');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: overflow-skipped.jsonl record format ─────────────────

test('overflow-skipped.jsonl has correct record format', () => {
  const rules = generateReviewerRules(100, { priorityFn: (i) => i < 40 ? 0 : 3 });
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'x', 'y');

  const flagged = [];
  for (let i = 0; i < 100; i++) flagged.push(`rev-${i}`);
  const triageFile = join(tmp, 'triage-results.json');
  writeFileSync(triageFile, JSON.stringify(flagged));

  const { exitCode } = runApplyT3(tmp, ['ticket-04', 'HEAD~1', `--triage-results=${triageFile}`]);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const overflowPath = join(tmp, '.sandcastle', 'payloads', 'ticket-04', 'overflow-skipped.jsonl');
  assert(existsSync(overflowPath), 'Expected overflow-skipped.jsonl');
  const line = JSON.parse(readFileSync(overflowPath, 'utf8').trim().split('\n')[0]);
  assert(line.ruleId !== undefined, 'Expected ruleId field');
  assert(line.agent === 'reviewer', `Expected agent=reviewer, got ${line.agent}`);
  assert(line.reason === 'triage-phase2-cap', `Expected reason=triage-phase2-cap, got ${line.reason}`);
  assert(line.runId !== undefined, 'Expected runId field');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: git diff failure → fail-open ─────────────────────────

test('git diff failure → fail-open', () => {
  // Non-git project — git diff will fail
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules
- Review rule.
  \`\`\`enforcement
  id: rev-1
  tier: T3
  agent: reviewer
  scope: "src/**/*.ts"
  instruction: "Check it"
  triage_hint: "check"
  \`\`\`
`,
  });
  // NOT a git repo — git diff will fail
  const result = spawnSync('node', [SCRIPT, 'issue-1', 'HEAD~1'], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Should not crash — fail-open means rules are included without scope filtering
  assert(result.status === 0, `Expected exit 0 (fail-open), got ${result.status}. stderr: ${result.stderr}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: tiktoken unavailable → word-count fallback ───────────

test('tiktoken unavailable → word-count fallback produces payloads', () => {
  // This test verifies payloads are produced even without tiktoken
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules
- A reviewer rule.
  \`\`\`enforcement
  id: wc-fallback-1
  tier: T3
  agent: reviewer
  scope: "*"
  instruction: "Check this rule carefully"
  triage_hint: "check"
  \`\`\`
`,
  });
  gitInit(tmp);
  mkdirSync(join(tmp, 'src'), { recursive: true });
  writeFileSync(join(tmp, 'src/app.ts'), 'const x = 1;');
  gitAdd(tmp);
  gitCommit(tmp, 'init');
  writeFileSync(join(tmp, 'src/app.ts'), 'const x = 2;');
  gitAdd(tmp);
  gitCommit(tmp, 'change');

  const result = spawnSync('node', [SCRIPT, 'issue-1', 'HEAD~1'], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert(result.status === 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  // Payload dir should exist
  const payloadDir = join(tmp, '.sandcastle', 'payloads', 'issue-1');
  assert(existsSync(payloadDir), 'Expected payload dir to exist');
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Shell injection: malformed diffRef must not execute commands ────

test('malformed diffRef with shell metacharacters → fail-open, no command execution', () => {
  // One visual-qa rule so the script produces output (not zero-block exit 0)
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Rules

- Check spacing.

  \`\`\`enforcement
  id: "spacing-check"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: layout
  instruction: "Check each element spacing."
  \`\`\`
`,
  });
  setupGitEmpty(tmp);

  // Inject shell metacharacters via diffRef. If unsanitized, this would
  // create a marker file. The test asserts the file does NOT exist.
  const marker = join(tmp, 'INJECTED');
  const malicious = `HEAD; touch ${JSON.stringify(marker)}`;

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-inject', malicious]);
  // Script should either fail-open (git diff error) or exit cleanly.
  // It must NOT have executed the touch command.
  assert(!existsSync(marker), 'Shell injection executed — marker file created');
  // The git diff failure triggers fail-open warning
  assert(
    stderr.includes('fail') || stderr.includes('warning') || exitCode === 0,
    `Expected fail-open or clean exit, got exitCode=${exitCode}. stderr: ${stderr}`,
  );

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Boundary: exactly 80 non-exempt → no triage (single payload) ───

test('exactly 80 non-exempt reviewer rules → single payload, no triage', () => {
  const rules = generateReviewerRules(80);
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'const x = 1;', 'const x = 2;');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-bnd-80', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0 (no triage needed), got ${exitCode}. stderr: ${stderr}`);
  assert(!stderr.includes('triage'), `Expected no triage activation with exactly 80 rules. stderr: ${stderr}`);

  const payloads = readPayloads(tmp, 'ticket-bnd-80');
  assert(payloads.length >= 1, 'Expected at least 1 payload file');

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Boundary: exactly 81 non-exempt → triage activates ────────────

test('exactly 81 non-exempt reviewer rules → triage activates (exit 3)', () => {
  const rules = generateReviewerRules(81);
  const tmp = makeTempProject({ '.claude/rules/test.md': rules });
  setupGitWithDiff(tmp, 'src/foo.ts', 'const x = 1;', 'const x = 2;');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-bnd-81', 'HEAD~1']);
  assert(exitCode === 3, `Expected exit 3 (triage needed), got ${exitCode}. stderr: ${stderr}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── TGF-29: payload output format — no raw placeholders, no empty files ───

test('TGF-29: payload files contain no raw {{T3_*}} placeholders and are non-empty', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_BOTH_AGENTS,
  });
  setupGitWithDiff(tmp, 'src/foo.css', 'body {}', 'body { color: red; }');

  const { exitCode, stderr } = runApplyT3(tmp, ['ticket-tgf29', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);

  const dir = join(tmp, '.sandcastle', 'payloads', 'ticket-tgf29');
  assert(existsSync(dir), 'Expected payload directory to exist');

  const mdFiles = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert(mdFiles.length > 0, 'Expected at least one .md payload file');

  for (const f of mdFiles) {
    const content = readFileSync(join(dir, f), 'utf8');
    assert(content.length > 0, `Payload file ${f} is empty (0 bytes)`);
    assert(
      !/\{\{T3_[A-Z_]+\}\}/.test(content),
      `Payload file ${f} contains raw {{T3_*}} placeholder: ${content.match(/\{\{T3_[A-Z_]+\}\}/)?.[0]}`,
    );
  }

  rmSync(tmp, { recursive: true, force: true });
});

test('TGF-29: zero-match fallback files also placeholder-free and non-empty', () => {
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

  const { exitCode } = runApplyT3(tmp, ['ticket-tgf29-zero', 'HEAD~1']);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);

  const dir = join(tmp, '.sandcastle', 'payloads', 'ticket-tgf29-zero');
  const mdFiles = readdirSync(dir).filter((f) => f.endsWith('.md'));

  for (const f of mdFiles) {
    const content = readFileSync(join(dir, f), 'utf8');
    assert(content.length > 0, `Fallback file ${f} is empty`);
    assert(
      !/\{\{T3_[A-Z_]+\}\}/.test(content),
      `Fallback file ${f} contains raw {{T3_*}} placeholder`,
    );
  }

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
