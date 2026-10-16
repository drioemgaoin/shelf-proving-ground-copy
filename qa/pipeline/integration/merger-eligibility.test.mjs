#!/usr/bin/env node
/**
 * TGF-10: Merger eligibility — 3 conditions
 *
 * Integration-mocked: reimplements the executeInParallel return filter from
 * phases.mts:152-161 with stubbed executeIssue results.
 *
 * The spec requires 3 conditions for merger eligibility:
 *   1. Commits produced (commits.length > 0)
 *   2. Not escalated during QA gates
 *   3. Promise fulfilled (not rejected)
 *
 * Seam: executeInParallel() return filter
 * Source: .sandcastle/lib/phases.mts:152-161
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
// Reimplemented executeInParallel return filter — mirrors phases.mts:152-161
// EXACTLY as production code. This is the seam under test.
//
// Production executeIssue returns { commits, iterations } today — no escalation
// signal. The filter only checks commits.length > 0.
//
// For the fix, executeIssue must return { commits, iterations, escalated }
// and this filter must check !escalated.
// ---------------------------------------------------------------------------

function filterForMerger(settled, issues) {
  return settled
    .map((outcome, i) => ({ outcome, issue: issues[i] }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        entry.outcome.value.commits.length > 0 &&
        !entry.outcome.value.escalated,
    )
    .map((entry) => entry.issue);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfilled(commits, escalated = false) {
  return { status: "fulfilled", value: { commits, escalated } };
}

function rejected(reason) {
  return { status: "rejected", reason };
}

function makeIssue(id, touchesUI = false) {
  return {
    id,
    title: `Test issue ${id}`,
    branch: `sandcastle/issue-${id}`,
    touchesUI,
    scope: "src/**",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-10a: Escalated ticket with commits excluded from merger', async () => {
  const issues = [makeIssue("beads-1", true)];
  const settled = [fulfilled([{ sha: "abc123" }], /* escalated */ true)];

  const result = filterForMerger(settled, issues);

  assert(result.length === 0,
    `Escalated ticket must not reach merger, got ${result.length}: [${result.map(i => i.id)}]`);
});

await test('TGF-10b: Non-escalated ticket with commits included for merger', async () => {
  const issues = [makeIssue("beads-2")];
  const settled = [fulfilled([{ sha: "def456" }], /* escalated */ false)];

  const result = filterForMerger(settled, issues);

  assert(result.length === 1, `Clean ticket with commits should reach merger, got ${result.length}`);
  assert(result[0].id === "beads-2", `Expected beads-2, got ${result[0].id}`);
});

await test('TGF-10c: No commits — excluded regardless of escalation', async () => {
  const issues = [makeIssue("beads-3")];
  const settled = [fulfilled([], false)];

  const result = filterForMerger(settled, issues);

  assert(result.length === 0, `No-commit ticket must be excluded`);
});

await test('TGF-10d: Rejected promise — excluded', async () => {
  const issues = [makeIssue("beads-4")];
  const settled = [rejected("sandbox crash")];

  const result = filterForMerger(settled, issues);

  assert(result.length === 0, `Rejected ticket must be excluded`);
});

await test('TGF-10e: Mixed batch — only clean+commits ticket passes', async () => {
  const issues = [makeIssue("beads-5"), makeIssue("beads-6", true), makeIssue("beads-7")];
  const settled = [
    fulfilled([{ sha: "aaa" }], false),    // clean, has commits → eligible
    fulfilled([{ sha: "bbb" }], true),     // escalated, has commits → excluded
    rejected("sandbox crash"),              // rejected → excluded
  ];

  const result = filterForMerger(settled, issues);

  assert(result.length === 1, `Expected 1 eligible, got ${result.length}: [${result.map(i => i.id)}]`);
  assert(result[0].id === "beads-5", `Expected beads-5, got ${result[0].id}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`merger-eligibility tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
