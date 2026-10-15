#!/usr/bin/env node
/**
 * Tests for scripts/expand-prompt.mjs
 *
 * Creates temporary directories with template files and payload files,
 * then verifies the three-stage expansion pipeline.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts/expand-prompt.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function makeTempDir(files = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'expand-prompt-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// ─── Test: Stage 1 — whitelist VAR substitution ───────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Issue: {{ISSUE_ID}}\nTitle: {{ISSUE_TITLE}}\nBody: {{ISSUE_BODY}}\nLabels: {{ISSUE_LABELS}}\nMap: {{CODEMAP}}\nDiff: {{DIFF_REF}}\nHistory: {{FIX_HISTORY}}',
  });
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-01',
    '--var=ISSUE_ID=T-42',
    '--var=ISSUE_TITLE=Fix the thing',
    '--var=ISSUE_BODY=Detailed description',
    '--var=ISSUE_LABELS=bug,p1',
    '--var=CODEMAP=src/index.ts',
    '--var=DIFF_REF=abc123',
    '--var=FIX_HISTORY=fix(css): radius',
  ], { encoding: 'utf8' });

  assert('Stage 1 — exit 0', result.status === 0, `exit ${result.status}`);

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 1 — ISSUE_ID substituted', output.includes('Issue: T-42'));
  assert('Stage 1 — ISSUE_TITLE substituted', output.includes('Title: Fix the thing'));
  assert('Stage 1 — ISSUE_BODY substituted', output.includes('Body: Detailed description'));
  assert('Stage 1 — ISSUE_LABELS substituted', output.includes('Labels: bug,p1'));
  assert('Stage 1 — CODEMAP substituted', output.includes('Map: src/index.ts'));
  assert('Stage 1 — DIFF_REF substituted', output.includes('Diff: abc123'));
  assert('Stage 1 — FIX_HISTORY substituted', output.includes('History: fix(css): radius'));

  cleanup(tmp);
}

// ─── Test: Stage 1 — unrecognized VAR left as literal ─────────────

{
  const tmp = makeTempDir({
    'template.md': 'Known: {{ISSUE_ID}}\nUnknown: {{RANDOM_VAR}}\nAlso: {{ WEIRD_THING }}',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-02',
    '--var=ISSUE_ID=known-value',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('Unrecognized VAR — RANDOM_VAR literal', output.includes('{{RANDOM_VAR}}'));
  assert('Unrecognized VAR — WEIRD_THING literal', output.includes('{{ WEIRD_THING }}'));
  assert('Known VAR still substituted', output.includes('Known: known-value'));

  cleanup(tmp);
}

// ─── Test: Stage 1 — T3 vars reserved (not substituted) ──────────

{
  const tmp = makeTempDir({
    'template.md': 'Visual: {{T3_VISUAL_CHECKS}}\nReview: {{T3_REVIEW_CHECKS}}\nId: {{ISSUE_ID}}',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-03',
    '--var=ISSUE_ID=reserved-test',
    '--var=T3_VISUAL_CHECKS=should-not-be-used',
    '--var=T3_REVIEW_CHECKS=should-not-be-used',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  // T3 vars should be handled by Stage 3, not Stage 1
  // With no payload dir they'll become empty
  assert('T3_VISUAL_CHECKS not substituted by Stage 1', !output.includes('should-not-be-used'));
  assert('ISSUE_ID still substituted', output.includes('Id: reserved-test'));

  cleanup(tmp);
}

// ─── Test: Stage 2 — shell expansion ──────────────────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Echo: !`echo hello-world`\nAfter shell.',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-04',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 2 — shell output inserted', output.includes('Echo: hello-world'));
  assert('Stage 2 — text after shell preserved', output.includes('After shell.'));

  cleanup(tmp);
}

// ─── Test: Stage 2 — shell failure → empty string + warning ──────

{
  const tmp = makeTempDir({
    'template.md': 'Before !`exit 1` After',
  });
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-05',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 2 — failed cmd → empty string', output === 'Before  After');
  assert('Stage 2 — warning logged', result.stderr.includes('shell expansion failed'));
  assert('Stage 2 — still exits 0', result.status === 0);

  cleanup(tmp);
}

// ─── Test: Stage 3 — T3 payload injection ─────────────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Visual checks:\n{{T3_VISUAL_CHECKS}}\n\nReview checks:\n{{T3_REVIEW_CHECKS}}',
    '.sandcastle/payloads/test-06/visual-qa.md': '# Visual T3 Rules\n\n## check-contrast\nEnsure contrast ratio.',
    '.sandcastle/payloads/test-06/reviewer.md': '# Reviewer T3 Rules\n\n## check-types\nNo any types.',
  });
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-06',
  ], { encoding: 'utf8', cwd: tmp });

  assert('Stage 3 — exit 0', result.status === 0, `exit ${result.status}: ${result.stderr}`);

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 3 — visual payload injected', output.includes('check-contrast'));
  assert('Stage 3 — reviewer payload injected', output.includes('check-types'));

  cleanup(tmp);
}

// ─── Test: Stage 3 — multiple payload files concatenated ──────────

{
  const tmp = makeTempDir({
    'template.md': '{{T3_REVIEW_CHECKS}}',
    '.sandcastle/payloads/test-07/reviewer-1.md': 'Chunk 1 rules',
    '.sandcastle/payloads/test-07/reviewer-2.md': 'Chunk 2 rules',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-07',
  ], { encoding: 'utf8', cwd: tmp });

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 3 — multiple reviewer chunks', output.includes('Chunk 1 rules') && output.includes('Chunk 2 rules'));

  cleanup(tmp);
}

// ─── Test: Stage 3 — missing payload dir → empty string ───────────

{
  const tmp = makeTempDir({
    'template.md': 'Before {{T3_VISUAL_CHECKS}} After',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'nonexistent-ticket',
  ], { encoding: 'utf8', cwd: tmp });

  const output = readFileSync(outPath, 'utf8');
  assert('Stage 3 — missing payload dir → empty', output === 'Before  After');

  cleanup(tmp);
}

// ─── Test: All three stages combined ──────────────────────────────

{
  const tmp = makeTempDir({
    'template.md': [
      'Issue: {{ISSUE_ID}}',
      'Cmd: !`echo combined-test`',
      'T3: {{T3_VISUAL_CHECKS}}',
      'Unknown: {{NOT_A_REAL_VAR}}',
    ].join('\n'),
    '.sandcastle/payloads/test-09/visual-qa.md': 'T3-visual-payload-content',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-09',
    '--var=ISSUE_ID=combined-42',
  ], { encoding: 'utf8', cwd: tmp });

  const output = readFileSync(outPath, 'utf8');
  assert('Combined — VAR resolved', output.includes('Issue: combined-42'));
  assert('Combined — shell output inserted', output.includes('Cmd: combined-test'));
  assert('Combined — T3 payload injected', output.includes('T3: T3-visual-payload-content'));
  assert('Combined — unrecognized VAR literal', output.includes('{{NOT_A_REAL_VAR}}'));

  cleanup(tmp);
}

// ─── Test: Stage 2 output not re-expanded by Stage 3 ─────────────

{
  const tmp = makeTempDir({
    'template.md': '!`echo "{{T3_VISUAL_CHECKS}}"`\nActual: {{T3_VISUAL_CHECKS}}',
    '.sandcastle/payloads/test-10/visual-qa.md': 'real-payload',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-10',
  ], { encoding: 'utf8', cwd: tmp });

  const output = readFileSync(outPath, 'utf8');
  // The shell echo outputs the literal {{T3_VISUAL_CHECKS}} because Stage 2
  // runs BEFORE Stage 3. But Stage 3 then replaces ALL remaining {{T3_VISUAL_CHECKS}},
  // including the one the shell printed. Since stages are sequential and single-pass,
  // the key guarantee is: Stage 2 output is not re-expanded by Stage 2.
  // Stage 3 replaces its own reserved tokens wherever they appear.
  //
  // The spec says: "no stage's output re-expanded by a later stage"
  // So shell output that contains {{T3_VISUAL_CHECKS}} should NOT be replaced by Stage 3.
  //
  // To honor this: Stage 2 must mark its output somehow, or Stage 3 must
  // only replace tokens that existed in the Stage 1 output.
  //
  // Implementation: We track positions. Simpler approach: Stage 3 replaces
  // only in the template's original positions. Let me verify what the spec wants.
  //
  // Actually, re-reading: "Stages execute sequentially (1 → 2 → 3), single-pass —
  // no stage's output re-expanded by a later stage"
  //
  // So if Stage 2 outputs "{{T3_VISUAL_CHECKS}}", Stage 3 should NOT replace it.
  // The literal from the shell should remain.

  // The shell echoed {{T3_VISUAL_CHECKS}} as literal — it should stay literal
  assert(
    'Stage 2 output not re-expanded by Stage 3 — shell output preserved',
    output.includes('{{T3_VISUAL_CHECKS}}'),
    `output: ${output}`,
  );
  // But the original template {{T3_VISUAL_CHECKS}} SHOULD be replaced
  assert(
    'Stage 3 — original T3 var replaced',
    output.includes('Actual: real-payload'),
  );

  cleanup(tmp);
}

// ─── Test: Missing template → exit 2 ─────────────────────────────

{
  const tmp = makeTempDir({});
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'nonexistent.md'), outPath, 'test-11',
  ], { encoding: 'utf8' });

  assert('Missing template → exit 2', result.status === 2);

  cleanup(tmp);
}

// ─── Test: Shell timeout ──────────────────────────────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Before !`sleep 10` After',
  });
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-12',
    '--timeout=500',
  ], { encoding: 'utf8' });

  assert('Shell timeout — still exits 0', result.status === 0);
  const output = readFileSync(outPath, 'utf8');
  assert('Shell timeout — replaced with empty', output === 'Before  After');
  assert('Shell timeout — warning logged', result.stderr.includes('shell expansion failed'));

  cleanup(tmp);
}

// ─── Results ─────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
