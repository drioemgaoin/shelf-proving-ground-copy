#!/usr/bin/env node
/**
 * TGF-5: runQAGates — phase routing (UI vs non-UI)
 *
 * Integration-mocked: reimplements runQAGates gate-list construction from
 * phases.mts:249-254 with stubbed gate factories and runGateLoop.
 * Verifies that touchesUI controls whether the visual gate is included.
 *
 * Seam: runQAGates(issue, sandbox, opts) gate list
 * Source: .sandcastle/lib/phases.mts:231-259
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
// Stub gate factories (mirrors gates.mts createVisualGate / createReviewGate)
// Return minimal descriptors with only the `name` field needed for routing.
// ---------------------------------------------------------------------------

function createVisualGate(issueId, branch, issueDetails) {
  return { name: "Visual QA", issueId, branch, issueDetails };
}

function createReviewGate(issueId, branch, issueDetails) {
  return { name: "Code review", issueId, branch, issueDetails };
}

// ---------------------------------------------------------------------------
// Reimplemented runQAGates gate-list logic (mirrors phases.mts:249-258)
// runGateLoop replaced with a recording stub — we only care about which
// gates are composed, not their execution.
// ---------------------------------------------------------------------------

const gateLog = [];

async function stubRunGateLoop(gate, _ctx, _verbose) {
  gateLog.push(gate.name);
}

async function runQAGates(issue, sandbox, opts) {
  const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;
  const issueDetails = opts.issueDetails.get(issue.id);

  const ctx = {
    issueId: issue.id,
    branch: issue.branch,
    worktree,
    sandbox,
    state: { reviewBase: "main", fixHistory: "" },
  };

  const gates = [
    ...(issue.touchesUI
      ? [createVisualGate(issue.id, issue.branch, issueDetails)]
      : []),
    createReviewGate(issue.id, issue.branch, issueDetails),
  ];

  for (const gate of gates) {
    await stubRunGateLoop(gate, ctx, opts.verbose);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(touchesUI) {
  return {
    id: "beads-test.1",
    title: "Test issue",
    branch: "sandcastle/issue-beads-test.1",
    touchesUI,
    scope: "src/**",
  };
}

function makeOpts() {
  const details = new Map();
  details.set("beads-test.1", "Some issue details");
  return { issueDetails: details, verbose: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-5a: touchesUI true — gate list is [Visual QA, Code review]', async () => {
  gateLog.length = 0;
  await runQAGates(makeIssue(true), {}, makeOpts());
  assert(gateLog.length === 2, `Expected 2 gates, got ${gateLog.length}: [${gateLog}]`);
  assert(gateLog[0] === "Visual QA", `First gate should be Visual QA, got: ${gateLog[0]}`);
  assert(gateLog[1] === "Code review", `Second gate should be Code review, got: ${gateLog[1]}`);
});

await test('TGF-5b: touchesUI false — gate list is [Code review] only', async () => {
  gateLog.length = 0;
  await runQAGates(makeIssue(false), {}, makeOpts());
  assert(gateLog.length === 1, `Expected 1 gate, got ${gateLog.length}: [${gateLog}]`);
  assert(gateLog[0] === "Code review", `Only gate should be Code review, got: ${gateLog[0]}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`runQAGates routing tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
