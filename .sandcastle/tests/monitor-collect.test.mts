// Functional tests for collectMonitorData / collectAllWorktrees.
//
// Run: npx tsx --test .sandcastle/tests/monitor-collect.test.mts

import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const WORK = join(tmpdir(), `monitor-collect-test-${process.pid}`);
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  process.chdir(WORK);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(WORK, { recursive: true, force: true });
});

async function loadModule() {
  const mod = await import("../lib/monitor-collect.mjs");
  return mod as {
    collectMonitorData: (worktreePath: string, issueId: string) => void;
    collectAllWorktrees: () => void;
  };
}

/** Create a fake worktree with monitor JSONL files. */
function seedWorktree(worktreePath: string, files: Record<string, string>) {
  const monitorDir = join(worktreePath, ".sandcastle", "logs", "monitor");
  mkdirSync(monitorDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(monitorDir, name), content);
  }
}

const HOST_MONITOR_DIR = ".sandcastle/logs/monitor";

// ═══════════════════════════════════════════════════════════════════
// collectMonitorData
// ═══════════════════════════════════════════════════════════════════

describe("collectMonitorData", () => {
  test("(a) files exist → copied to host path, sources deleted", async () => {
    const { collectMonitorData } = await loadModule();
    const wt = join(WORK, "worktrees", "beads-001");
    const line1 = '{"event":"check","ts":"2026-10-22T00:00:00Z"}';
    const line2 = '{"event":"fix","ts":"2026-10-22T00:01:00Z"}';
    seedWorktree(wt, { "2026-10-22.jsonl": `${line1}\n${line2}` });

    collectMonitorData(wt, "beads-001");

    // Host file created with content
    const hostFile = join(HOST_MONITOR_DIR, "2026-10-22.jsonl");
    assert.ok(existsSync(hostFile), "host file should exist");
    const hostContent = readFileSync(hostFile, "utf8");
    assert.ok(hostContent.includes(line1), "line1 should be present");
    assert.ok(hostContent.includes(line2), "line2 should be present");

    // Source deleted
    const srcFile = join(wt, ".sandcastle", "logs", "monitor", "2026-10-22.jsonl");
    assert.ok(!existsSync(srcFile), "source file should be deleted");
  });

  test("(b) no monitor dir → no-op, no throw", async () => {
    const { collectMonitorData } = await loadModule();
    const wt = join(WORK, "worktrees", "beads-002");
    mkdirSync(wt, { recursive: true });
    // No .sandcastle/logs/monitor/ inside

    // Should not throw
    collectMonitorData(wt, "beads-002");

    assert.ok(!existsSync(HOST_MONITOR_DIR), "host dir should not be created");
  });

  test("(c) destination already has files → appended, not overwritten", async () => {
    const { collectMonitorData } = await loadModule();
    const hostFile = join(HOST_MONITOR_DIR, "2026-10-22.jsonl");
    mkdirSync(HOST_MONITOR_DIR, { recursive: true });
    const existingLine = '{"event":"old","ts":"2026-10-21T00:00:00Z"}';
    writeFileSync(hostFile, existingLine + "\n");

    const wt = join(WORK, "worktrees", "beads-003");
    const newLine = '{"event":"new","ts":"2026-10-22T00:00:00Z"}';
    seedWorktree(wt, { "2026-10-22.jsonl": newLine });

    collectMonitorData(wt, "beads-003");

    const content = readFileSync(hostFile, "utf8");
    assert.ok(content.includes(existingLine), "existing content preserved");
    assert.ok(content.includes(newLine), "new content appended");
  });

  test("(d) empty jsonl file → skipped", async () => {
    const { collectMonitorData } = await loadModule();
    const wt = join(WORK, "worktrees", "beads-004");
    seedWorktree(wt, { "2026-10-22.jsonl": "   \n  " });

    collectMonitorData(wt, "beads-004");

    // Host dir may be created (mkdirSync runs before the content check),
    // but no file should be written.
    const hostFile = join(HOST_MONITOR_DIR, "2026-10-22.jsonl");
    assert.ok(!existsSync(hostFile), "empty source should not produce host file");
  });

  test("(e) second call after sources deleted → no duplicates (idempotent)", async () => {
    const { collectMonitorData } = await loadModule();
    const wt = join(WORK, "worktrees", "beads-005");
    const line = '{"event":"once","ts":"2026-10-22T00:00:00Z"}';
    seedWorktree(wt, { "2026-10-22.jsonl": line });

    collectMonitorData(wt, "beads-005");
    collectMonitorData(wt, "beads-005"); // second call

    const hostFile = join(HOST_MONITOR_DIR, "2026-10-22.jsonl");
    const content = readFileSync(hostFile, "utf8");
    const occurrences = content.split(line).length - 1;
    assert.equal(occurrences, 1, "event should appear exactly once");
  });
});

// ═══════════════════════════════════════════════════════════════════
// collectAllWorktrees
// ═══════════════════════════════════════════════════════════════════

describe("collectAllWorktrees", () => {
  test("(f) iterates subdirectories and collects from each", async () => {
    const { collectAllWorktrees } = await loadModule();

    // Create two fake worktrees under .sandcastle/worktrees/
    const wtRoot = ".sandcastle/worktrees";
    const wt1 = join(wtRoot, "beads-010");
    const wt2 = join(wtRoot, "beads-011");
    const line1 = '{"event":"wt1","ts":"2026-10-22T00:00:00Z"}';
    const line2 = '{"event":"wt2","ts":"2026-10-22T00:00:00Z"}';
    seedWorktree(wt1, { "2026-10-22.jsonl": line1 });
    seedWorktree(wt2, { "2026-10-22.jsonl": line2 });

    collectAllWorktrees();

    const hostFile = join(HOST_MONITOR_DIR, "2026-10-22.jsonl");
    assert.ok(existsSync(hostFile), "host file should exist");
    const content = readFileSync(hostFile, "utf8");
    assert.ok(content.includes(line1), "wt1 event collected");
    assert.ok(content.includes(line2), "wt2 event collected");
  });
});
