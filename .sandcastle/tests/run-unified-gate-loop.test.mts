// Integration tests for runUnifiedGateLoop — parallel checkers + merge +
// conflict escalation.
//
// Mocks: timedSandboxRun (simulates agent output by writing findings files),
//        expandAndSave (no-op).
// Captures: escalate calls via intercepted execSync.
// Real: file I/O in a temp directory.
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/run-unified-gate-loop.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach, mock } from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing qa-gates
// ---------------------------------------------------------------------------

// Capture escalate calls via intercepted execSync
const execSyncCalls: string[] = [];

await mock.module("child_process", {
  namedExports: {
    execSync: (cmd: string) => {
      execSyncCalls.push(cmd);
      return "";
    },
  },
});

// Mock timedSandboxRun — tests control findings via beforeCheck hooks.
// The mock optionally calls a per-test callback so tests can write findings
// AFTER the checker "runs" (simulating what the real agent would do).
type SandboxRunCallback = (label: string, opts: any) => void;
let onSandboxRun: SandboxRunCallback | null = null;

await mock.module("../lib/tagged-agent.mjs", {
  namedExports: {
    timedSandboxRun: async (label: string, _agent: any, _sandbox: any, opts: any) => {
      onSandboxRun?.(label, opts);
    },
  },
});

await mock.module("../lib/prompt.mjs", {
  namedExports: {
    expandAndSave: () => {},
  },
});

// Now import the function under test
const { runUnifiedGateLoop } = await import("../lib/qa-gates.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let WORK: string;

function makeCtx(worktree: string) {
  return {
    issueId: "test-001",
    branch: "test-branch",
    worktree,
    sandbox: {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    } as any,
    state: {} as Record<string, any>,
  };
}

/** Gate whose beforeCheck writes a PASS/CLEAN file (simulating a clean checker). */
function makeCleanGate(name: string, passWord: string = "PASS") {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    name,
    checker: { model: "test" } as any,
    fixer: { model: "test" } as any,
    checkerMaxIterations: 1,
    fixerMaxIterations: 1,
    passWord,
    findingsFile: (round: number) => `.qa/${slug}-r${round}.md`,
    checkerPromptFile: "prompt.md",
    fixerPromptFile: "fixer-prompt.md",
    buildCheckerArgs: () => ({}),
    buildFixerArgs: () => ({}),
    beforeCheck: (_round: number, ctx: any) => {
      // Doesn't write — the onSandboxRun callback writes PASS after "checker" runs
    },
  };
}

/** Gate whose onSandboxRun writes findings (simulating a failing checker). */
function makeFailGate(name: string, passWord: string, findingsContent: string) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    name,
    checker: { model: "test" } as any,
    fixer: { model: "test" } as any,
    checkerMaxIterations: 1,
    fixerMaxIterations: 1,
    passWord,
    findingsFile: (round: number) => `.qa/${slug}-r${round}.md`,
    checkerPromptFile: "prompt.md",
    fixerPromptFile: "fixer-prompt.md",
    buildCheckerArgs: () => ({}),
    buildFixerArgs: () => ({}),
    afterFix: () => {},
  };
}

function makeFixer() {
  return {
    agent: { model: "test" } as any,
    maxIterations: 1,
    verifyCommand: "true", // always succeeds
    promptFile: "fixer.md",
    buildArgs: () => ({}),
  };
}

/** Write findings for a gate at a given round in the worktree. */
function writeFindings(worktree: string, gateName: string, round: number, content: string) {
  const slug = gateName.toLowerCase().replace(/\s+/g, "-");
  const dir = join(worktree, ".qa");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}-r${round}.md`), content);
}

/** Return only escalation-related execSync calls (bd label / bd update). */
function escalationCmds(): string[] {
  return execSyncCalls.filter(c => c.startsWith("bd "));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), "tgf34-"));
  mkdirSync(join(WORK, ".qa"), { recursive: true });
  mkdirSync(join(WORK, ".sandcastle/logs/test-001"), { recursive: true });
  execSyncCalls.length = 0;
  onSandboxRun = null;
});

afterEach(() => {
  rmSync(WORK, { recursive: true, force: true });
});

// ═════════════════════════════════════════════════════════════════════
// (a) Both checkers PASS round 1 → returns false, no fixer called
// ═════════════════════════════════════════════════════════════════════

describe("runUnifiedGateLoop", () => {
  test("(a) both checkers PASS round 1 → returns false, no fixer", async () => {
    const ctx = makeCtx(WORK);

    // When checkers run, write PASS findings
    onSandboxRun = (label) => {
      if (label.includes("Visual QA")) {
        writeFindings(WORK, "Visual QA", 1, "PASS\nGate: 0 failures");
      } else if (label.includes("Code review")) {
        writeFindings(WORK, "Code review", 1, "CLEAN\nGate: 0 failures");
      }
    };

    const checkers = [
      makeCleanGate("Visual QA", "PASS"),
      makeCleanGate("Code review", "CLEAN"),
    ];
    const fixer = makeFixer();

    const escalated = await runUnifiedGateLoop(checkers, fixer, ctx, false);

    assert.equal(escalated, false, "Should return false when both pass");
    assert.equal(escalationCmds().length, 0, "No escalation should occur");
  });

  // ═════════════════════════════════════════════════════════════════════
  // (b) One checker DEFER → escalate, returns true
  // ═════════════════════════════════════════════════════════════════════

  test("(b) one checker DEFER → escalate, returns true", async () => {
    const ctx = makeCtx(WORK);

    onSandboxRun = (label) => {
      if (label.includes("Visual QA")) {
        writeFindings(WORK, "Visual QA", 1, "DEFER\nInsufficient evidence for evaluation.");
      } else if (label.includes("Code review")) {
        writeFindings(WORK, "Code review", 1, "CLEAN\nGate: 0 failures");
      }
    };

    const checkers = [
      makeCleanGate("Visual QA", "PASS"),
      makeCleanGate("Code review", "CLEAN"),
    ];

    const escalated = await runUnifiedGateLoop(checkers, makeFixer(), ctx, false);

    assert.equal(escalated, true, "Should return true on DEFER");
    // escalate calls 2 execSync commands: label + comment
    assert.ok(execSyncCalls.length >= 1, "Should have escalation commands");
    const commentCmds = execSyncCalls.filter(c => c.includes("comment") || c.includes("Deferred"));
    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("deferred") || c.toLowerCase().includes("defer")),
      `Escalation should mention defer. Got: ${execSyncCalls.join(" | ")}`
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  // (c) 3×FAIL → escalate "exhausted", returns true
  // ═════════════════════════════════════════════════════════════════════

  test("(c) 3x FAIL → escalate exhausted, returns true", async () => {
    const ctx = makeCtx(WORK);

    const failContent = [
      "FINDINGS",
      "- src/Card.css:12 `.card`",
      "  Cause: [visual] wrong border color",
      "  Current: border-color: red",
      "  Fix: border-color: var(--color-border-default)",
    ].join("\n");

    let roundCounter = 0;
    onSandboxRun = (label) => {
      // Track which round we're in by counting checker calls
      if (label.includes("Visual QA")) {
        roundCounter++;
        writeFindings(WORK, "Visual QA", roundCounter, failContent);
      } else if (label.includes("Code review")) {
        writeFindings(WORK, "Code review", roundCounter, "CLEAN\nGate: 0 failures");
      } else if (label.includes("Fixer")) {
        // Fixer runs but doesn't fix anything — findings stay
      }
    };

    const visualGate = {
      ...makeCleanGate("Visual QA", "PASS"),
      afterFix: () => {},
    };
    const reviewGate = {
      ...makeCleanGate("Code review", "CLEAN"),
      afterFix: () => {},
    };

    const escalated = await runUnifiedGateLoop(
      [visualGate, reviewGate],
      makeFixer(),
      ctx,
      false,
    );

    assert.equal(escalated, true, "Should return true after exhaustion");
    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("exhausted")),
      `Should escalate with 'exhausted'. Got: ${execSyncCalls.join(" | ")}`,
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  // (d) Cross-checker oscillation at round 2 → escalate, returns true
  // ═════════════════════════════════════════════════════════════════════

  test("(d) cross-checker oscillation at round 2 → escalate", async () => {
    const ctx = makeCtx(WORK);

    // Same findings in round 1 and round 2 → oscillation
    const findings = [
      "FINDINGS",
      "- src/Card.css:12 — border color should use design token instead of hardcoded value",
    ].join("\n");

    let roundCounter = 0;
    onSandboxRun = (label) => {
      if (label.includes("Visual QA")) {
        roundCounter++;
        writeFindings(WORK, "Visual QA", roundCounter, findings);
      } else if (label.includes("Code review")) {
        writeFindings(WORK, "Code review", roundCounter, "CLEAN\nGate: 0 failures");
      }
    };

    const visualGate = {
      ...makeCleanGate("Visual QA", "PASS"),
      afterFix: () => {},
    };
    const reviewGate = {
      ...makeCleanGate("Code review", "CLEAN"),
      afterFix: () => {},
    };

    const escalated = await runUnifiedGateLoop(
      [visualGate, reviewGate],
      makeFixer(),
      ctx,
      false,
    );

    assert.equal(escalated, true, "Should return true on oscillation");
    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("oscillation")),
      `Should escalate with 'oscillation'. Got: ${execSyncCalls.join(" | ")}`,
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  // (e) Checker conflict (same location, different fixes) → escalate
  // ═════════════════════════════════════════════════════════════════════

  test("(e) checker conflict → escalate, returns true", async () => {
    const ctx = makeCtx(WORK);

    onSandboxRun = (label) => {
      if (label.includes("Visual QA")) {
        writeFindings(WORK, "Visual QA", 1, [
          "FINDINGS",
          "- src/Card.css:12 `.card`",
          "  Cause: [visual] wrong border color",
          "  Current: border-color: red",
          "  Fix: border-color: var(--color-border-default)",
        ].join("\n"));
      } else if (label.includes("Code review")) {
        writeFindings(WORK, "Code review", 1, [
          "FINDINGS",
          "- src/Card.css:12 `.card`",
          "  Cause: [review] inconsistent token usage",
          "  Current: border-color: red",
          "  Fix: border-color: var(--color-border-subtle)",
        ].join("\n"));
      }
    };

    const visualGate = makeCleanGate("Visual QA", "PASS");
    const reviewGate = makeCleanGate("Code review", "CLEAN");

    const escalated = await runUnifiedGateLoop(
      [visualGate, reviewGate],
      makeFixer(),
      ctx,
      false,
    );

    assert.equal(escalated, true, "Should return true on conflict");
    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("conflict")),
      `Should escalate with 'conflict'. Got: ${execSyncCalls.join(" | ")}`,
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  // (f) FAIL round 1, PASS round 2 → fixer runs once, then clean
  // ═════════════════════════════════════════════════════════════════════

  test("(f) FAIL round 1, PASS round 2 → fixer runs, returns false", async () => {
    const ctx = makeCtx(WORK);

    let roundCounter = 0;
    let fixerRan = false;
    onSandboxRun = (label) => {
      if (label.includes("Visual QA") && !label.includes("Fixer")) {
        roundCounter++;
        if (roundCounter === 1) {
          writeFindings(WORK, "Visual QA", 1, [
            "FINDINGS",
            "- src/Card.css:12 `.card`",
            "  Cause: [visual] wrong border",
            "  Current: border-color: red",
            "  Fix: border-color: var(--color-border-default)",
          ].join("\n"));
        } else {
          writeFindings(WORK, "Visual QA", 2, "PASS\nGate: 0 failures");
        }
      } else if (label.includes("Code review") && !label.includes("Fixer")) {
        if (roundCounter === 1) {
          writeFindings(WORK, "Code review", 1, "CLEAN\nGate: 0 failures");
        } else {
          writeFindings(WORK, "Code review", 2, "CLEAN\nGate: 0 failures");
        }
      } else if (label.includes("Fixer")) {
        fixerRan = true;
      }
    };

    const visualGate = {
      ...makeCleanGate("Visual QA", "PASS"),
      afterFix: () => {},
    };
    const reviewGate = {
      ...makeCleanGate("Code review", "CLEAN"),
      afterFix: () => {},
    };

    const escalated = await runUnifiedGateLoop(
      [visualGate, reviewGate],
      makeFixer(),
      ctx,
      false,
    );

    assert.equal(escalated, false, "Should return false when round 2 passes");
    assert.equal(escalationCmds().length, 0, "No escalation");
    assert.ok(fixerRan, "Fixer should have run between rounds");

    // Verify merged findings file was written for round 1
    assert.ok(
      existsSync(join(WORK, ".qa/unified-r1.md")),
      "Merged findings file should be written for round 1",
    );
  });
});
