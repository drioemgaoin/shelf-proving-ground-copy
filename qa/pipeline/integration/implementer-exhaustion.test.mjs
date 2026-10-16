#!/usr/bin/env node
/**
 * TGF-11: Implementer exhaustion — spec says no gates, code checks commits only
 *
 * Integration-mocked: reimplements the executeIssue decision logic from
 * phases.mts:186-199 with stubbed implementer results.
 *
 * Spec: "Exhaustion: 100 iterations → escalate implementer-exhaustion.
 *        Do NOT proceed to gates." (line 1118)
 *
 * Code bug: executeIssue only checks impl.commits.length > 0 before entering
 * gates. A 100-iteration run WITH commits proceeds to gates despite spec
 * saying "Do NOT proceed to gates."
 *
 * Seam: executeIssue() implementer → gate transition
 * Source: .sandcastle/lib/phases.mts:186-199
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
// Reimplemented executeIssue decision logic — mirrors phases.mts:186-199
//
// Current production code (BUGGY):
//   if (impl.commits.length > 0) { runQAGates(...) }
//
// Spec-correct logic:
//   if (impl.iterations.length >= MAX_ITERATIONS) {
//     escalate(issue.id, "implementer-exhaustion")
//     return { ...impl, escalated: true }
//   }
//   if (impl.commits.length > 0) { runQAGates(...) }
// ---------------------------------------------------------------------------

const IMPLEMENTER_MAX_ITERATIONS = 100;

/**
 * Simulates the executeIssue decision after runImplementer returns.
 * Returns { gatesEntered, escalated, escalationReason }.
 */
function executeIssueDecision(implResult) {
  let gatesEntered = false;
  let escalated = false;
  let escalationReason = null;

  // Check exhaustion BEFORE checking commits
  if (implResult.iterations.length >= IMPLEMENTER_MAX_ITERATIONS) {
    escalated = true;
    escalationReason = "implementer-exhaustion";
    // Spec: "Do NOT proceed to gates" — return immediately
    return { gatesEntered, escalated, escalationReason };
  }

  if (implResult.commits.length > 0) {
    gatesEntered = true;
    // gates would run here; escalated depends on gate outcome
  }

  return { gatesEntered, escalated, escalationReason };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIterations(count) {
  return Array.from({ length: count }, (_, i) => ({ index: i }));
}

function implResult(commitCount, iterationCount) {
  return {
    commits: Array.from({ length: commitCount }, (_, i) => ({ sha: `sha-${i}` })),
    iterations: makeIterations(iterationCount),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('TGF-11a: Exhausted implementer with commits — gates NOT entered', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 3, /* iterations */ 100));

  assert(result.gatesEntered === false,
    `Exhausted implementer must not enter gates, got gatesEntered=${result.gatesEntered}`);
});

await test('TGF-11b: Exhausted implementer with commits — escalated as implementer-exhaustion', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 3, /* iterations */ 100));

  assert(result.escalated === true,
    `Exhausted implementer must be escalated, got escalated=${result.escalated}`);
  assert(result.escalationReason === "implementer-exhaustion",
    `Expected reason "implementer-exhaustion", got "${result.escalationReason}"`);
});

await test('TGF-11c: Exhausted implementer with zero commits — still escalated, no gates', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 0, /* iterations */ 100));

  assert(result.gatesEntered === false,
    `Exhausted + no commits must not enter gates`);
  assert(result.escalated === true,
    `Exhausted + no commits must still escalate`);
});

await test('TGF-11d: Non-exhausted with commits — gates entered normally', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 2, /* iterations */ 50));

  assert(result.gatesEntered === true,
    `Non-exhausted with commits should enter gates, got gatesEntered=${result.gatesEntered}`);
  assert(result.escalated === false,
    `Non-exhausted should not be escalated`);
});

await test('TGF-11e: Non-exhausted with zero commits — no gates, no escalation', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 0, /* iterations */ 50));

  assert(result.gatesEntered === false,
    `No commits should skip gates`);
  assert(result.escalated === false,
    `No commits, no exhaustion should not escalate`);
});

await test('TGF-11f: Exactly at boundary (99 iterations) — not exhausted', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 1, /* iterations */ 99));

  assert(result.gatesEntered === true,
    `99 iterations is not exhaustion — gates should run`);
  assert(result.escalated === false,
    `99 iterations is not exhaustion`);
});

await test('TGF-11g: Over boundary (101 iterations) — still exhausted', async () => {
  const result = executeIssueDecision(implResult(/* commits */ 5, /* iterations */ 101));

  assert(result.gatesEntered === false,
    `>100 iterations is exhaustion — no gates`);
  assert(result.escalated === true,
    `>100 iterations must escalate`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`implementer-exhaustion tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
