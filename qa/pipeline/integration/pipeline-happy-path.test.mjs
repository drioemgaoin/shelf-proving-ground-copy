#!/usr/bin/env node
/**
 * TGF-30: Pipeline happy path — open → gates PASS → merge → closed
 *
 * Acceptance (pipeline): reimplements the main loop from main.mts:126-193
 * with mocked phase functions to prove the full lifecycle composes correctly.
 *
 * Spec: "Phase 1: Planner ... Phase 2: Implementer ... Phase 3: Visual Gate
 *        ... Phase 4: Code Gate ... Phase 5: Merger" (lines 1108-1136)
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
//
// The real loop calls planIteration, executeInParallel, mergeCompleted
// sequentially in a for-loop bounded by MAX_ITERATIONS. This reimplementation
// accepts injected phase functions so we can verify composition.
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 10;

/**
 * @param {object} opts
 * @param {() => Promise<Array<{id:string, title:string, branch:string, touchesUI:boolean}>>} opts.plan
 * @param {(issues: any[]) => Promise<any[]>} opts.execute
 * @param {(completed: any[]) => Promise<void>} opts.merge
 * @param {() => boolean} opts.acquireLock
 * @param {() => void} opts.releaseLock
 * @returns {Promise<{phases: string[], mergedIssues: string[][], iterations: number}>}
 */
async function runPipelineLoop(opts) {
  const trace = { phases: [], mergedIssues: [], iterations: 0 };

  if (!opts.acquireLock()) {
    trace.phases.push("lock-blocked");
    return trace;
  }

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      trace.iterations = iteration;

      // Phase 1: Plan
      const issues = await opts.plan();
      trace.phases.push("plan");

      if (issues.length === 0) {
        break;
      }

      // Phase 2: Execute + QA Gates
      const completedIssues = await opts.execute(issues);
      trace.phases.push("execute");

      if (completedIssues.length === 0) {
        continue;
      }

      // Phase 3: Merge
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

await test('TGF-30a: Happy path — plan → execute → merge, all phases fire', async () => {
  const issue = makeIssue("beads-100");
  let planCalls = 0;

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      // First call returns the issue, second returns empty (no more work)
      return planCalls === 1 ? [issue] : [];
    },
    execute: async (issues) => issues, // all pass
    merge: async () => {},
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(
    trace.phases.includes("plan"),
    `Plan phase must execute, got: [${trace.phases}]`,
  );
  assert(
    trace.phases.includes("execute"),
    `Execute phase must execute, got: [${trace.phases}]`,
  );
  assert(
    trace.phases.includes("merge"),
    `Merge phase must execute, got: [${trace.phases}]`,
  );
  assert(
    trace.mergedIssues.length === 1 && trace.mergedIssues[0][0] === "beads-100",
    `Issue beads-100 must reach merger`,
  );
});

await test('TGF-30b: Issue from plan flows into execute and merge unchanged', async () => {
  const issue = makeIssue("beads-200", true);
  let executedIssues = null;
  let mergedIssues = null;
  let planCalls = 0;

  await runPipelineLoop({
    plan: async () => (++planCalls === 1 ? [issue] : []),
    execute: async (issues) => {
      executedIssues = issues;
      return issues;
    },
    merge: async (completed) => {
      mergedIssues = completed;
    },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(executedIssues.length === 1, `Execute must receive 1 issue`);
  assert(executedIssues[0].id === "beads-200", `Execute must receive beads-200`);
  assert(executedIssues[0].touchesUI === true, `touchesUI must be preserved`);
  assert(mergedIssues.length === 1, `Merge must receive 1 issue`);
  assert(mergedIssues[0].id === "beads-200", `Merge must receive beads-200`);
});

await test('TGF-30c: Zero completed issues — merger skipped, loop continues', async () => {
  let planCalls = 0;
  let mergeCalled = false;

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      if (planCalls === 1) return [makeIssue("beads-300")];
      if (planCalls === 2) return [makeIssue("beads-301")];
      return [];
    },
    execute: async () => [], // no commits — all filtered out
    merge: async () => { mergeCalled = true; },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(mergeCalled === false, `Merge must NOT run when 0 completed issues`);
  assert(!trace.phases.includes("merge"), `Merge phase must not appear in trace`);
  assert(planCalls === 3, `Planner must be called again after empty execute (got ${planCalls})`);
});

await test('TGF-30d: Planner returns empty — loop exits immediately', async () => {
  let executeCalled = false;

  const trace = await runPipelineLoop({
    plan: async () => [],
    execute: async () => { executeCalled = true; return []; },
    merge: async () => {},
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(executeCalled === false, `Execute must NOT run when planner returns empty`);
  assert(trace.iterations === 1, `Loop must exit on first iteration`);
  assert(trace.phases.filter((p) => p === "plan").length === 1, `Only one plan call`);
});

await test('TGF-30e: Lock acquired at start, released at end', async () => {
  let lockAcquired = false;
  let lockReleased = false;
  let planCalls = 0;

  const trace = await runPipelineLoop({
    plan: async () => (++planCalls === 1 ? [makeIssue("beads-400")] : []),
    execute: async (issues) => issues,
    merge: async () => {},
    acquireLock: () => { lockAcquired = true; return true; },
    releaseLock: () => { lockReleased = true; },
  });

  assert(lockAcquired === true, `Lock must be acquired`);
  assert(lockReleased === true, `Lock must be released`);
  assert(
    trace.phases[trace.phases.length - 1] === "lock-released",
    `Lock release must be the last phase event`,
  );
});

await test('TGF-30f: Lock blocked — no phases execute', async () => {
  let planCalled = false;

  const trace = await runPipelineLoop({
    plan: async () => { planCalled = true; return []; },
    execute: async () => [],
    merge: async () => {},
    acquireLock: () => false,
    releaseLock: () => {},
  });

  assert(planCalled === false, `Plan must NOT run when lock is blocked`);
  assert(trace.phases.includes("lock-blocked"), `Trace must record lock-blocked`);
  assert(trace.iterations === 0, `No iterations when lock blocked`);
});

await test('TGF-30g: Lock released even when execute throws', async () => {
  let lockReleased = false;
  let planCalls = 0;

  let threw = false;
  try {
    await runPipelineLoop({
      plan: async () => (++planCalls === 1 ? [makeIssue("beads-500")] : []),
      execute: async () => { throw new Error("sandbox crash"); },
      merge: async () => {},
      acquireLock: () => true,
      releaseLock: () => { lockReleased = true; },
    });
  } catch {
    threw = true;
  }

  assert(threw === true, `Error must propagate`);
  assert(lockReleased === true, `Lock must be released even on error`);
});

await test('TGF-30h: Multi-iteration — two tickets across two iterations', async () => {
  let planCalls = 0;
  const mergedBatches = [];

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      if (planCalls === 1) return [makeIssue("beads-600")];
      if (planCalls === 2) return [makeIssue("beads-601")];
      return [];
    },
    execute: async (issues) => issues,
    merge: async (completed) => { mergedBatches.push(completed.map((i) => i.id)); },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(mergedBatches.length === 2, `Two merge batches expected, got ${mergedBatches.length}`);
  assert(mergedBatches[0][0] === "beads-600", `First batch: beads-600`);
  assert(mergedBatches[1][0] === "beads-601", `Second batch: beads-601`);
  assert(trace.iterations === 3, `3 iterations (2 with work + 1 empty exit)`);
});

await test('TGF-30i: MAX_ITERATIONS cap — loop stops at boundary', async () => {
  let planCalls = 0;
  let mergeCalls = 0;

  const trace = await runPipelineLoop({
    plan: async () => {
      planCalls++;
      return [makeIssue(`beads-${700 + planCalls}`)];
    },
    execute: async (issues) => issues,
    merge: async () => { mergeCalls++; },
    acquireLock: () => true,
    releaseLock: () => {},
  });

  assert(trace.iterations === MAX_ITERATIONS,
    `Loop must stop at MAX_ITERATIONS (${MAX_ITERATIONS}), got ${trace.iterations}`);
  assert(mergeCalls === MAX_ITERATIONS,
    `Merge must run exactly ${MAX_ITERATIONS} times, got ${mergeCalls}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`pipeline-happy-path tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
