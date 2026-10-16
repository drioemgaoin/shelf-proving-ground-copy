#!/usr/bin/env node
/**
 * TGF-14: pipeline-budget-exceeded — halt + label ALL in-flight
 *
 * Integration-mocked: reimplements the executeInParallel + main-loop
 * error handling from phases.mts and main.mts with stubbed agent runs.
 *
 * Spec: "Cumulative LLM spend ≥ cost ceiling → pipeline-budget-exceeded:
 *        Full pipeline halt, label all in-flight tickets" (line 1255)
 *
 * Code bug: CostCeilingExceededError is thrown in tagged-agent.mts:147-152
 * but main.mts has no catch to label in-flight tickets. Tickets stuck
 * in_progress with no signal.
 *
 * Seam: CostCeilingExceededError handling in main loop
 * Source: .sandcastle/lib/tagged-agent.mts:147-152, .sandcastle/main.mts
 */

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => passed++)
    .catch((e) => { failed++; failures.push(`FAIL: ${label} — ${e.message}`); });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ---------------------------------------------------------------------------
// Reimplemented cost ceiling + pipeline halt logic
//
// Current production code (BUGGY):
//   - CostCeilingExceededError thrown inside logRunStats
//   - Promise.allSettled catches it per-issue in executeInParallel
//   - main.mts has no catch → error either silently swallowed or unhandled
//   - No code labels in-flight tickets
//
// Spec-correct logic:
//   - When CostCeilingExceededError is detected, label ALL in-flight
//     tickets with "pipeline-budget-exceeded" and halt
// ---------------------------------------------------------------------------

class CostCeilingExceededError extends Error {
  constructor(cost, ceiling) {
    super(`Pipeline cost ceiling exceeded: $${cost.toFixed(2)} >= $${ceiling}`);
    this.name = 'CostCeilingExceededError';
  }
}

/**
 * Simulates executeInParallel with cost ceiling awareness.
 * Returns { completed, halted, labeledIssues } where labeledIssues
 * are the issues labeled with pipeline-budget-exceeded.
 *
 * This is the SPEC-CORRECT behavior we're testing for.
 */
async function executeWithBudgetHandling(issues, runIssueFn, labelFn) {
  const settled = await Promise.allSettled(
    issues.map((issue) => runIssueFn(issue)),
  );

  // Detect if any issue hit the cost ceiling
  const budgetError = settled.find(
    (s) => s.status === 'rejected' && s.reason instanceof CostCeilingExceededError,
  );

  if (budgetError) {
    // Spec: "label all in-flight tickets"
    const labeledIssues = [];
    for (const issue of issues) {
      labelFn(issue.id, 'pipeline-budget-exceeded');
      labeledIssues.push(issue.id);
    }
    return { completed: [], halted: true, labeledIssues };
  }

  const completed = settled
    .map((outcome, i) => ({ outcome, issue: issues[i] }))
    .filter((e) => e.outcome.status === 'fulfilled' && e.outcome.value.commits.length > 0)
    .map((e) => e.issue);

  return { completed, halted: false, labeledIssues: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(id) {
  return { id, title: `Issue ${id}`, branch: `sandcastle/issue-${id}`, touchesUI: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-14a: Cost ceiling hit — all in-flight tickets labeled pipeline-budget-exceeded', async () => {
  const issues = [makeIssue('ticket-1'), makeIssue('ticket-2'), makeIssue('ticket-3')];
  const labelCalls = [];

  const runIssueFn = async (issue) => {
    if (issue.id === 'ticket-2') {
      throw new CostCeilingExceededError(52.30, 50);
    }
    return { commits: [{ sha: 'abc' }], iterations: [{}] };
  };

  const labelFn = (id, label) => { labelCalls.push({ id, label }); };

  const result = await executeWithBudgetHandling(issues, runIssueFn, labelFn);

  assert(result.halted === true, `Pipeline must halt on cost ceiling`);
  assert(result.labeledIssues.length === 3,
    `All 3 in-flight tickets must be labeled, got ${result.labeledIssues.length}`);

  for (const issue of issues) {
    const call = labelCalls.find((c) => c.id === issue.id);
    assert(call, `Missing label call for ${issue.id}`);
    assert(call.label === 'pipeline-budget-exceeded',
      `Expected label "pipeline-budget-exceeded" for ${issue.id}, got "${call.label}"`);
  }
});

await test('TGF-14b: Cost ceiling hit — no issues proceed to merge', async () => {
  const issues = [makeIssue('ticket-1'), makeIssue('ticket-2')];

  const runIssueFn = async (issue) => {
    if (issue.id === 'ticket-1') {
      return { commits: [{ sha: 'abc' }], iterations: [{}] };
    }
    throw new CostCeilingExceededError(55, 50);
  };

  const labelFn = () => {};

  const result = await executeWithBudgetHandling(issues, runIssueFn, labelFn);

  assert(result.halted === true, `Pipeline must halt`);
  assert(result.completed.length === 0,
    `No issues should be returned for merging, got ${result.completed.length}`);
});

await test('TGF-14c: No cost ceiling — normal completion', async () => {
  const issues = [makeIssue('ticket-1'), makeIssue('ticket-2')];

  const runIssueFn = async () => ({ commits: [{ sha: 'abc' }], iterations: [{}] });
  const labelFn = () => {};

  const result = await executeWithBudgetHandling(issues, runIssueFn, labelFn);

  assert(result.halted === false, `Pipeline should not halt`);
  assert(result.completed.length === 2, `Both issues should complete, got ${result.completed.length}`);
  assert(result.labeledIssues.length === 0, `No labels should be applied`);
});

await test('TGF-14d: Cost ceiling hit — pipeline loop terminates (no further iterations)', async () => {
  // Simulates the main loop: if executeInParallel signals halt, the loop breaks
  const MAX_ITERATIONS = 5;
  let iterationsRun = 0;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    iterationsRun = i;
    const issues = [makeIssue('t-1')];
    const runIssueFn = async () => {
      if (i === 2) throw new CostCeilingExceededError(60, 50);
      return { commits: [{ sha: 'a' }], iterations: [{}] };
    };
    const labelFn = () => {};

    const result = await executeWithBudgetHandling(issues, runIssueFn, labelFn);
    if (result.halted) break;
  }

  assert(iterationsRun === 2, `Pipeline should halt at iteration 2, ran ${iterationsRun}`);
});

await test('TGF-14e: Cost ceiling with single issue — still labeled and halted', async () => {
  const issues = [makeIssue('only-ticket')];
  const labelCalls = [];

  const runIssueFn = async () => { throw new CostCeilingExceededError(50, 50); };
  const labelFn = (id, label) => { labelCalls.push({ id, label }); };

  const result = await executeWithBudgetHandling(issues, runIssueFn, labelFn);

  assert(result.halted === true, `Must halt`);
  assert(labelCalls.length === 1, `Single ticket must be labeled`);
  assert(labelCalls[0].id === 'only-ticket', `Labeled wrong ticket`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`budget-halt tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
