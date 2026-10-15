#!/usr/bin/env node
/**
 * Tests for the audit:rules script.
 * Creates temporary rules files with known issues and verifies exit codes and output.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts/audit-rules.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-rules-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function runAudit(tmpDir) {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
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

// ─── Test: rules with known gaps → exit 1 ─────────────────────────

test('rules with gaps → exit 1', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule one: do the thing.
- Rule two: do the other thing.
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('gap'), `Expected "gap" in output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: all rules have blocks → exit 0 ──────────────────────────

test('all rules have blocks → exit 0', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- No raw px values.

  \`\`\`enforcement
  id: no-raw-px
  tier: T1
  scope: src/**/*.css
  pattern: \\d+px
  rule: No raw px
  fix: Use a token
  \`\`\`
`,
  });
  const { exitCode } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: adding blocks → gap count drops ─────────────────────────

test('adding blocks reduces gap count', () => {
  // First, two rules with no blocks
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule one.
- Rule two.
`,
  });
  const { exitCode: exit1, stdout: out1 } = runAudit(tmp);
  assert(exit1 === 1, `Expected exit 1 with gaps`);
  const gapCount1 = (out1.match(/gap/g) ?? []).length;

  // Now add a block for rule one
  writeFileSync(
    join(tmp, '.claude/rules/test.md'),
    `# Test rules

- Rule one.

  \`\`\`enforcement
  id: rule-one
  tier: T1
  scope: src/**/*.ts
  pattern: badPattern
  rule: Rule one
  fix: Fix it
  \`\`\`

- Rule two.
`,
  );
  const { exitCode: exit2, stdout: out2 } = runAudit(tmp);
  assert(exit2 === 1, `Expected exit 1 — still one gap`);
  const gapCount2 = (out2.match(/gap/g) ?? []).length;
  assert(gapCount2 < gapCount1, `Expected gap count to drop: ${gapCount1} → ${gapCount2}`);

  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: T1 conflict detected → error ────────────────────────────

test('T1 conflict detected → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Must have foo pattern.

  \`\`\`enforcement
  id: must-have-foo
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  assert: present
  rule: Must have foo
  fix: Add foo
  \`\`\`

- Must not have foo pattern.

  \`\`\`enforcement
  id: must-not-foo
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  assert: absent
  rule: Must not have foo
  fix: Remove foo
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('conflict'), `Expected "conflict" in output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: T3 budget exceeded → error ──────────────────────────────

test('T3 budget exceeded → error', () => {
  // Generate 301 T3 blocks — should trigger the hard limit
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 301; i++) {
    rules += `- Rule ${i}.

  \`\`\`enforcement
  id: rule-${i}
  tier: T3
  agent: reviewer
  scope: src/**/*.ts
  instruction: "Check rule ${i}"
  triage_hint: "rule ${i}"
  \`\`\`

`;
  }

  const tmp = makeTempProject({
    '.claude/rules/test.md': rules,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('300'), `Expected mention of 300 limit: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: malformed YAML → error with message ─────────────────────

test('malformed YAML → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with bad YAML.

  \`\`\`enforcement
  {{{not valid yaml
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(
    stdout.includes('Malformed YAML') || stdout.includes('missing required field'),
    `Expected YAML error in output: ${stdout}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: unrecognized tier → error ───────────────────────────────

test('unrecognized tier → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with bad tier.

  \`\`\`enforcement
  id: bad-tier
  tier: T99
  pattern: foo
  rule: bad tier
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('unrecognized tier'), `Expected tier error in output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: duplicate id across files → error ───────────────────────

test('duplicate id across files → error', () => {
  const block = `
- A rule.

  \`\`\`enforcement
  id: same-id
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  rule: Rule
  fix: Fix
  \`\`\`
`;
  const tmp = makeTempProject({
    '.claude/rules/a.md': `# Rules A\n${block}`,
    '.claude/rules/b.md': `# Rules B\n${block}`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('Duplicate id'), `Expected duplicate id error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: context bullet excluded ─────────────────────────────────

test('context bullets are not rules', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- [context] This is context, not a rule.
- Actual rule.

  \`\`\`enforcement
  id: actual-rule
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  rule: Rule
  fix: Fix
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0 (context bullet not counted), got ${exitCode}. Output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: warnings alone don't fail ───────────────────────────────

test('warnings alone → exit 0', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with missing id.

  \`\`\`enforcement
  tier: T1
  scope: src/**/*
  pattern: foo
  rule: Rule
  fix: Fix
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  // The scope src/**/* lacks extension filter → warning
  // Missing id → warning
  // But no errors → exit 0
  assert(exitCode === 0, `Expected exit 0 (warnings only), got ${exitCode}. Output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: tier distribution reported ──────────────────────────────

test('tier distribution reported', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T1 rule.

  \`\`\`enforcement
  id: t1-rule
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  rule: Rule
  fix: Fix
  \`\`\`

- T3 rule.

  \`\`\`enforcement
  id: t3-rule
  tier: T3
  agent: reviewer
  scope: src/**/*.ts
  instruction: "Check it"
  triage_hint: "check"
  \`\`\`
`,
  });
  const { stdout } = runAudit(tmp);
  assert(stdout.includes('T1:'), `Expected T1 count in output: ${stdout}`);
  assert(stdout.includes('T3:'), `Expected T3 count in output: ${stdout}`);
  assert(stdout.includes('Tier distribution'), `Expected tier distribution section: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: invalid regex → error ───────────────────────────────────

test('invalid regex → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Bad regex rule.

  \`\`\`enforcement
  id: bad-regex
  tier: T1
  scope: src/**/*.ts
  pattern: (?P<invalid
  rule: Bad regex
  fix: Fix it
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('invalid regex'), `Expected regex error in output: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: T3 unrecognized agent → error ───────────────────────────

test('T3 unrecognized agent → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Bad agent rule.

  \`\`\`enforcement
  id: bad-agent
  tier: T3
  agent: unknown-agent
  instruction: "Check it"
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('unrecognized agent'), `Expected agent error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: reviewer scopeless > 10 → error ─────────────────────────

test('reviewer scopeless > 10 → error', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 11; i++) {
    rules += `- Scopeless rule ${i}.

  \`\`\`enforcement
  id: scopeless-${i}
  tier: T3
  agent: reviewer
  instruction: "Check rule ${i}"
  triage_hint: "rule ${i}"
  \`\`\`

`;
  }
  const tmp = makeTempProject({
    '.claude/rules/test.md': rules,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('scopeless'), `Expected scopeless error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Summary ────────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Audit rules tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
