#!/usr/bin/env node
/**
 * RED test: pipeline vars missing from STAGE1_WHITELIST
 *
 * Bug: The pipeline (phases.mts, gates.mts) passes vars like TASK_ID, BRANCH,
 * ISSUE_DETAILS, CODING_STANDARDS, etc. to expandAndSave/substituteVars, but
 * these vars are NOT in STAGE1_WHITELIST, so they're left as literal
 * {{PLACEHOLDER}} text in the expanded prompt sent to the LLM.
 *
 * Seam: substituteVars(template, vars) → string
 * Level: unit
 * Source: .sandcastle/lib/prompt.mts — STAGE1_WHITELIST
 */

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
// If the source whitelist is updated, this must be updated in lockstep.
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
]);

function substituteVars(template, vars) {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) =>
      STAGE1_WHITELIST.has(key) && key in vars ? vars[key] : match,
  );
}

// ---------------------------------------------------------------------------
// Pipeline vars that phases.mts and gates.mts actually pass to expandAndSave
// ---------------------------------------------------------------------------

const PIPELINE_VARS = [
  // Implementer (phases.mts:runImplementer)
  'TASK_ID',
  'BRANCH',
  'ISSUE_DETAILS',
  'CODING_STANDARDS',
  'COMMENT_TASK_COMMAND',
  'LABEL_TASK_COMMAND',
  'CREATE_BUG_COMMAND',
  // Planner (phases.mts:planIteration)
  'READY_ISSUES',
  // Merger (phases.mts:mergeCompleted)
  'BRANCHES',
  'ISSUES',
  'CLOSE_TASK_COMMAND',
  // Visual QA checker (gates.mts:createVisualGate)
  'FINDINGS_FILE',
  // Reviewer checker (gates.mts:createReviewGate)
  'BASE_BRANCH',
  // Fixer (gates.mts — both gates)
  'VERIFY_COMMAND',
];

// Already-whitelisted vars that the pipeline also uses
const ALREADY_WHITELISTED = ['ISSUE_TITLE', 'CODEMAP', 'FIX_HISTORY'];

// ─── Test: each pipeline var is substituted when present ─────────────────

for (const varName of PIPELINE_VARS) {
  const template = `before {{${varName}}} after`;
  const vars = { [varName]: `resolved-${varName}` };
  const result = substituteVars(template, vars);

  assert(
    `${varName} is substituted`,
    result === `before resolved-${varName} after`,
    `expected "before resolved-${varName} after", got ${JSON.stringify(result)}`,
  );
}

// ─── Test: already-whitelisted vars still work ──────────────────────────

for (const varName of ALREADY_WHITELISTED) {
  const template = `check {{${varName}}}`;
  const vars = { [varName]: `ok-${varName}` };
  const result = substituteVars(template, vars);

  assert(
    `${varName} (already whitelisted) still works`,
    result === `check ok-${varName}`,
    `got ${JSON.stringify(result)}`,
  );
}

// ─── Test: implementer prompt template — all placeholders filled ────────

{
  const template = [
    'Implement {{TASK_ID}}: {{ISSUE_TITLE}}',
    'Branch: {{BRANCH}}.',
    '{{ISSUE_DETAILS}}',
    '{{CODEMAP}}',
    '{{CODING_STANDARDS}}',
    '{{COMMENT_TASK_COMMAND}}',
    '{{LABEL_TASK_COMMAND}}',
    '{{CREATE_BUG_COMMAND}}',
  ].join('\n');

  const vars = {
    TASK_ID: 'djk.1',
    ISSUE_TITLE: 'Shelf grid',
    BRANCH: 'sandcastle/issue-djk.1',
    ISSUE_DETAILS: 'Full issue body here',
    CODEMAP: 'src/App.tsx\nsrc/api.ts',
    CODING_STANDARDS: 'No nested ternaries',
    COMMENT_TASK_COMMAND: 'bd comment djk.1 "<COMMENT>"',
    LABEL_TASK_COMMAND: 'bd update djk.1 --label=ready-for-human',
    CREATE_BUG_COMMAND: 'bd create --type=bug --title="<TITLE>"',
  };

  const result = substituteVars(template, vars);

  // No {{...}} placeholders should remain
  const remaining = result.match(/\{\{[A-Z_]+\}\}/g);
  assert(
    'implementer prompt — no unfilled placeholders',
    remaining === null,
    `unfilled: ${JSON.stringify(remaining)}`,
  );

  assert(
    'implementer prompt — TASK_ID filled',
    result.includes('Implement djk.1:'),
    `got: ${result.substring(0, 80)}`,
  );

  assert(
    'implementer prompt — CODING_STANDARDS filled',
    result.includes('No nested ternaries'),
    `got: ${result.substring(result.indexOf('CODING'), result.indexOf('CODING') + 40)}`,
  );
}

// ─── Test: planner prompt template — READY_ISSUES filled ────────────────

{
  const template = '<issues-json>\n\n{{READY_ISSUES}}\n\n</issues-json>';
  const vars = { READY_ISSUES: '[{"id":"djk.1","title":"Shelf grid"}]' };
  const result = substituteVars(template, vars);

  assert(
    'planner prompt — READY_ISSUES filled',
    result.includes('[{"id":"djk.1"'),
    `got: ${JSON.stringify(result)}`,
  );

  assert(
    'planner prompt — no unfilled placeholders',
    !result.includes('{{READY_ISSUES}}'),
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: T3 vars are still reserved (not consumed by Stage 1) ─────────

{
  const template = '{{T3_VISUAL_CHECKS}} and {{BRANCH}}';
  const vars = { T3_VISUAL_CHECKS: 'injected', BRANCH: 'main' };
  const result = substituteVars(template, vars);

  assert(
    'T3_VISUAL_CHECKS still reserved',
    result.includes('{{T3_VISUAL_CHECKS}}'),
    `got: ${JSON.stringify(result)}`,
  );

  assert(
    'BRANCH substituted alongside T3 reservation',
    result.includes('main'),
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
