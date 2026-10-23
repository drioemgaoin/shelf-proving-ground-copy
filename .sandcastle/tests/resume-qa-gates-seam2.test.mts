// TGF-39 seam 2: resumeQAGates — integration-mocked.
//
// Verifies that --resume intelligently skips already-completed QA phases
// by inspecting findings files in the worktree's .qa/ directory.
//
// Coverage:
//   Phase A (test author):     A1–A6  — skip/re-run based on prior findings
//   Phase B (quality checkers): B1–B8  — skip/re-run based on prior findings
//   Compound (both phases):    C1–C6  — end-to-end phase interaction
//   Pipeline-level:            P1–P3  — integration with surrounding stages
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/resume-qa-gates-seam2.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, mock } from "node:test";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing phases
// ---------------------------------------------------------------------------

// Control gate loop outcomes per test
let unifiedGateLoopResult = false;  // false = pass, true = escalated
let gateLoopResult = false;         // test-author gate
let runGateLoopCallCount = 0;       // track test-author (Phase A) invocations
let runUnifiedGateLoopCallCount = 0; // track quality checkers (Phase B) invocations
let escalateCallArgs: string[] = [];  // track escalation reasons

await mock.module("child_process", {
  namedExports: {
    execSync: (_cmd: string, _opts?: any) => "",
    exec: () => {},
    execFile: () => {},
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } }),
  },
});

// Per-test overrides for fs behavior
let readFileSyncHandler: (path: string, enc?: string) => string = () => "";
let existsSyncHandler: (path: string) => boolean = () => true;

await mock.module("fs", {
  namedExports: {
    existsSync: (p: string) => existsSyncHandler(p),
    readdirSync: () => [],
    readFileSync: (p: string, enc?: string) => readFileSyncHandler(p, enc),
    writeFileSync: () => {},
    mkdirSync: () => {},
    rmSync: () => {},
    appendFileSync: () => {},
    copyFileSync: () => {},
    unlinkSync: () => {},
    statSync: () => ({ isFile: () => true }),
    cpSync: () => {},
    renameSync: () => {},
    openSync: () => 3,
    fstatSync: () => ({ size: 0 }),
    readSync: () => 0,
    closeSync: () => {},
  },
});

// --- sandcastle library ---
const closeFn = mock.fn(async () => {});
const mockSandbox = { close: closeFn };

await mock.module("@ai-hero/sandcastle", {
  namedExports: {
    createSandbox: async () => mockSandbox,
    Output: { object: () => ({}) },
  },
});

await mock.module("@ai-hero/sandcastle/sandboxes/docker", {
  namedExports: {
    docker: () => ({}),
  },
});

// --- internal libs ---
await mock.module("../lib/logging.mjs", {
  namedExports: { log: () => {} },
});

await mock.module("../lib/prompt.mjs", {
  namedExports: { expandAndSave: () => {} },
});

await mock.module("../lib/sandbox.mjs", {
  namedExports: {
    getGuardBase: () => "",
    buildWarmImage: () => "test-image",
    createBuilderHooks: () => ({ sandbox: { onSandboxReady: [] } }),
    buildOverlayFileList: () => [],
  },
});

await mock.module("../lib/tagged-agent.mjs", {
  namedExports: {
    timedRun: async () => ({ output: { issues: [] }, commits: [], iterations: [] }),
    timedSandboxRun: async () => ({ commits: [], iterations: [] }),
    CostCeilingExceededError: class CostCeilingExceededError extends Error {},
    claude: () => ({ model: "test" }),
    printCostSummary: () => {},
  },
});

await mock.module("../lib/qa-gates.mjs", {
  namedExports: {
    runGateLoop: async () => { runGateLoopCallCount++; return gateLoopResult; },
    runUnifiedGateLoop: async () => { runUnifiedGateLoopCallCount++; return unifiedGateLoopResult; },
    isClean: (path: string, passWord: string) => {
      try {
        if (!existsSyncHandler(path)) return true;
        return readFileSyncHandler(path).trim().startsWith(passWord);
      } catch { return true; }
    },
    escalate: (_issueId: string, reason: string) => { escalateCallArgs.push(reason); },
    archiveTestResults: () => {},
    setPhase: () => {},
    findingsOverlap: () => false,
  },
});

await mock.module("../lib/gates.mts", {
  namedExports: {
    createVisualGate: () => ({
      name: "Visual QA",
      passWord: "PASS",
      findingsFile: (round: number) => `.qa/visual-r${round}.md`,
    }),
    createReviewGate: () => ({
      name: "Code review",
      passWord: "CLEAN",
      findingsFile: (round: number) => `.qa/review-r${round}.md`,
    }),
  },
});

await mock.module("../lib/gates-test-author.mjs", {
  namedExports: {
    createTestAuthorGate: () => ({
      name: "Test author",
      passWord: "PASS",
      findingsFile: (round: number) => `.qa/test-author-r${round}.md`,
    }),
  },
});

await mock.module("../lib/monitor-collect.mjs", {
  namedExports: {
    collectMonitorData: () => {},
    collectAllWorktrees: () => {},
  },
});

await mock.module("../lib/violations-memory.mjs", {
  namedExports: {
    loadViolationsMemory: () => "",
    recordViolation: () => {},
  },
});

await mock.module("../../scripts/build-constraints.mjs", {
  namedExports: {
    buildConstraints: () => ({ constraints: "" }),
  },
});

await mock.module("../config/agents.mjs", {
  namedExports: {
    PLANNER: { model: "test" },
    IMPLEMENTER: { model: "test" },
    UNIFIED_FIXER: { model: "test" },
  },
});

await mock.module("../config/tracker.mjs", {
  namedExports: {
    VIEW_TASK_COMMAND: "echo view",
    COMMENT_TASK_COMMAND: "echo comment <ID>",
    LABEL_TASK_COMMAND: "echo label <ID>",
    CREATE_BUG_COMMAND: "echo bug",
    CLOSE_TASK_COMMAND: "echo close <ID>",
    LIST_READY_COMMAND: "echo ready",
    SEARCH_BUGS_COMMAND: "echo search",
    CLOSE_BUG_COMMAND: "echo close-bug",
    TICKET_OVERRIDES: {},
    DISTILL: "full",
  },
});

await mock.module("../lib/tickets.mjs", {
  namedExports: {
    readTicketFiles: () => [],
    ticketsToReadyJson: () => "[]",
  },
});

await mock.module("../lib/distill.mjs", {
  namedExports: {
    distillIssueDetails: (s: string) => s,
  },
});

// Now import the function under test
const { resumeQAGates } = await import("../lib/phases.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(id: string, branch: string, touchesUI = true) {
  return { id, title: `Test ${id}`, branch, touchesUI, scope: "src/**" };
}

function makeOpts(overrides: Record<string, any> = {}) {
  return {
    warmImage: "test-image",
    hooks: { sandbox: { onSandboxReady: [] } },
    copyToWorktree: [],
    verbose: false,
    issueDetails: new Map([
      ["abc-001", "Fix card border"],
      ["abc-002", "Add drawer animation"],
      ["abc-003", "Update grid layout"],
    ]),
    trackerCommands: {
      COMMENT_TASK_COMMAND: "echo comment <ID>",
      LABEL_TASK_COMMAND: "echo label <ID>",
      CREATE_BUG_COMMAND: "echo bug",
    },
    ...overrides,
  };
}

/**
 * Simulate the .qa/ directory state in the worktree.
 * Keys are file suffixes after .qa/ (e.g. "test-author-r1.md").
 * Values are the file contents.
 * Files NOT in the map → existsSync returns false for .qa/ paths.
 */
function setQAFiles(files: Record<string, string>) {
  const qaMap = new Map(Object.entries(files));
  existsSyncHandler = (p: string) => {
    const qaMatch = p.match(/\.qa\/(.+)$/);
    if (qaMatch) return qaMap.has(qaMatch[1]);
    return true; // non-.qa/ paths always exist
  };
  readFileSyncHandler = (p: string) => {
    const qaMatch = p.match(/\.qa\/(.+)$/);
    if (qaMatch) return qaMap.get(qaMatch[1]) ?? "";
    return "";
  };
}

function resetState() {
  unifiedGateLoopResult = false;
  gateLoopResult = false;
  runGateLoopCallCount = 0;
  runUnifiedGateLoopCallCount = 0;
  escalateCallArgs = [];
  readFileSyncHandler = () => "";
  existsSyncHandler = () => true;
  closeFn.mock.resetCalls();
}

// ---------------------------------------------------------------------------
// Existing tests (a–f) — baseline behavior
// ---------------------------------------------------------------------------

describe("TGF-39 seam 2: resumeQAGates — baseline", () => {
  beforeEach(resetState);

  test("(a) one issue passes QA → returned in result", async () => {
    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "abc-001");
    assert.equal(closeFn.mock.callCount(), 1);
  });

  test("(b) all issues escalated → empty result", async () => {
    unifiedGateLoopResult = true;
    const issues = [
      makeIssue("abc-001", "feat/abc-001"),
      makeIssue("abc-002", "feat/abc-002"),
    ];
    const result = await resumeQAGates(issues, makeOpts());
    assert.equal(result.length, 0);
  });

  test("(c) mixed escalation — only passing issues returned", async () => {
    unifiedGateLoopResult = false;
    const issues = [
      makeIssue("abc-001", "feat/abc-001"),
      makeIssue("abc-002", "feat/abc-002"),
    ];
    const result = await resumeQAGates(issues, makeOpts());
    assert.equal(result.length, 2);
  });

  test("(d) sandbox closed even when QA escalates", async () => {
    unifiedGateLoopResult = true;
    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());
    assert.equal(closeFn.mock.callCount(), 1);
  });

  test("(e) empty issues list → empty result", async () => {
    const result = await resumeQAGates([], makeOpts());
    assert.equal(result.length, 0);
    assert.equal(closeFn.mock.callCount(), 0);
  });

  test("(f) test-author gate escalation → issue excluded", async () => {
    gateLoopResult = true;
    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());
    assert.equal(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase A — Test author resume skip
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase A: test author resume skip", () => {
  beforeEach(resetState);

  test("A1: no findings files → run test author", async () => {
    setQAFiles({}); // empty .qa/

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 1, "Test author must run when no prior findings");
  });

  test("A2: R1 = PASS → skip test author", async () => {
    setQAFiles({ "test-author-r1.md": "PASS\nGate: 0 failures\n" });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Test author must be skipped when R1 shows PASS");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must still run");
  });

  test("A3: R1 = findings, R2 = PASS → skip test author (multi-round pass)", async () => {
    setQAFiles({
      "test-author-r1.md": "- src/App.tsx:5 — missing test for onClick handler",
      "test-author-r2.md": "PASS\nGate: 0 failures\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0,
      "Test author must be skipped when latest round (R2) shows PASS");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must still run");
  });

  test("A4: R1 = findings, no R2 (crashed mid-fix) → re-run", async () => {
    setQAFiles({
      "test-author-r1.md": "- src/App.tsx:5 — missing test for onClick handler",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 1,
      "Test author must re-run when latest round has findings (crash mid-fix)");
  });

  test("A5: R1 = DEFER → skip test author and escalate", async () => {
    setQAFiles({ "test-author-r1.md": "DEFER\nAll findings deferred\n" });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0,
      "Test author must be skipped when findings show DEFER");
    assert.equal(runUnifiedGateLoopCallCount, 0,
      "Phase B must NOT run after DEFER escalation");
    // The issue should be escalated (excluded from results)
    assert.equal(result.length, 0, "Deferred issue must be excluded from results");
  });

  test("A6: R1 = findings, R2 = findings (fixer still working) → re-run", async () => {
    setQAFiles({
      "test-author-r1.md": "- src/App.tsx:5 — missing test",
      "test-author-r2.md": "- src/Grid.tsx:10 — missing assertion",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 1,
      "Test author must re-run when latest round still has findings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase B — Quality checkers resume skip
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase B: quality checkers resume skip", () => {
  beforeEach(resetState);

  // All Phase B tests: test-author already passed (skip Phase A)
  function setTestAuthorPassed(extraFiles: Record<string, string> = {}) {
    setQAFiles({ "test-author-r1.md": "PASS\nGate: 0 failures\n", ...extraFiles });
  }

  test("B1: no checker findings files → run Phase B", async () => {
    setTestAuthorPassed(); // only test-author passed, no checker files

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 1,
      "Phase B must run when no prior checker findings");
  });

  test("B2: R1 visual=PASS, review=CLEAN → skip Phase B", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "PASS\n0 findings\n",
      "review-r1.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 0,
      "Phase B must be skipped when all R1 checkers are clean");
    assert.equal(result.length, 1, "Issue must pass (both phases clean)");
  });

  test("B3: R1 has findings, R2 visual=PASS, review=CLEAN → skip Phase B", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "- src/App.tsx:5 — wrong color",
      "review-r1.md": "- src/App.tsx:10 — missing error boundary",
      "unified-r1.md": "merged findings...",
      "visual-r2.md": "PASS\n0 findings\n",
      "review-r2.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 0,
      "Phase B must be skipped when latest round (R2) shows all clean");
    assert.equal(result.length, 1, "Issue must pass");
  });

  test("B4: R1 has findings, no R2 (crashed during fixer) → re-run Phase B", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "- src/App.tsx:5 — wrong color",
      "review-r1.md": "- src/App.tsx:10 — missing error boundary",
      "unified-r1.md": "merged findings...",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 1,
      "Phase B must re-run when R1 has findings and no R2 exists");
  });

  test("B5: R1 has findings, R2 still has findings → re-run Phase B", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "- src/App.tsx:5 — wrong color",
      "review-r1.md": "CLEAN\nNo issues found\n",
      "visual-r2.md": "- src/App.tsx:5 — still wrong color",
      "review-r2.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 1,
      "Phase B must re-run when latest round still has findings");
  });

  test("B6: only visual-r1 exists, no review-r1 (crashed mid-parallel-check) → re-run", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "PASS\n0 findings\n",
      // review-r1.md missing — crash during parallel checkers
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 1,
      "Phase B must re-run when not all checker files exist (partial crash)");
  });

  test("B7: R1 one checker PASS, other has findings → re-run Phase B", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "PASS\n0 findings\n",
      "review-r1.md": "- src/App.tsx:10 — missing error boundary",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 1,
      "Phase B must re-run when one checker has findings");
  });

  test("B8: R1 visual=DEFER → skip Phase B and escalate", async () => {
    setTestAuthorPassed({
      "visual-r1.md": "DEFER\nAnimation timing not testable\n",
      "review-r1.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runUnifiedGateLoopCallCount, 0,
      "Phase B must be skipped when a checker deferred");
    assert.equal(result.length, 0, "Deferred issue must be excluded from results");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Compound — both phases
// ═══════════════════════════════════════════════════════════════════════════

describe("Compound: both phases", () => {
  beforeEach(resetState);

  test("C1: Phase A passed + Phase B all clean → skip everything", async () => {
    setQAFiles({
      "test-author-r1.md": "PASS\nGate: 0 failures\n",
      "visual-r1.md": "PASS\n0 findings\n",
      "review-r1.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Phase A must be skipped");
    assert.equal(runUnifiedGateLoopCallCount, 0, "Phase B must be skipped");
    assert.equal(result.length, 1, "Issue must pass (both phases clean)");
  });

  test("C2: Phase A passed + Phase B not started → skip A, run B", async () => {
    setQAFiles({
      "test-author-r1.md": "PASS\nGate: 0 failures\n",
      // no checker files
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Phase A must be skipped");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must run");
  });

  test("C3: Phase A passed + Phase B has findings → skip A, run B", async () => {
    setQAFiles({
      "test-author-r1.md": "PASS\nGate: 0 failures\n",
      "visual-r1.md": "- src/App.tsx:5 — wrong color",
      "review-r1.md": "- src/App.tsx:10 — missing error boundary",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Phase A must be skipped");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must run (has findings)");
  });

  test("C4: neither phase ran → run both", async () => {
    setQAFiles({}); // empty .qa/

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 1, "Phase A must run");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must run");
  });

  test("C5: Phase A DEFER → skip A (escalate), skip B", async () => {
    setQAFiles({
      "test-author-r1.md": "DEFER\nAll findings deferred\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Phase A must be skipped");
    assert.equal(runUnifiedGateLoopCallCount, 0, "Phase B must not run after A defer");
    assert.equal(result.length, 0, "Issue must be excluded");
  });

  test("C6: Phase A passed on R2 + Phase B not started → skip A, run B", async () => {
    setQAFiles({
      "test-author-r1.md": "- src/App.tsx:5 — missing test",
      "test-author-r2.md": "PASS\nGate: 0 failures\n",
      // no checker files
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0,
      "Phase A must be skipped (passed on R2)");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline-level — integration with surrounding stages
// ═══════════════════════════════════════════════════════════════════════════

describe("Pipeline-level: integration", () => {
  beforeEach(resetState);

  test("P1: implementer produced commits, crash before any QA → run all", async () => {
    // This is equivalent to C4 — no .qa/ files at all
    setQAFiles({});

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 1, "Phase A must run from scratch");
    assert.equal(runUnifiedGateLoopCallCount, 1, "Phase B must run from scratch");
  });

  test("P2: all QA passed → issue returned for merge", async () => {
    // If all QA passed, the issue should be returned in the result
    // for Phase 3 (merge) to process.
    setQAFiles({
      "test-author-r1.md": "PASS\nGate: 0 failures\n",
      "visual-r1.md": "PASS\n0 findings\n",
      "review-r1.md": "CLEAN\nNo issues found\n",
    });

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 1, "Issue must be returned for merge");
    assert.equal(result[0].id, "abc-001");
    assert.equal(result[0].branch, "feat/abc-001");
    // No agents were called — pure skip
    assert.equal(runGateLoopCallCount, 0);
    assert.equal(runUnifiedGateLoopCallCount, 0);
  });

  test("P3: non-UI issue skips visual-qa, review=CLEAN → skip Phase B", async () => {
    // touchesUI=false means no visual-qa gate is created.
    // Only code-review runs. If it already passed, skip Phase B.
    setQAFiles({
      "test-author-r1.md": "PASS\nGate: 0 failures\n",
      "review-r1.md": "CLEAN\nNo issues found\n",
      // No visual-r1.md because touchesUI=false → no visual gate
    });

    const issues = [makeIssue("abc-001", "feat/abc-001", /* touchesUI */ false)];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(runGateLoopCallCount, 0, "Phase A skipped");
    assert.equal(runUnifiedGateLoopCallCount, 0,
      "Phase B skipped — only checker (review) already clean");
    assert.equal(result.length, 1, "Issue must pass");
  });
});
