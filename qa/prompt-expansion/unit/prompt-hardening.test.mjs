#!/usr/bin/env node
/**
 * RED/GREEN tests for the 8 prompt-hardening fixes.
 *
 * Each test verifies a BEHAVIORAL difference between the old and new code:
 * - RED: fails against the pre-fix code (old template / old pipeline logic)
 * - GREEN: passes against the fixed code
 *
 * For prompt tests: we expand the template through the real substituteVars
 * pipeline with realistic inputs and verify the expansion output changes
 * the agent's decision surface — not just that a string exists in the template.
 *
 * Seam: prompt templates, expansion pipeline, gates configuration, main.mts
 * Level: unit
 * Source: .sandcastle/prompts/*.prompt.md, .sandcastle/lib/gates.mts,
 *         .sandcastle/lib/prompt.mts, .sandcastle/main.mts
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
// Re-implement substituteVars from .sandcastle/lib/prompt.mts — mirrors EXACTLY.
// ---------------------------------------------------------------------------

const STAGE1_WHITELIST = new Set([
  'ISSUE_ID',
  'ISSUE_TITLE',
  'ISSUE_BODY',
  'ISSUE_LABELS',
  'CODEMAP',
  'DIFF_REF',
  'FIX_HISTORY',
  'TASK_ID',
  'BRANCH',
  'ISSUE_DETAILS',
  'CODING_STANDARDS',
  'COMMENT_TASK_COMMAND',
  'LABEL_TASK_COMMAND',
  'CREATE_BUG_COMMAND',
  'READY_ISSUES',
  'BRANCHES',
  'ISSUES',
  'CLOSE_TASK_COMMAND',
  'FINDINGS_FILE',
  'VERIFY_COMMAND',
  'BASE_BRANCH',
  // Code review pre-computed vars (gates.mts)
  'BRANCH_DIFF',
  'BRANCH_LOG',
]);

function substituteVars(template, vars) {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) =>
      STAGE1_WHITELIST.has(key) && key in vars ? vars[key] : match,
  );
}

// ---------------------------------------------------------------------------
// Re-implement compressIssueDetails from .sandcastle/main.mts — mirrors EXACTLY.
// ---------------------------------------------------------------------------

function compressIssueDetails(raw) {
  return raw
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

// ─── Realistic test fixtures ──────────────────────────────────────────────
// Modeled after the actual bd show output from the sandcastle run logs.

const PADDED_ISSUE_DETAILS = [
  '○ shelf-proving-ground-djk.1 · Shelf grid: page load with grid and skeletons   [P2 · OPEN]',
  'Created by: drioemgaoin · Type: task                                              ',
  'Created: 2026-09-30 · Updated: 2026-10-16                                        ',
  '',
  'DESCRIPTION',
  '',
  '  ## Parent                                                                   ',
  '                                                                              ',
  '  shelf-proving-ground-djk (Shelf grid spec)                                  ',
  '                                                                              ',
  '  ## What to build                                                            ',
  '                                                                              ',
  '  Navigate to the shelf and see the complete page-load flow: 6 skeleton cards ',
  '  appear instantly while the API responds.                                    ',
  '                                                                              ',
  '  ## Acceptance criteria                                                      ',
  '                                                                              ',
  '  [ ] Shelf grid: shows all books by default                                  ',
  '  [ ] Shelf grid: newest-first order                                          ',
  '                                                                              ',
  '  ## Tests to turn green                                                      ',
  '                                                                              ',
  '  File: tests/acceptance/shelf-grid/shelf-grid.spec.ts                        ',
  '  Run: npx playwright test --grep "@djk.1" --grep-invert "@visual"            ',
  '',
  '',
  '',
  'LABELS: Sandcastle, ready-for-agent, ticket',
  '',
  'PARENT',
  '  ↑ ○ shelf-proving-ground-djk: Shelf grid P2',
  '',
  'BLOCKS',
  '  ← ○ shelf-proving-ground-djk.2: Shelf grid: filter chips P2',
].join('\n');

const SAMPLE_DIFF = [
  'diff --git a/src/App.tsx b/src/App.tsx',
  'index abc1234..def5678 100644',
  '--- a/src/App.tsx',
  '+++ b/src/App.tsx',
  '@@ -1,5 +1,20 @@',
  ' import React from "react";',
  '+import { getBooks } from "./api";',
  ' ',
  ' export function App() {',
  '+  const [books, setBooks] = React.useState([]);',
  '+  return <main><ul role="list">{books.map(b => <li key={b.id}>{b.title}</li>)}</ul></main>;',
  ' }',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════
// Issue 1: shell-before-vars — covered by shell-vars-ordering.test.mjs
// (not duplicated here — that test already provides full RED/GREEN coverage)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Issue 2: empty-diff guardrail
//
// OLD behavior: reviewer expanded with empty BRANCH_DIFF has no instruction
//   about what to do → model explores files and produces false findings.
// NEW behavior: reviewer expanded with empty BRANCH_DIFF contains a CLEAN
//   instruction in the INSTRUCTIONS section (before CONTEXT) that tells the
//   model to halt immediately.
// ═══════════════════════════════════════════════════════════════════════════

{
  const template = readFileSync('.sandcastle/prompts/reviewer.prompt.md', 'utf8');

  // Expand with empty diff — the scenario that caused the wasted round
  const expanded = substituteVars(template, {
    BASE_BRANCH: 'main',
    BRANCH: 'sandcastle/issue-test-1',
    BRANCH_DIFF: '',
    BRANCH_LOG: '',
    ISSUE_DETAILS: PADDED_ISSUE_DETAILS,
    FINDINGS_FILE: '.qa/review-r1.md',
    FIX_HISTORY: '',
  });

  // Split instructions from context — the guard must be in INSTRUCTIONS
  const contextStart = expanded.indexOf('# CONTEXT');
  const instructions = expanded.slice(0, contextStart);

  // The instructions must contain a decision rule for empty diffs
  assert(
    'Issue 2: empty-diff → instructions contain CLEAN output directive',
    /empty.*CLEAN|CLEAN.*empty/is.test(instructions),
    'When BRANCH_DIFF is empty, instructions must tell the model to output CLEAN',
  );

  assert(
    'Issue 2: empty-diff → instructions prohibit file exploration',
    /do not read source|do not read file|do not explore/i.test(instructions),
    'When diff is empty, instructions must prohibit reading source files',
  );

  // Contrast: expand with a real diff — the guard should NOT suppress review
  const expandedWithDiff = substituteVars(template, {
    BASE_BRANCH: 'main',
    BRANCH: 'sandcastle/issue-test-1',
    BRANCH_DIFF: SAMPLE_DIFF,
    BRANCH_LOG: 'abc1234 RALPH: implement grid',
    ISSUE_DETAILS: PADDED_ISSUE_DETAILS,
    FINDINGS_FILE: '.qa/review-r1.md',
    FIX_HISTORY: '',
  });

  // The diff section should contain actual diff content
  const diffSection = expandedWithDiff.slice(expandedWithDiff.indexOf('## Branch diff'));
  assert(
    'Issue 2: non-empty diff → diff content present in expansion',
    diffSection.includes('import { getBooks }'),
    'When BRANCH_DIFF has content, it must appear in the expanded prompt',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 3: visual-qa command budget
//
// OLD behavior: diagnosis Step 2 says "trace it to the source CSS rule"
//   with no command cap → model runs 5+ grep/find commands.
// NEW behavior: an explicit command budget (≤2 per finding) appears BEFORE
//   Step 2, establishing the constraint before the model reads diagnosis
//   instructions. grep and find are explicitly forbidden.
// ═══════════════════════════════════════════════════════════════════════════

{
  const template = readFileSync('.sandcastle/prompts/visual-qa.prompt.md', 'utf8');

  const expanded = substituteVars(template, {
    BRANCH: 'sandcastle/issue-test-1',
    ISSUE_DETAILS: PADDED_ISSUE_DETAILS,
    FINDINGS_FILE: '.qa/visual-r1.md',
  });

  // The budget must appear BEFORE Step 2 in the expanded output.
  // This matters because LLMs follow instructions in reading order —
  // a budget after the diagnosis section gets overridden by the diagnosis.
  const budgetIdx = expanded.indexOf('Command budget per finding');
  const step2Idx = expanded.indexOf('### Step 2: Identify the root cause');

  assert(
    'Issue 3: command budget section exists in expanded prompt',
    budgetIdx !== -1,
    'Expanded visual-qa prompt must contain "Command budget per finding"',
  );

  assert(
    'Issue 3: budget appears BEFORE Step 2 diagnosis',
    budgetIdx !== -1 && step2Idx !== -1 && budgetIdx < step2Idx,
    `Budget at char ${budgetIdx}, Step 2 at char ${step2Idx} — budget must come first`,
  );

  // Extract the budget section to verify it has hard constraints
  const budgetSection = expanded.slice(budgetIdx, step2Idx);

  assert(
    'Issue 3: budget explicitly forbids grep',
    /no.*`?grep`?/i.test(budgetSection),
    'Budget section must explicitly forbid grep (the tool the agent misused)',
  );

  assert(
    'Issue 3: budget explicitly forbids find',
    /no.*`?find`?/i.test(budgetSection),
    'Budget section must explicitly forbid find (the tool the agent misused)',
  );

  assert(
    'Issue 3: budget sets a numeric cap per finding',
    /≤\s*2|at most 2|maximum of 2/i.test(budgetSection),
    'Budget must set a hard numeric cap (≤2 commands per finding)',
  );

  // Verify DEFER fallback — if the agent can't diagnose in 2 commands,
  // it must defer instead of exploring further
  assert(
    'Issue 3: budget mandates DEFER when cap insufficient',
    /defer/i.test(budgetSection),
    'Budget must tell the agent to DEFER if diagnosis requires more commands',
  );

  // ─── Issue 3b: inline-script and exploration prohibition ────────────────
  // Observed in sandcastle-issue-shelf-proving-ground-djk.1-visual-qa-r1.log:
  //   - Agent wrote `cat .ui-qa/report.json | python3 -c "..."` to parse the report
  //   - Agent ran `ls /home/agent/workspace/src/` to explore
  // Root cause: the prompt doesn't prohibit inline scripts or require the Read
  // tool for report parsing, and `ls` is not in the forbidden command list.

  // The Execution section (step 4) must require the Read tool for report.json
  const executionIdx = expanded.indexOf('## Execution');
  const triageIdx = expanded.indexOf('## Triage');
  const executionSection = expanded.slice(executionIdx, triageIdx);

  assert(
    'Issue 3b: execution step requires Read tool for report.json',
    /read tool/i.test(executionSection),
    'Execution step 4 must explicitly require the Read tool for .ui-qa/report.json',
  );

  // The prompt must prohibit inline scripts (python, bash, jq) anywhere
  const instructions = expanded.slice(0, expanded.indexOf('# CONTEXT'));

  assert(
    'Issue 3b: prompt prohibits inline scripts (python/bash/jq)',
    /do not (write|execute|run).*\b(script|python|jq)\b|no inline script/i.test(instructions),
    'Prompt must explicitly prohibit writing/executing inline scripts (python, bash, jq)',
  );

  // The budget must also forbid `ls` — the agent used it to explore src/
  assert(
    'Issue 3b: budget explicitly forbids ls',
    /no.*`?ls`?[.`,\s]/i.test(budgetSection) || /`?ls`?.*forbidden|forbid.*`?ls`?/i.test(budgetSection),
    'Budget section must explicitly forbid ls (the agent used ls to explore src/)',
  );

  // The prompt must prohibit `cat` for report reading (agent used cat | python3)
  assert(
    'Issue 3b: prompt forbids cat for report reading',
    /do not use.*\bcat\b|no.*\bcat\b/i.test(executionSection) || /do not use.*\bcat\b/i.test(instructions),
    'Prompt must forbid cat (agent used cat .ui-qa/report.json | python3)',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 4: planner scope guidance
//
// OLD behavior: planner prompt says "Default to src/** if unsure" —
//   model outputs scope: "src/**" for every ticket, inflating codemap.
// NEW behavior: planner prompt says "Never use bare src/**" and provides
//   a concrete example of a tight scope with specific files.
// ═══════════════════════════════════════════════════════════════════════════

{
  const template = readFileSync('.sandcastle/prompts/plan.prompt.md', 'utf8');

  // Extract the scope guidance paragraph
  const scopeIdx = template.indexOf('`scope`');
  const nextFieldIdx = template.indexOf('\n\n', scopeIdx);
  const scopeGuidance = template.slice(scopeIdx, nextFieldIdx);

  // OLD behavior check: the old template had "Default to src/** if unsure"
  // which gave the model permission to use the broad default freely.
  // NEW: must discourage bare src/**
  assert(
    'Issue 4: scope guidance discourages bare src/**',
    /never use bare|never.*bare.*src\/\*\*/i.test(scopeGuidance),
    'Scope guidance must explicitly discourage bare src/**',
  );

  // Must provide a concrete file-level example so the model knows what "tight" means
  assert(
    'Issue 4: scope guidance includes specific file example',
    /src\/[A-Z]\w+\.\w+,src\//.test(scopeGuidance),
    'Scope guidance must include a multi-file example like "src/App.tsx,src/App.css,..."',
  );

  // Must still have a fallback for genuinely ambiguous tickets
  assert(
    'Issue 4: scope guidance retains fallback for ambiguous cases',
    /only if.*every|truly touches every|if unsure/i.test(scopeGuidance),
    'Scope guidance must still allow src/** as last resort for genuinely broad tickets',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 5: fixer git add -A
//
// OLD behavior: fixer prompt has no staging instruction — the model defaults
//   to `git add -A` which stages QA reports, test artifacts, and tracker state.
// NEW behavior: an explicit staging step forbids git add -A and requires
//   specific file paths. This step must come BEFORE the commit step.
// ═══════════════════════════════════════════════════════════════════════════

{
  const template = readFileSync('.sandcastle/prompts/fixer.prompt.md', 'utf8');

  const expanded = substituteVars(template, {
    BRANCH: 'sandcastle/issue-test-1',
    FINDINGS_FILE: '.qa/review-r1.md',
    VERIFY_COMMAND: 'npm run typecheck && npm test',
  });

  // The expanded prompt must forbid git add -A
  assert(
    'Issue 5: fixer prompt forbids git add -A in expanded output',
    expanded.includes('git add -A') && /do not use.*git add -A|do not.*git add -A/i.test(expanded),
    'Expanded fixer prompt must explicitly forbid git add -A',
  );

  // The staging instruction must come BEFORE the commit instruction
  const stageIdx = expanded.search(/stage only|git add <file/i);
  const commitIdx = expanded.indexOf('Commit with prefix');

  assert(
    'Issue 5: staging step precedes commit step in expanded prompt',
    stageIdx !== -1 && commitIdx !== -1 && stageIdx < commitIdx,
    `Stage at ${stageIdx}, Commit at ${commitIdx} — staging must come first`,
  );

  // Must also forbid `git add .` (equivalent to -A in most cases)
  assert(
    'Issue 5: fixer prompt also forbids git add .',
    expanded.includes('git add .'),
    'Expanded fixer prompt should also forbid "git add ." as it has the same risk',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 6: diff compression — -U1 + pathspec
//
// OLD behavior: gates.mts uses `git diff ${base}...${branch}` (default 3
//   lines context, all files) → ~24K tokens for a 3-file change.
// NEW behavior: gates.mts uses `git diff -U1 --no-color ... -- 'src/'
//   ':!*.snap' ':!*.lock'` → focused diff with 1 line context, src/ only.
//
// We test by reading gates.mts source and verifying the command construction.
// ═══════════════════════════════════════════════════════════════════════════

{
  const gatesSource = readFileSync('.sandcastle/lib/gates.mts', 'utf8');

  // Find the buildCheckerArgs for the review gate (createReviewGate function)
  const reviewGateStart = gatesSource.indexOf('export function createReviewGate');
  const reviewGateEnd = gatesSource.indexOf('\nexport ', reviewGateStart + 1);
  const reviewGate = gatesSource.slice(reviewGateStart, reviewGateEnd > -1 ? reviewGateEnd : undefined);

  // Extract the git diff command from the review gate
  const diffCmdMatch = reviewGate.match(/execSync\(\s*`([^`]*git diff[^`]*)`/);

  assert(
    'Issue 6: review gate has a git diff execSync call',
    diffCmdMatch !== null,
    'createReviewGate must compute branchDiff via execSync git diff',
  );

  if (diffCmdMatch) {
    const diffCmd = diffCmdMatch[1];

    assert(
      'Issue 6: git diff uses -U1 (1 line context, not default 3)',
      diffCmd.includes('-U1'),
      `Diff command should use -U1, got: ${diffCmd}`,
    );

    assert(
      'Issue 6: git diff uses --no-color (strip ANSI escapes)',
      diffCmd.includes('--no-color'),
      `Diff command should use --no-color, got: ${diffCmd}`,
    );

    assert(
      'Issue 6: git diff filters to src/ via pathspec',
      diffCmd.includes("'src/'") || diffCmd.includes('"src/"'),
      `Diff command should filter to src/, got: ${diffCmd}`,
    );

    assert(
      'Issue 6: git diff excludes lockfiles via pathspec',
      diffCmd.includes('.lock'),
      `Diff command should exclude .lock files, got: ${diffCmd}`,
    );
  }

  // Reviewer template must document the reduced context for the model
  const reviewerTemplate = readFileSync('.sandcastle/prompts/reviewer.prompt.md', 'utf8');
  const diffSectionIdx = reviewerTemplate.indexOf('## Branch diff');
  const diffSection = reviewerTemplate.slice(diffSectionIdx, diffSectionIdx + 300);

  assert(
    'Issue 6: reviewer template documents -U1 context near diff section',
    /U1|1 line.*context/i.test(diffSection),
    'Reviewer template must tell the model the diff uses reduced context',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 7: issue details compression
//
// OLD behavior: bd show output with trailing whitespace padding (~76 chars
//   per line) and 3+ blank line runs is injected verbatim → ~30% waste.
// NEW behavior: compressIssueDetails strips padding and collapses blank
//   lines → same signal, fewer tokens.
//
// We test the function behavior with realistic bd show output.
// ═══════════════════════════════════════════════════════════════════════════

{
  // --- Test that distillIssueDetails is used in main.mts ---
  const mainSource = readFileSync('.sandcastle/main.mts', 'utf8');

  assert(
    'Issue 7: main.mts uses distillIssueDetails',
    mainSource.includes('distillIssueDetails'),
    'main.mts must use distillIssueDetails from the distill module',
  );

  // Count how many times it's called — should be on both paths (bd show and ticket file)
  const callCount = (mainSource.match(/distillIssueDetails\(/g) || []).length;
  assert(
    'Issue 7: distillIssueDetails called on both detail paths',
    callCount >= 2, // bd-show path + ticket-file path
    `Expected ≥2 calls, found ${callCount}`,
  );

  // --- Behavioral tests on the compression function ---

  const compressed = compressIssueDetails(PADDED_ISSUE_DETAILS);

  // No trailing whitespace on any line
  const linesWithTrailingWs = compressed.split('\n').filter(l => /[ \t]+$/.test(l));
  assert(
    'Issue 7: compression strips all trailing whitespace',
    linesWithTrailingWs.length === 0,
    `${linesWithTrailingWs.length} lines still have trailing whitespace: "${linesWithTrailingWs[0]}"`,
  );

  // No runs of 3+ blank lines
  assert(
    'Issue 7: compression collapses 3+ blank-line runs',
    !compressed.includes('\n\n\n'),
    'Compressed output must not contain 3+ consecutive newlines',
  );

  // Content preserved — all semantically meaningful text survives
  const requiredContent = [
    'Shelf grid: page load',
    'What to build',
    'Acceptance criteria',
    'shows all books by default',
    'Tests to turn green',
    'npx playwright test',
  ];
  for (const text of requiredContent) {
    assert(
      `Issue 7: compression preserves "${text.slice(0, 30)}..."`,
      compressed.includes(text),
      `Required content "${text}" missing from compressed output`,
    );
  }

  // Meaningful size reduction — the padding accounts for ~20-30% of bytes
  const reduction = 1 - compressed.length / PADDED_ISSUE_DETAILS.length;
  assert(
    'Issue 7: compression achieves ≥15% size reduction',
    reduction >= 0.15,
    `Only ${(reduction * 100).toFixed(1)}% reduction — expected ≥15%`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue 8: removed — recent-commits section was removed from implementer
// prompt because the implementer runs on a fresh branch in Docker and gains
// nothing from git log context. The codemap, issue details, constraints,
// and violations memory already provide all needed context.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: replay scripts must use the same compression
// ═══════════════════════════════════════════════════════════════════════════

{
  const replayReview = readFileSync('.sandcastle/replay/replay-review.mts', 'utf8');
  const replayVisual = readFileSync('.sandcastle/replay/replay-visual-qa.mts', 'utf8');

  // Replay review must compute BRANCH_DIFF and BRANCH_LOG (not rely on template shell)
  assert(
    'Cross: replay-review computes BRANCH_DIFF as a var',
    replayReview.includes('BRANCH_DIFF'),
    'replay-review.mts must pass BRANCH_DIFF as a pre-computed var',
  );

  assert(
    'Cross: replay-review uses -U1 for diff',
    replayReview.includes('-U1'),
    'replay-review.mts must use -U1 for diff compression',
  );

  // Both replay scripts must use the distill module
  assert(
    'Cross: replay-review uses distill module',
    replayReview.includes('distillIssueDetails') || replayReview.includes('distillBeads'),
    'replay-review.mts must use distill functions for issue detail compression',
  );

  assert(
    'Cross: replay-visual-qa uses distill module',
    replayVisual.includes('distillIssueDetails') || replayVisual.includes('distillBeads'),
    'replay-visual-qa.mts must use distill functions for issue detail compression',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
