// TGF-38: Reviewer scope narrowing — round 2+ uses Fixer's changes only.
//
// Seam: createReviewGate().buildCheckerArgs(round, ctx)
// Mocks: child_process.execSync (controls git diff / git log output)
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/review-scope-narrowing.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, mock } from "node:test";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing gates
// ---------------------------------------------------------------------------

// Track execSync calls and control return values per command pattern
type ExecSyncHandler = (cmd: string) => string;
let execSyncHandler: ExecSyncHandler = () => "";

await mock.module("child_process", {
  namedExports: {
    execSync: (cmd: string, _opts?: any) => execSyncHandler(cmd),
    exec: () => {},
    execFile: () => {},
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } }),
  },
});

// buildConstraints is imported at module level by gates.mts but not used
// by buildCheckerArgs — stub it so the import doesn't fail.
await mock.module("../lib/qa-gates.mjs", {
  namedExports: {
    archiveTestResults: () => {},
    setPhase: () => {},
    findingsOverlap: () => false,
  },
});

await mock.module("../lib/violations-memory.mjs", {
  namedExports: {
    recordViolation: () => {},
  },
});

// buildConstraints is imported at module level by gates.mts — stub it
// so import doesn't fail (not used by buildCheckerArgs).
// Resolve from gates.mts perspective: ../../scripts/build-constraints.mjs
await mock.module("../../scripts/build-constraints.mjs", {
  namedExports: {
    buildConstraints: () => ({ constraints: "" }),
  },
});

// Now import the function under test
const { createReviewGate } = await import("../lib/gates.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    issueId: "test-001",
    branch: "feat/card-fix",
    worktree: "/tmp/test-worktree",
    sandbox: {} as any,
    state: {} as Record<string, any>,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TGF-38: review gate buildCheckerArgs scope narrowing", () => {
  beforeEach(() => {
    execSyncHandler = () => "";
  });

  // ═══════════════════════════════════════════════════════════════════
  // (a) Round 1 → full branch diff (main...branch)
  // ═══════════════════════════════════════════════════════════════════

  test("(a) round 1 uses full diff from main", () => {
    const gate = createReviewGate("test-001", "feat/card-fix", "Fix card border");
    const ctx = makeCtx();

    const diffCalls: string[] = [];
    execSyncHandler = (cmd: string) => {
      diffCalls.push(cmd);
      if (cmd.includes("git diff")) return "diff --git a/src/Card.css\n+border-color: token";
      if (cmd.includes("git log")) return "abc1234 fix card border";
      return "";
    };

    const args = gate.buildCheckerArgs(1, ctx as any);

    // Base should be "main" (default, since reviewBase not set)
    const diffCmd = diffCalls.find((c) => c.includes("git diff"));
    assert.ok(diffCmd, "Should call git diff");
    assert.match(diffCmd!, /main\.\.\.feat\/card-fix/, "Round 1 diff should use main...branch");

    assert.equal(args.BRANCH_DIFF, "diff --git a/src/Card.css\n+border-color: token");
    assert.equal(args.BRANCH_LOG, "abc1234 fix card border");
    assert.equal(args.BASE_BRANCH, "main");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (b) Round 2 with reviewBase → narrowed diff
  // ═══════════════════════════════════════════════════════════════════

  test("(b) round 2 uses narrowed diff from reviewBase", () => {
    const gate = createReviewGate("test-001", "feat/card-fix", "Fix card border");
    const ctx = makeCtx();
    ctx.state.reviewBase = "abc1234deadbeef";

    const diffCalls: string[] = [];
    execSyncHandler = (cmd: string) => {
      diffCalls.push(cmd);
      if (cmd.includes("git diff")) return "diff --git a/src/Card.css\n+border-color: fixed";
      if (cmd.includes("git log")) return "def5678 fixer round 1";
      return "";
    };

    const args = gate.buildCheckerArgs(2, ctx as any);

    const diffCmd = diffCalls.find((c) => c.includes("git diff"));
    assert.ok(diffCmd, "Should call git diff");
    assert.match(
      diffCmd!,
      /abc1234deadbeef\.\.\.feat\/card-fix/,
      "Round 2 diff should use reviewBase...branch",
    );

    assert.equal(args.BASE_BRANCH, "abc1234deadbeef");
    assert.ok(args.BRANCH_DIFF.length > 0, "Narrowed diff should have content");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (c) Round 2 with empty narrowed diff → falls back to full diff
  // ═══════════════════════════════════════════════════════════════════

  test("(c) round 2 with empty narrowed diff falls back to full branch diff", () => {
    const gate = createReviewGate("test-001", "feat/card-fix", "Fix card border");
    const ctx = makeCtx();
    ctx.state.reviewBase = "abc1234deadbeef";

    let callCount = 0;
    execSyncHandler = (cmd: string) => {
      if (cmd.includes("git diff")) {
        callCount++;
        if (callCount === 1) {
          // First attempt: narrowed diff is empty (all findings settled)
          return "";
        }
        // Second attempt: full branch diff fallback
        return "diff --git a/src/Card.css\n+border-color: var(--token)";
      }
      if (cmd.includes("git log")) return "def5678 fixer round 1";
      return "";
    };

    const args = gate.buildCheckerArgs(2, ctx as any);

    assert.ok(
      args.BRANCH_DIFF.length > 0,
      "Should fall back to full branch diff when narrowed diff is empty",
    );
    assert.equal(callCount, 2, "Should attempt narrowed diff first, then full diff");
  });
});
