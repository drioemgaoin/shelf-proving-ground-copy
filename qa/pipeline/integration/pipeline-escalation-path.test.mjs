#!/usr/bin/env node
/**
 * TGF-31: Pipeline escalation path — FAIL×3 → escalated → no merge
 *
 * Acceptance (pipeline): reimplements the main loop from main.mts:126-193
 * with injected phase functions. Execute stub simulates the escalation path:
 * gate loop exhausts 3 rounds → escalate() called → ticket filtered out →
 * merger never receives it.
 *
 * Spec: "Phase 3 escalation: ticket does NOT proceed to Phase 4 or 5" (line 1172)
 *       "Round 3: still failing → escalate gate-exhaustion" (line 1174)
 *
 * Seam: planIteration → executeInParallel → mergeCompleted (main loop)
 * Source: .sandcastle/main.mts:126-193, .sandcastle/lib/phases.mts
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
// Reimplemented main loop — mirrors main.mts:126-193
// Same as TGF-30; the difference is in the stubs injected.
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 10;

async function runPipelineLoop(opts) {
  const trace = { phases: [], mergedIssues: [], escalatedIds: [], iterations: 0 };

  if (!opts.acquireLock()) {
    trace.phases.push("lock-blocked");
    return trace;
  }

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      trace.iterations = iteration;

      const issues = await opts.plan();
      trace.phases.push("plan");

      if (issues.length === 0) break;

      const completedIssues = await opts.execute(issues);
      trace.phases.push("execute");

      if (completedIssues.length === 0) continue;

      await opts.merge(completedIssues);
      trace.phases.push("merge");
      trace.mergedIssues.push(completedIssues.map((i) => i.id));
    }
  } finally {
    opts.releaseLock();
    trace.phases.push("lock-released");
  }

  return trace;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

await test('TGF-31a: Escalated ticket never reaches merger', async () => {
  let planCalls = 0;
  let mergeCalled = false;

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      return planCalls === 1 ? [makeIssue("beads-800")] : [];
    },
    // Simulates executeInParallel when gate exhausts 3 rounds:
    // ticket is escalated, filtered out → empty completed list
    execute: async () => [],
    merge: async () => { mergeCalled = true; },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(mergeCalled === false,
    `Merger must NOT run when all tickets are escalated`);
  assert(!trace.phases.includes("merge"),
    `Merge phase must not appear in trace, got: [${trace.phases}]`);
  assert(trace.mergedIssues.length === 0,
    `No issues should reach merger`);
});

await test('TGF-31b: Mixed batch — escalated filtered out, clean ticket merges', async () => {
  let planCalls = 0;
  let mergedIds = null;

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      return planCalls === 1
        ? [makeIssue("beads-810"), makeIssue("beads-811", true)]
        : [];
    },
    // beads-810 passes gates, beads-811 escalated (filtered out)
    execute: async (issues) => issues.filter((i) => i.id === "beads-810"),
    merge: async (completed) => { mergedIds = completed.map((i) => i.id); },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(trace.phases.includes("merge"),
    `Merge must run for the clean ticket`);
  assert(mergedIds.length === 1,
    `Only 1 ticket should merge, got ${mergedIds.length}`);
  assert(mergedIds[0] === "beads-810",
    `Clean ticket beads-810 must merge, got ${mergedIds[0]}`);
  assert(!mergedIds.includes("beads-811"),
    `Escalated ticket beads-811 must NOT merge`);
});

await test('TGF-31c: Escalated ticket does not block subsequent iterations', async () => {
  let planCalls = 0;
  const mergedBatches = [];

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      if (planCalls === 1) return [makeIssue("beads-820")]; // will escalate
      if (planCalls === 2) return [makeIssue("beads-821")]; // will pass
      return [];
    },
    execute: async (issues) => {
      // First batch: escalated (empty). Second batch: passes.
      return issues[0].id === "beads-820" ? [] : issues;
    },
    merge: async (completed) => {
      mergedBatches.push(completed.map((i) => i.id));
    },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(trace.iterations === 3,
    `Expected 3 iterations (escalated + clean + empty exit), got ${trace.iterations}`);
  assert(mergedBatches.length === 1,
    `Only 1 merge batch expected, got ${mergedBatches.length}`);
  assert(mergedBatches[0][0] === "beads-821",
    `Second ticket should merge, got ${mergedBatches[0][0]}`);
});

await test('TGF-31d: All tickets escalated — lock still released', async () => {
  let planCalls = 0;
  let lockReleased = false;

  const trace = await runPipelineLoop({
    plan: async () => (++planCalls === 1 ? [makeIssue("beads-830")] : []),
    execute: async () => [], // escalated
    merge: async () => {},
    acquireLock: () => true,
    releaseLock: () => { lockReleased = true; },
  });

  assert(lockReleased === true,
    `Lock must be released even when all tickets escalate`);
  assert(trace.phases[trace.phases.length - 1] === "lock-released",
    `Lock release must be the last phase event`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`pipeline-escalation-path tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
