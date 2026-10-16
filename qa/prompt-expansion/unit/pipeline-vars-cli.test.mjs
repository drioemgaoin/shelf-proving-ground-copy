#!/usr/bin/env node
/**
 * RED test: pipeline vars missing from STAGE1_WHITELIST (CLI script)
 *
 * Same bug as pipeline-vars-whitelist.test.mjs but tests the CLI entry point
 * scripts/expand-prompt.mjs to confirm the fix applies to both codepaths.
 *
 * Seam: expand-prompt.mjs CLI → file output
 * Level: integration
 * Source: scripts/expand-prompt.mjs — STAGE1_WHITELIST
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
  const tmp = mkdtempSync(join(tmpdir(), 'pipeline-vars-cli-'));
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

// ─── Test: implementer template — all pipeline vars filled ──────────────

{
  const tmp = makeTempDir({
    'template.md': [
      'Implement {{TASK_ID}}: {{ISSUE_TITLE}}',
      'Branch: {{BRANCH}}.',
      'Details: {{ISSUE_DETAILS}}',
      'Standards: {{CODING_STANDARDS}}',
      'Comment: {{COMMENT_TASK_COMMAND}}',
      'Label: {{LABEL_TASK_COMMAND}}',
      'Bug: {{CREATE_BUG_COMMAND}}',
    ].join('\n'),
  });
  const outPath = join(tmp, 'out.md');

  const result = spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-impl',
    '--var=TASK_ID=djk.1',
    '--var=ISSUE_TITLE=Shelf grid',
    '--var=BRANCH=sandcastle/issue-djk.1',
    '--var=ISSUE_DETAILS=Full issue body',
    '--var=CODING_STANDARDS=No nested ternaries',
    '--var=COMMENT_TASK_COMMAND=bd comment djk.1',
    '--var=LABEL_TASK_COMMAND=bd update djk.1 --label=ready-for-human',
    '--var=CREATE_BUG_COMMAND=bd create --type=bug',
  ], { encoding: 'utf8' });

  assert('CLI exit 0', result.status === 0, `exit ${result.status}: ${result.stderr}`);

  const output = readFileSync(outPath, 'utf8');
  const remaining = output.match(/\{\{[A-Z_]+\}\}/g);
  assert(
    'implementer — no unfilled placeholders',
    remaining === null,
    `unfilled: ${JSON.stringify(remaining)}`,
  );

  assert('TASK_ID filled', output.includes('Implement djk.1:'));
  assert('BRANCH filled', output.includes('Branch: sandcastle/issue-djk.1.'));
  assert('ISSUE_DETAILS filled', output.includes('Details: Full issue body'));
  assert('CODING_STANDARDS filled', output.includes('Standards: No nested ternaries'));

  cleanup(tmp);
}

// ─── Test: planner template — READY_ISSUES filled ───────────────────────

{
  const tmp = makeTempDir({
    'template.md': '<issues>\n{{READY_ISSUES}}\n</issues>',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-plan',
    '--var=READY_ISSUES=[{"id":"1"}]',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert(
    'READY_ISSUES filled',
    output.includes('[{"id":"1"}]'),
    `got: ${JSON.stringify(output)}`,
  );
  assert(
    'no unfilled READY_ISSUES',
    !output.includes('{{READY_ISSUES}}'),
    `got: ${JSON.stringify(output)}`,
  );

  cleanup(tmp);
}

// ─── Test: fixer template — FINDINGS_FILE and VERIFY_COMMAND filled ─────

{
  const tmp = makeTempDir({
    'template.md': 'Branch: {{BRANCH}}\nFindings: {{FINDINGS_FILE}}\nVerify: {{VERIFY_COMMAND}}',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-fixer',
    '--var=BRANCH=sandcastle/issue-djk.1',
    '--var=FINDINGS_FILE=.qa/visual-r1.md',
    '--var=VERIFY_COMMAND=npm run ui:qa -- --grep "@visual"',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('FINDINGS_FILE filled', output.includes('Findings: .qa/visual-r1.md'));
  assert('VERIFY_COMMAND filled', output.includes('Verify: npm run ui:qa'));
  assert('BRANCH filled', output.includes('Branch: sandcastle/issue-djk.1'));

  cleanup(tmp);
}

// ─── Test: reviewer template — BASE_BRANCH filled ───────────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Base: {{BASE_BRANCH}}\nBranch: {{BRANCH}}\nHistory: {{FIX_HISTORY}}',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-reviewer',
    '--var=BASE_BRANCH=main',
    '--var=BRANCH=sandcastle/issue-djk.1',
    '--var=FIX_HISTORY=fix(css): radius',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('BASE_BRANCH filled', output.includes('Base: main'));
  assert('BRANCH filled', output.includes('Branch: sandcastle/issue-djk.1'));
  assert('FIX_HISTORY filled', output.includes('History: fix(css): radius'));

  cleanup(tmp);
}

// ─── Test: merger template — BRANCHES, ISSUES, CLOSE_TASK_COMMAND ───────

{
  const tmp = makeTempDir({
    'template.md': 'Branches:\n{{BRANCHES}}\nIssues:\n{{ISSUES}}\nClose: {{CLOSE_TASK_COMMAND}}',
  });
  const outPath = join(tmp, 'out.md');

  spawnSync('node', [
    SCRIPT, join(tmp, 'template.md'), outPath, 'test-merger',
    '--var=BRANCHES=- sandcastle/issue-djk.1',
    '--var=ISSUES=- djk.1: Shelf grid',
    '--var=CLOSE_TASK_COMMAND=bd close <ID>',
  ], { encoding: 'utf8' });

  const output = readFileSync(outPath, 'utf8');
  assert('BRANCHES filled', output.includes('- sandcastle/issue-djk.1'));
  assert('ISSUES filled', output.includes('- djk.1: Shelf grid'));
  assert('CLOSE_TASK_COMMAND filled', output.includes('Close: bd close <ID>'));

  cleanup(tmp);
}

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
