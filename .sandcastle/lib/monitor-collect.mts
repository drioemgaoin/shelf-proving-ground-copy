// Host-side monitor data collection.
//
// The in-container recorder (apply-t1.mjs) writes NDJSON events to
// <worktree>/.sandcastle/logs/monitor/<date>.jsonl. These files are
// untracked, so they vanish when the worktree is cleaned up.
//
// collectMonitorData() copies them to the host's monitor directory
// BEFORE sandbox.close() deletes the worktree.

import { existsSync, readdirSync, readFileSync, appendFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { log } from "./logging.mjs";

const HOST_MONITOR_DIR = ".sandcastle/logs/monitor";

/**
 * Copy NDJSON monitor events from a worktree to the host monitor directory.
 * Idempotent and fail-open — never throws.
 */
export function collectMonitorData(worktreePath: string, issueId: string): void {
  try {
    const srcDir = join(worktreePath, ".sandcastle", "logs", "monitor");
    if (!existsSync(srcDir)) return;

    const files = readdirSync(srcDir).filter((f) => f.endsWith(".jsonl"));
    if (files.length === 0) return;

    mkdirSync(HOST_MONITOR_DIR, { recursive: true });

    let totalLines = 0;
    for (const file of files) {
      const content = readFileSync(join(srcDir, file), "utf8").trim();
      if (!content) continue;
      // Append to the same-named file on the host (same date key).
      appendFileSync(join(HOST_MONITOR_DIR, file), content + "\n");
      // Delete source so a second call (e.g. SIGINT after per-issue collect)
      // does not duplicate events.
      try { unlinkSync(join(srcDir, file)); } catch { /* best-effort */ }
      totalLines += content.split("\n").length;
    }

    if (totalLines > 0) {
      log(`  📋 Collected ${totalLines} monitor event(s) from ${issueId}`);
    }
  } catch {
    // Fail-open: monitor collection must never break the pipeline.
  }
}

/**
 * Collect monitor data from all active worktrees.
 * Called by the SIGINT handler before exit.
 */
export function collectAllWorktrees(): void {
  try {
    const worktreeRoot = ".sandcastle/worktrees";
    if (!existsSync(worktreeRoot)) return;

    const entries = readdirSync(worktreeRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const worktreePath = join(worktreeRoot, entry.name);
      collectMonitorData(worktreePath, entry.name);
    }
  } catch {
    // Fail-open.
  }
}
