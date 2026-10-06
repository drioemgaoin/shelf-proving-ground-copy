#!/usr/bin/env npx tsx
// Reset a sandcastle issue so it can be re-run from scratch.
//
// What it does:
//   1. Reopens the issue if closed, unclaims it if in_progress
//   2. Deletes its sandcastle branch (local only)
//   3. Removes its worktree directory
//   4. Prunes stale git worktrees
//
// Usage:
//   npx tsx .sandcastle/reset.mts <issue-id>
//   npm run sandcastle:reset -- <issue-id>

import { execSync } from "child_process";
import { existsSync, lstatSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

function run(cmd: string, opts?: { ignoreError?: boolean }): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    if (opts?.ignoreError) return "";
    throw e;
  }
}

function log(msg: string) {
  console.log(`[reset] ${msg}`);
}

// ── Resolve issue ID ────────────────────────────────────────────────────────

const issueId = process.argv[2];

if (!issueId) {
  console.error(
    "[reset] Usage: npm run sandcastle:reset -- <issue-id>\n" +
    "        Example: npm run sandcastle:reset -- shelf-proving-ground-djk.1"
  );
  process.exit(1);
}

log(`Resetting issue: ${issueId}`);

// ── 1. Reopen / unclaim ─────────────────────────────────────────────────────

const showOutput = run(`bd show ${issueId} 2>/dev/null`, { ignoreError: true });

if (!showOutput) {
  console.error(`[reset] Issue ${issueId} not found.`);
  process.exit(1);
}

if (showOutput.includes("CLOSED") || showOutput.includes("✓")) {
  log("Reopening closed issue...");
  run(`bd reopen ${issueId}`);
  log("Reopened.");
} else if (showOutput.includes("IN_PROGRESS") || showOutput.includes("◐")) {
  log("Unclaiming in_progress issue...");
  run(`bd unclaim ${issueId}`);
  log("Unclaimed.");
} else {
  log("Issue is already open.");
}

// ── 2. Remove worktree directory (must happen before branch delete) ──────────

const branch = `sandcastle/issue-${issueId}`;

const worktreeCandidates = [
  `.sandcastle/worktrees/sandcastle-issue-${issueId}`,
  `.sandcastle/worktrees/${branch.replace(/\//g, "-")}`,
];

for (const dir of worktreeCandidates) {
  if (existsSync(dir)) {
    log(`Removing worktree: ${dir}`);
    // Remove symlinks (e.g. node_modules → /warm/node_modules) first so
    // rmSync doesn't follow them and destroy the target.
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      try {
        if (lstatSync(p).isSymbolicLink()) {
          log(`  Unlinking symlink: ${entry}`);
          unlinkSync(p);
        }
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

// Prune so git no longer associates the worktree with the branch.
run("git worktree prune", { ignoreError: true });

// ── 3. Delete sandcastle branch ─────────────────────────────────────────────

const branchExists = run(`git branch --list "${branch}"`, { ignoreError: true });

if (branchExists) {
  log(`Deleting branch: ${branch}`);
  run(`git branch -D "${branch}"`);
} else {
  log(`No branch to delete (${branch}).`);
}

// ── 4. Remove logs ──────────────────────────────────────────────────────────

const logsDir = ".sandcastle/logs";
if (existsSync(logsDir)) {
  // Per-issue logs: sandcastle-issue-<id>-*.log
  const issueLogPrefix = `sandcastle-issue-${issueId}-`;
  // Orchestrator logs and prompts: main-*.log, planner.prompt.md, merger.prompt.md
  const orchestratorPrefix = "main-";

  for (const entry of readdirSync(logsDir)) {
    const p = `${logsDir}/${entry}`;
    if (entry.startsWith(issueLogPrefix) || entry.startsWith(orchestratorPrefix)) {
      log(`Removing log: ${p}`);
      rmSync(p, { force: true });
    } else if (entry.endsWith(".prompt.md")) {
      log(`Removing prompt: ${p}`);
      rmSync(p, { force: true });
    } else if (entry === issueId && lstatSync(p).isDirectory()) {
      log(`Removing log subdirectory: ${p}`);
      rmSync(p, { recursive: true, force: true });
    }
  }
}

log(`Done. Run \`npm run sandcastle:single\` to rebuild ${issueId}.`);
