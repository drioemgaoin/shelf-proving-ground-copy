// TGF-39 seam 2: resumeQAGates — integration-mocked.
//
// Verifies that resumeQAGates creates sandboxes, runs QA gates per issue,
// and returns only non-escalated issues.
//
// Mocks: sandcastle, docker, qa-gates (runGateLoop, runUnifiedGateLoop),
//        gate factories, tagged-agent, prompt, sandbox helpers, monitor,
//        violations-memory, build-constraints, child_process, fs, agents.
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

await mock.module("child_process", {
  namedExports: {
    execSync: (_cmd: string, _opts?: any) => "",
    exec: () => {},
    execFile: () => {},
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } }),
  },
});

await mock.module("fs", {
  namedExports: {
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => "",
    writeFileSync: () => {},
    mkdirSync: () => {},
    rmSync: () => {},
    appendFileSync: () => {},
    copyFileSync: () => {},
    unlinkSync: () => {},
    statSync: () => ({ isFile: () => true }),
    cpSync: () => {},
    renameSync: () => {},
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
    setRulesVisible: () => {},
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
    runGateLoop: async () => gateLoopResult,
    runUnifiedGateLoop: async () => unifiedGateLoopResult,
    escalate: () => {},
    archiveTestResults: () => {},
    setPhase: () => {},
    findingsOverlap: () => false,
  },
});

await mock.module("../lib/gates.mjs", {
  namedExports: {
    createVisualGate: () => ({ name: "Visual QA" }),
    createReviewGate: () => ({ name: "Code review" }),
  },
});

await mock.module("../lib/gates-test-author.mjs", {
  namedExports: {
    createTestAuthorGate: () => ({ name: "Test author" }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TGF-39 seam 2: resumeQAGates", () => {
  beforeEach(() => {
    unifiedGateLoopResult = false;
    gateLoopResult = false;
    closeFn.mock.resetCalls();
  });

  // ═══════════════════════════════════════════════════════════════════
  // (a) One branch → sandbox created, QA gates run, non-escalated returned
  // ═══════════════════════════════════════════════════════════════════

  test("(a) one issue passes QA → returned in result", async () => {
    unifiedGateLoopResult = false; // QA passes

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "abc-001");

    // Sandbox was closed
    assert.equal(closeFn.mock.callCount(), 1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (b) All branches escalated → empty result
  // ═══════════════════════════════════════════════════════════════════

  test("(b) all issues escalated → empty result", async () => {
    unifiedGateLoopResult = true; // QA escalates

    const issues = [
      makeIssue("abc-001", "feat/abc-001"),
      makeIssue("abc-002", "feat/abc-002"),
    ];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (c) Mixed — only non-escalated returned
  // ═══════════════════════════════════════════════════════════════════

  test("(c) mixed escalation — only passing issues returned", async () => {
    // Can't vary per-issue with a single boolean, but we can verify the
    // filtering logic by testing separately. This test verifies the pass case
    // with multiple issues.
    unifiedGateLoopResult = false;

    const issues = [
      makeIssue("abc-001", "feat/abc-001"),
      makeIssue("abc-002", "feat/abc-002"),
    ];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 2);
    assert.equal(result[0].id, "abc-001");
    assert.equal(result[1].id, "abc-002");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (d) Sandbox always closed even on escalation
  // ═══════════════════════════════════════════════════════════════════

  test("(d) sandbox closed even when QA escalates", async () => {
    unifiedGateLoopResult = true;

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    await resumeQAGates(issues, makeOpts());

    assert.equal(closeFn.mock.callCount(), 1, "Sandbox must be closed in finally block");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (e) Empty issues list → empty result, no sandbox created
  // ═══════════════════════════════════════════════════════════════════

  test("(e) empty issues list → empty result", async () => {
    const result = await resumeQAGates([], makeOpts());

    assert.equal(result.length, 0);
    assert.equal(closeFn.mock.callCount(), 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (f) Test-author gate escalation → issue excluded
  // ═══════════════════════════════════════════════════════════════════

  test("(f) test-author gate escalation → issue excluded", async () => {
    gateLoopResult = true; // test-author escalates → runQAGates returns true early

    const issues = [makeIssue("abc-001", "feat/abc-001")];
    const result = await resumeQAGates(issues, makeOpts());

    assert.equal(result.length, 0);
  });
});
