#!/usr/bin/env node
/**
 * RED test: reviewer template embeds {{VAR}} inside !`cmd` shell expressions
 *
 * Bug: expandAndSave runs shell BEFORE vars (shell→vars→T3). When the
 * reviewer template uses !`git diff {{BASE_BRANCH}}...{{BRANCH}}`, the
 * shell tries to run the literal `git diff {{BASE_BRANCH}}...{{BRANCH}}`
 * which fails because those aren't valid git refs.
 *
 * Fix: the reviewer template should use pre-computed vars ({{BRANCH_DIFF}},
 * {{BRANCH_LOG}}) instead of embedding vars inside shell expressions.
 * The gate's buildCheckerArgs computes the diff/log on the host and passes
 * them as vars.
 *
 * Seam: reviewer.prompt.md template + gates.mts buildCheckerArgs
 * Level: unit
 * Source: .sandcastle/prompts/reviewer.prompt.md, .sandcastle/lib/gates.mts
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Reimplemented from .sandcastle/lib/prompt.mts — mirrors source EXACTLY.
// ---------------------------------------------------------------------------

const STAGE1_WHITELIST = new Set([
  // Original vars
  'ISSUE_ID',
  'ISSUE_TITLE',
  'ISSUE_BODY',
  'ISSUE_LABELS',
  'CODEMAP',
  'DIFF_REF',
  'FIX_HISTORY',
  // Implementer vars (phases.mts)
  'TASK_ID',
  'BRANCH',
  'ISSUE_DETAILS',
  'CODING_STANDARDS',
  'COMMENT_TASK_COMMAND',
  'LABEL_TASK_COMMAND',
  'CREATE_BUG_COMMAND',
  // Planner vars (phases.mts)
  'READY_ISSUES',
  // Merger vars (phases.mts)
  'BRANCHES',
  'ISSUES',
  'CLOSE_TASK_COMMAND',
  // QA gate vars (gates.mts)
  'FINDINGS_FILE',
  'VERIFY_COMMAND',
  'BASE_BRANCH',
  // Code review pre-computed vars (gates.mts)
  'BRANCH_DIFF',
  'BRANCH_LOG',
]);

// ---------------------------------------------------------------------------
// Test 1: reviewer template must NOT embed vars inside shell expressions
// ---------------------------------------------------------------------------

{
  const template = readFileSync('.sandcastle/prompts/reviewer.prompt.md', 'utf8');
  const shellWithVars = /!\`[^`]*\{\{[^}]+\}\}[^`]*\`/;
  const matches = template.match(shellWithVars);

  assert(
    'reviewer template — no {{VAR}} inside !`cmd`',
    !shellWithVars.test(template),
    `Found vars inside shell expression: ${matches?.[0]}`,
  );
}

// ---------------------------------------------------------------------------
// Test 2: BRANCH_DIFF and BRANCH_LOG are whitelisted for substituteVars
// ---------------------------------------------------------------------------

{
  assert(
    'BRANCH_DIFF is whitelisted',
    STAGE1_WHITELIST.has('BRANCH_DIFF'),
    'BRANCH_DIFF missing from STAGE1_WHITELIST',
  );
  assert(
    'BRANCH_LOG is whitelisted',
    STAGE1_WHITELIST.has('BRANCH_LOG'),
    'BRANCH_LOG missing from STAGE1_WHITELIST',
  );
}

// ---------------------------------------------------------------------------
// Test 3: reviewer template uses {{BRANCH_DIFF}} and {{BRANCH_LOG}} vars
// ---------------------------------------------------------------------------

{
  const template = readFileSync('.sandcastle/prompts/reviewer.prompt.md', 'utf8');

  assert(
    'reviewer template uses {{BRANCH_DIFF}}',
    template.includes('{{BRANCH_DIFF}}'),
    'Missing {{BRANCH_DIFF}} in reviewer template',
  );

  assert(
    'reviewer template uses {{BRANCH_LOG}}',
    template.includes('{{BRANCH_LOG}}'),
    'Missing {{BRANCH_LOG}} in reviewer template',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
