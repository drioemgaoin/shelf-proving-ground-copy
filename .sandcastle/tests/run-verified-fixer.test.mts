// Integration tests for runVerifiedFixer — shrinking backlog, stuck detection,
// exhaustion, regression catching, and batching.
//
// Mocks: timedSandboxRun (counts calls), expandAndSave (no-op),
//        execSync (captures escalation + controls verification output
//        via callback).
// Real: file I/O in a temp directory, findings parsing/matching.
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/run-verified-fixer.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach, mock } from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing qa-gates
// ---------------------------------------------------------------------------

const VERIFY_CMD = "npm run verify";

// Per-test callback controlling verification output.
// Return null → clean (execSync succeeds). Return string → failures (thrown as stdout).
type VerifyCallback = (callIndex: number) => string | null;
let onVerify: VerifyCallback = () => null;

// Capture all execSync calls for assertion
const execSyncCalls: string[] = [];

// Count fixer agent runs
let fixerRunCount = 0;

await mock.module("child_process", {
  namedExports: {
    execSync: (cmd: string, _opts?: any) => {
      execSyncCalls.push(cmd);
      if (cmd === VERIFY_CMD) {
        const result = onVerify(execSyncCalls.filter(c => c === VERIFY_CMD).length);
        if (result !== null) {
          const err: any = new Error("verify failed");
          err.stdout = result;
          err.stderr = "";
          throw err;
        }
        return "";
      }
      return "";
    },
  },
});

await mock.module("../lib/tagged-agent.mjs", {
  namedExports: {
    timedSandboxRun: async () => {
      fixerRunCount++;
    },
  },
});

await mock.module("../lib/prompt.mjs", {
  namedExports: {
    expandAndSave: () => {},
  },
});

// Now import the function under test
const { runVerifiedFixer } = await import("../lib/qa-gates.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let WORK: string;

function makeCtx(worktree: string) {
  return {
    issueId: "test-fixer-001",
    branch: "test-branch",
    worktree,
    sandbox: {} as any,
    state: {} as Record<string, any>,
  };
}

function makeFixer() {
  return {
    agent: { model: "test" } as any,
    maxIterations: 1,
    verifyCommand: VERIFY_CMD,
    promptFile: "fixer.md",
    buildArgs: () => ({}),
  };
}

/** Build a findings string with N entries on distinct files. */
function buildFindings(count: number): string {
  const lines = ["FINDINGS"];
  for (let i = 1; i <= count; i++) {
    lines.push(`- src/file${i}.tsx:${i} \`symbol${i}\``);
    lines.push(`  Cause: [rule-${i}] issue ${i}`);
    lines.push(`  Current: old code ${i}`);
    lines.push(`  Fix: new code ${i}`);
  }
  return lines.join("\n");
}

/** Build TypeScript-style error output for given file indices. */
function buildTsErrors(indices: number[]): string {
  return indices
    .map(i => `src/file${i}.tsx(${i},1): error TS2322: still broken ${i}`)
    .join("\n");
}

function escalationCmds(): string[] {
  return execSyncCalls.filter(c => c.startsWith("bd "));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), "tgf35-"));
  mkdirSync(join(WORK, ".qa"), { recursive: true });
  mkdirSync(join(WORK, ".sandcastle/logs/test-fixer-001"), { recursive: true });
  execSyncCalls.length = 0;
  fixerRunCount = 0;
  onVerify = () => null;
});

afterEach(() => {
  rmSync(WORK, { recursive: true, force: true });
});

// ═════════════════════════════════════════════════════════════════════

describe("runVerifiedFixer", () => {

  // 1. All fixed on pass 1 — verification clean → return, no escalation
  test("all fixed on pass 1 → returns immediately, no escalation", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(3);

    // Verification succeeds (all fixed)
    onVerify = () => null;

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.equal(escalationCmds().length, 0, "No escalation when all fixed");
  });

  // 2. Shrinking backlog — 5 findings, pass 1 fixes 3, pass 2 fixes 2
  test("shrinking backlog: 5 → 2 → 0 across two passes", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(5);

    // Pass 1: files 4,5 still failing. Pass 2: all clean.
    onVerify = (callIndex) => {
      if (callIndex === 1) return buildTsErrors([4, 5]);
      return null; // pass 2: clean
    };

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.equal(escalationCmds().length, 0, "No escalation when backlog shrinks to zero");
    const verifyCalls = execSyncCalls.filter(c => c === VERIFY_CMD);
    assert.equal(verifyCalls.length, 2, "Verify should run twice (pass 1 + pass 2)");
  });

  // 3. Stuck detection — same count after pass → escalate
  test("stuck: same count after pass → escalates", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(5);

    // Verification always returns all 5 failures
    onVerify = () => buildTsErrors([1, 2, 3, 4, 5]);

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("stuck")),
      `Should escalate with 'stuck'. Got: ${execSyncCalls.join(" | ")}`,
    );
  });

  // 4. Exhaustion — shrinks each pass but never zero → escalate after MAX_FIXER_PASSES
  test("exhaustion: shrinks each pass but never zero → escalates", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(10);

    // Each pass fixes 1: 10 → 9 → 8 → 7 → 6 (5 passes, still 5 left)
    onVerify = (callIndex) => {
      const remaining = [];
      for (let i = callIndex + 1; i <= 10; i++) remaining.push(i);
      return buildTsErrors(remaining);
    };

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("exhausted")),
      `Should escalate with 'exhausted'. Got: ${execSyncCalls.join(" | ")}`,
    );
    const verifyCalls = execSyncCalls.filter(c => c === VERIFY_CMD);
    assert.equal(verifyCalls.length, 5, "Should run 5 verification passes");
  });

  // 5. Regression — fixer fixes original but breaks new file → stuck (count didn't shrink)
  test("regression: 1 finding fixed but 1 regression → stuck escalation", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(1); // Only src/file1.tsx

    // Pass 1: file1 fixed, but brand new file broke (1 → 1: no progress)
    onVerify = () => "src/Oops.tsx(7,1): error TS2322: regression introduced";

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.ok(
      execSyncCalls.some(c => c.toLowerCase().includes("stuck")),
      `Should escalate stuck (1 → 1 is no progress). Got: ${execSyncCalls.join(" | ")}`,
    );
  });

  // 5b. Regression that shrinks overall — 3 findings, fixes 2 but regresses 1 new → 2 remain (progress)
  test("regression with net progress: 3 → 2 (1 original + 1 regression) → 0", async () => {
    const ctx = makeCtx(WORK);
    const findings = buildFindings(3); // file1, file2, file3

    // Pass 1: file1+file2 fixed, file3 still fails, plus new regression on Oops.tsx → 2 remain (< 3)
    // Pass 2: all clean
    onVerify = (callIndex) => {
      if (callIndex === 1) {
        return [
          "src/file3.tsx(3,1): error TS2322: still broken 3",
          "src/Oops.tsx(7,1): error TS2322: regression introduced",
        ].join("\n");
      }
      return null;
    };

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    assert.equal(escalationCmds().length, 0, "No escalation when net progress is made");
    const verifyCalls = execSyncCalls.filter(c => c === VERIFY_CMD);
    assert.equal(verifyCalls.length, 2, "Verify should run twice");
  });

  // 6. Batching — findings > BATCH_SIZE → multiple agent runs per pass
  test("batching: findings > BATCH_SIZE → multiple fixer agent runs", async () => {
    const ctx = makeCtx(WORK);
    // BATCH_SIZE is 30, so 50 findings → 2 batches
    const findings = buildFindings(50);

    // All fixed after pass 1
    onVerify = () => null;

    await runVerifiedFixer(makeFixer(), findings, 1, ctx, false);

    // 50 findings / 30 batch size = 2 batches
    assert.equal(fixerRunCount, 2, "Should run fixer twice (2 batches of 30+20)");
    assert.equal(escalationCmds().length, 0, "No escalation when all fixed");
  });
});
