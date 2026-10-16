#!/usr/bin/env node
/**
 * TGF-17: substituteVars — no whitelist (T3 vars consumed by Stage 1)
 *
 * Spec (line 508): "Recognized variables from a whitelist"
 *
 * Bug: substituteVars replaces ANY key present in the vars dict. If T3
 * placeholders ({{T3_VISUAL_CHECKS}}, {{T3_REVIEW_CHECKS}}) are passed in
 * vars, Stage 1 consumes them before Stage 3 can inject rule payloads.
 *
 * Seam: substituteVars(template, vars) → string
 * Level: unit
 * Source: .sandcastle/lib/prompt.mts:11-19
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

// ─── Test: T3 vars in dict must NOT be consumed by Stage 1 ─────────────────

{
  const template = 'Visual: {{T3_VISUAL_CHECKS}}\nReview: {{T3_REVIEW_CHECKS}}\nId: {{ISSUE_ID}}';
  const vars = {
    ISSUE_ID: 'T-42',
    T3_VISUAL_CHECKS: 'should-not-be-used',
    T3_REVIEW_CHECKS: 'should-not-be-used',
  };

  const result = substituteVars(template, vars);

  assert(
    'T3_VISUAL_CHECKS left as literal',
    result.includes('{{T3_VISUAL_CHECKS}}'),
    `got: ${JSON.stringify(result)}`,
  );

  assert(
    'T3_REVIEW_CHECKS left as literal',
    result.includes('{{T3_REVIEW_CHECKS}}'),
    `got: ${JSON.stringify(result)}`,
  );

  assert(
    'whitelisted ISSUE_ID still substituted',
    result.includes('Id: T-42'),
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: T3 var alone in template — not consumed ─────────────────────────

{
  const template = '{{T3_VISUAL_CHECKS}}';
  const vars = { T3_VISUAL_CHECKS: 'payload-content' };

  const result = substituteVars(template, vars);

  assert(
    'T3 var alone — stays literal',
    result === '{{T3_VISUAL_CHECKS}}',
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Test: unrecognized non-T3 var — also left as literal ──────────────────

{
  const template = '{{RANDOM_THING}} and {{ISSUE_ID}}';
  const vars = { ISSUE_ID: 'X-1', RANDOM_THING: 'surprise' };

  const result = substituteVars(template, vars);

  assert(
    'unrecognized var left as literal',
    result.includes('{{RANDOM_THING}}'),
    `got: ${JSON.stringify(result)}`,
  );

  assert(
    'whitelisted var substituted',
    result.includes('X-1'),
    `got: ${JSON.stringify(result)}`,
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
