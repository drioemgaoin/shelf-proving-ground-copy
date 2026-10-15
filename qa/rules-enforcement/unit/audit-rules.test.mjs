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

// ─── UC-16e: T1 missing required fields → error ─────────────────────

test('T1 missing required fields → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules
- Bad T1 rule.
  \`\`\`enforcement
  id: bad-t1
  tier: T1
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('missing required field'), `Expected missing field error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16h: T1 scope glob without extension → warning (exit 0) ────

test('T1 scope glob without extension → warning not error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with broad scope.

  \`\`\`enforcement
  id: broad-scope
  tier: T1
  scope: src/**/*
  pattern: foo
  rule: Broad scope rule
  fix: Narrow the scope
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0 (warning only), got ${exitCode}. Output: ${stdout}`);
  assert(stdout.includes('extension filter'), `Expected extension filter warning: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16i: T1 invalid glob syntax → error ─────────────────────────

test('T1 invalid glob syntax → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with bad glob.

  \`\`\`enforcement
  id: bad-glob
  tier: T1
  scope: src/[bad
  pattern: foo
  rule: Bad glob rule
  fix: Fix the glob
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('invalid glob syntax'), `Expected invalid glob syntax error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16j: T1 unrecognized strip value → error ────────────────────

test('T1 unrecognized strip value → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Rule with bad strip.

  \`\`\`enforcement
  id: bad-strip
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  rule: Bad strip rule
  fix: Fix the strip
  strip: foobar
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('unrecognized strip value'), `Expected unrecognized strip error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16k: T2 missing scope or assert → error ─────────────────────

test('T2 missing scope → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T2 rule without scope.

  \`\`\`enforcement
  id: t2-no-scope
  tier: T2
  assert: checkSomething()
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('missing required field: scope'), `Expected missing scope error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16l: T2 global block with non-callable assert → error ───────

test('T2 global block with non-callable assert → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T2 global with descriptive assert.

  \`\`\`enforcement
  id: t2-non-callable
  tier: T2
  scope: global
  assert: all buttons should have labels
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('non-callable assert'), `Expected non-callable assert error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16m: T2 global block drift → warning ────────────────────────

test('T2 global block drift → warning', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T2 global with drifted assert.

  \`\`\`enforcement
  id: t2-drift
  tier: T2
  scope: global
  assert: checkDriftedThing()
  \`\`\`
`,
    'e2e/global/invariants.spec.ts': `// This file does not contain checkDriftedThing
import { test, expect } from '@playwright/test';
test('placeholder', () => { expect(true).toBe(true); });
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0 (drift is warning only), got ${exitCode}. Output: ${stdout}`);
  assert(stdout.includes('drift'), `Expected drift warning: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16n: T3 missing agent → error ───────────────────────────────

test('T3 missing agent → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 rule without agent.

  \`\`\`enforcement
  id: t3-no-agent
  tier: T3
  instruction: "Check something"
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('missing required field: agent'), `Expected missing agent error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16p: T3 visual-qa missing group → error ─────────────────────

test('T3 visual-qa missing group → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 visual-qa without group.

  \`\`\`enforcement
  id: vqa-no-group
  tier: T3
  agent: visual-qa
  scope: "*"
  instruction: "Check visual consistency"
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('missing required field: group'), `Expected missing group error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16q: T3 visual-qa scope ≠ "*" → error ──────────────────────

test('T3 visual-qa scope not wildcard → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 visual-qa with wrong scope.

  \`\`\`enforcement
  id: vqa-wrong-scope
  tier: T3
  agent: visual-qa
  scope: src/**/*.ts
  group: test-group
  instruction: "Check visual consistency"
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('scope must be'), `Expected scope must be "*" error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16r: T3 visual-qa group > 80 → error ────────────────────────

test('T3 visual-qa group > 80 → error', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 81; i++) {
    rules += `- VQA rule ${i}.

  \`\`\`enforcement
  id: vqa-${i}
  tier: T3
  agent: visual-qa
  scope: "*"
  group: overloaded-group
  instruction: "Check rule ${i}"
  \`\`\`

`;
  }
  const tmp = makeTempProject({
    '.claude/rules/test.md': rules,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('80'), `Expected mention of 80 limit: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16t: T3 triage_exempt > 10 → error ──────────────────────────

test('T3 triage_exempt > 10 → error', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 11; i++) {
    rules += `- Exempt rule ${i}.

  \`\`\`enforcement
  id: exempt-${i}
  tier: T3
  agent: reviewer
  scope: src/**/*.ts
  instruction: "Check rule ${i}"
  triage_hint: "rule ${i}"
  triage_exempt: true
  \`\`\`

`;
  }
  const tmp = makeTempProject({
    '.claude/rules/test.md': rules,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('triage_exempt'), `Expected triage_exempt error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16v: T3 total > 150 → warning (exit 0) ─────────────────────

test('T3 total > 150 → warning', () => {
  let rules = '# Test rules\n\n';
  for (let i = 0; i < 151; i++) {
    rules += `- T3 rule ${i}.

  \`\`\`enforcement
  id: t3-${i}
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
  assert(exitCode === 0, `Expected exit 0 (150 is warning not error), got ${exitCode}. Output: ${stdout}`);
  assert(stdout.includes('150'), `Expected mention of 150 limit: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16w: T3 instruction > 500 tokens → warning (exit 0) ────────

test('T3 instruction > 500 tokens → warning', () => {
  // Generate ~400 words ≈ ~520 tokens (estimateTokens uses words * 1.3)
  const longWords = [];
  for (let i = 0; i < 400; i++) {
    longWords.push(`word${i}`);
  }
  const longInstruction = longWords.join(' ');

  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 rule with long instruction.

  \`\`\`enforcement
  id: long-instruction
  tier: T3
  agent: reviewer
  scope: src/**/*.ts
  instruction: "${longInstruction}"
  triage_hint: "long rule"
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0 (token warning only), got ${exitCode}. Output: ${stdout}`);
  assert(stdout.includes('500 tokens'), `Expected 500 tokens warning: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16x: T3 priority out of range → error ───────────────────────

test('T3 priority out of range → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 rule with bad priority.

  \`\`\`enforcement
  id: bad-priority
  tier: T3
  agent: reviewer
  scope: src/**/*.ts
  instruction: "Check something"
  triage_hint: "bad priority"
  priority: 5
  \`\`\`
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('priority'), `Expected priority error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16y: Human-tier no review entry → error ─────────────────────

test('Human-tier no review entry → error', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Human-tier rule needing review.

  \`\`\`enforcement
  id: human-no-log
  tier: Human
  review: visual
  reason: Requires human judgment
  \`\`\`
`,
  });
  // No reviews/human-tier-log.jsonl file
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
  assert(stdout.includes('no entry in reviews/human-tier-log.jsonl'), `Expected missing log entry error: ${stdout}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── UC-16z: Human-tier only "created" entry → warning ──────────────

test('Human-tier only created entry → warning', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Human-tier rule with only created entry.

  \`\`\`enforcement
  id: human-created-only
  tier: Human
  review: visual
  reason: Requires human judgment
  \`\`\`
`,
    'reviews/human-tier-log.jsonl': `{"rule":"human-created-only","verdict":"created","date":"2026-10-01"}
`,
  });
  const { exitCode, stdout } = runAudit(tmp);
  assert(exitCode === 0, `Expected exit 0 (created-only is warning), got ${exitCode}. Output: ${stdout}`);
  assert(stdout.includes('only "created" entry'), `Expected created-only warning: ${stdout}`);
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
