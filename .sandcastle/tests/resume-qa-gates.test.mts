// TGF-39: resumeQAGates — resume mode re-runs gates without re-implementing.
//
// Seam 1: discoverResumableIssues() — unit, mocked fs + child_process
// Seam 2: resumeQAGates(issues, opts) — integration-mocked
//
// Run: node --import tsx/esm --test --experimental-test-module-mocks \
//        .sandcastle/tests/resume-qa-gates.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, mock } from "node:test";

// ---------------------------------------------------------------------------
// Module mocks — registered BEFORE importing discover-resumable
// ---------------------------------------------------------------------------

type ExecSyncFn = (cmd: string, opts?: any) => string;
let execSyncHandler: ExecSyncFn = () => "";

// Track fs calls
let existsSyncReturn = true;
let readdirSyncReturn: Array<{ name: string; isDirectory: () => boolean }> = [];

await mock.module("child_process", {
  namedExports: {
    execSync: (cmd: string, opts?: any) => execSyncHandler(cmd),
    exec: () => {},
    execFile: () => {},
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } }),
  },
});

await mock.module("fs", {
  namedExports: {
    existsSync: (p: string) => existsSyncReturn,
    readdirSync: (_p: string, _opts?: any) => readdirSyncReturn,
    readFileSync: () => "",
    writeFileSync: () => {},
    mkdirSync: () => {},
    rmSync: () => {},
    appendFileSync: () => {},
    copyFileSync: () => {},
    unlinkSync: () => {},
    statSync: () => ({ isFile: () => true, isDirectory: () => false }),
    cpSync: () => {},
  },
});

// Stub logging to prevent side-effect noise
await mock.module("../lib/logging.mjs", {
  namedExports: {
    log: () => {},
  },
});

const { discoverResumableIssues } = await import("../lib/discover-resumable.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function worktreeEntry(issueId: string) {
  return {
    name: `sandcastle-issue-${issueId}`,
    isDirectory: () => true,
  };
}

// ---------------------------------------------------------------------------
// Seam 1: discoverResumableIssues
// ---------------------------------------------------------------------------

describe("TGF-39 seam 1: discoverResumableIssues", () => {
  beforeEach(() => {
    existsSyncReturn = true;
    readdirSyncReturn = [];
    execSyncHandler = () => "";
  });

  // ═══════════════════════════════════════════════════════════════════
  // (a) One worktree with commits ahead → included
  // ═══════════════════════════════════════════════════════════════════

  test("(a) worktree with commits ahead of main is included", () => {
    readdirSyncReturn = [worktreeEntry("abc-123")];

    execSyncHandler = (cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return "feat/abc-123\n";
      if (cmd.includes("rev-list --count")) return "3\n";
      if (cmd.includes("git diff --name-only")) return "src/Card.tsx\n";
      if (cmd.includes("git log")) return "fix card layout\n";
      return "";
    };

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 1);
    assert.equal(issues[0].id, "abc-123");
    assert.equal(issues[0].branch, "feat/abc-123");
    assert.equal(issues[0].title, "fix card layout");
    assert.equal(issues[0].touchesUI, true);
    assert.equal(issues[0].scope, "src/**");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (b) Branch with 0 commits ahead → excluded
  // ═══════════════════════════════════════════════════════════════════

  test("(b) worktree with zero commits ahead of main is excluded", () => {
    readdirSyncReturn = [worktreeEntry("xyz-456")];

    execSyncHandler = (cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return "feat/xyz-456\n";
      if (cmd.includes("rev-list --count")) return "0\n";
      return "";
    };

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (c) No worktree directory → empty array
  // ═══════════════════════════════════════════════════════════════════

  test("(c) missing worktree directory returns empty array", () => {
    existsSyncReturn = false;

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (d) Git failure for a worktree → skipped, others still returned
  // ═══════════════════════════════════════════════════════════════════

  test("(d) git failure skips worktree without crashing", () => {
    readdirSyncReturn = [
      worktreeEntry("good-001"),
      worktreeEntry("bad-002"),
    ];

    execSyncHandler = (cmd: string) => {
      if (cmd.includes("bad-002")) throw new Error("git failed");
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return "feat/good-001\n";
      if (cmd.includes("rev-list --count")) return "2\n";
      if (cmd.includes("git diff --name-only")) return "";
      if (cmd.includes("git log")) return "implement grid\n";
      return "";
    };

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 1);
    assert.equal(issues[0].id, "good-001");
  });

  // ═══════════════════════════════════════════════════════════════════
  // (e) Non-UI branch (no src/ changes) → touchesUI false
  // ═══════════════════════════════════════════════════════════════════

  test("(e) branch with no src/ changes has touchesUI=false", () => {
    readdirSyncReturn = [worktreeEntry("infra-99")];

    execSyncHandler = (cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return "feat/infra-99\n";
      if (cmd.includes("rev-list --count")) return "1\n";
      if (cmd.includes("git diff --name-only")) return "";  // no src/ files
      if (cmd.includes("git log")) return "update config\n";
      return "";
    };

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 1);
    assert.equal(issues[0].touchesUI, false);
  });

  // ═══════════════════════════════════════════════════════════════════
  // (f) Non-issue directories and files are ignored
  // ═══════════════════════════════════════════════════════════════════

  test("(f) non-issue entries (planner worktrees, files) are ignored", () => {
    readdirSyncReturn = [
      { name: "sandcastle-planner-abc", isDirectory: () => true },
      { name: "some-file.txt", isDirectory: () => false },
      worktreeEntry("real-001"),
    ];

    execSyncHandler = (cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return "feat/real-001\n";
      if (cmd.includes("rev-list --count")) return "5\n";
      if (cmd.includes("git diff --name-only")) return "src/App.tsx\n";
      if (cmd.includes("git log")) return "add app shell\n";
      return "";
    };

    const issues = discoverResumableIssues();

    assert.equal(issues.length, 1);
    assert.equal(issues[0].id, "real-001");
  });
});
