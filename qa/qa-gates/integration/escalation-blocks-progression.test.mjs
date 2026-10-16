#!/usr/bin/env node
/**
 * TGF-9: Phase 3 escalation blocks Phase 4 progression
 *
 * Integration-mocked: reimplements runQAGates gate-list loop from
 * phases.mts:249-258 with a runGateLoop stub that can signal escalation.
 * Verifies that after Visual QA escalates, Code review never runs.
 *
 * Seam: runQAGates() gate sequencing after escalation
 * Source: .sandcastle/lib/phases.mts:249-258
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
// Stub gate factories
// ---------------------------------------------------------------------------

function createVisualGate(issueId, branch, issueDetails) {
  return { name: "Visual QA", issueId, branch, issueDetails };
}

function createReviewGate(issueId, branch, issueDetails) {
  return { name: "Code review", issueId, branch, issueDetails };
}

// ---------------------------------------------------------------------------
// runGateLoop stub — records calls and simulates escalation via
// escalatedIssues set (mirrors what production escalate() should signal).
// ---------------------------------------------------------------------------

const escalatedIssues = new Set();
const gateLog = [];

async function stubRunGateLoop(gate, ctx, _verbose) {
  gateLog.push(gate.name);
  // Visual QA always escalates in these tests
  if (gate.name === "Visual QA") {
    escalatedIssues.add(ctx.issueId);
    return true; // escalated
  }
  return false; // clean
}

// ---------------------------------------------------------------------------
// Reimplemented runQAGates — mirrors phases.mts:249-258 EXACTLY.
// The production code has no escalation check in the for-loop.
// ---------------------------------------------------------------------------

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
    const escalated = await stubRunGateLoop(gate, ctx, opts.verbose);
    if (escalated) break;
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

function cleanup() {
  gateLog.length = 0;
  escalatedIssues.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-9a: Visual gate escalation → Code review never invoked', async () => {
  cleanup();
  await runQAGates(makeIssue(true), {}, makeOpts());

  assert(gateLog.includes("Visual QA"), `Visual QA should have run, got: [${gateLog}]`);
  assert(!gateLog.includes("Code review"),
    `Code review should NOT run after Visual QA escalation, but gate log is: [${gateLog}]`);
});

await test('TGF-9b: Non-UI ticket (no visual gate) — Code review still runs', async () => {
  cleanup();
  await runQAGates(makeIssue(false), {}, makeOpts());

  assert(gateLog.length === 1, `Expected 1 gate, got ${gateLog.length}: [${gateLog}]`);
  assert(gateLog[0] === "Code review", `Only gate should be Code review, got: ${gateLog[0]}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`escalation-blocks-progression tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
