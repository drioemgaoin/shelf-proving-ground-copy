#!/usr/bin/env npx tsx
// Reset a sandcastle issue so it can be re-run from scratch.
//
// What it does:
//   1. Reopens the issue if closed, unclaims it if in_progress
//   2. Removes escalation labels added during the pipeline
//   3. Reverts the merge commit and branch commits from main (if merged)
//   4. Removes the worktree directory
//   5. Deletes the sandcastle branch (local only)
//   6. Cleans the watch directory (stale symlinks to deleted worktree)
//   7. Removes logs and expanded prompts
//   8. Removes the pipeline lock
//
// Usage:
//   npx tsx .sandcastle/scripts/reset.mts <issue-id>
//   npm run sandcastle:reset -- <issue-id>

import { execSync } from "child_process";
import { existsSync, lstatSync, readlinkSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

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

// ── 2. Remove escalation labels ─────────────────────────────────────────────
// The pipeline adds `ready-for-human` on escalation (exhaustion, oscillation,
// deferred issues). Remove it so the issue is eligible for the next run.

const labelsOutput = run(`bd label list ${issueId} --json 2>/dev/null`, { ignoreError: true });
const ESCALATION_LABELS = ["ready-for-human"];

for (const label of ESCALATION_LABELS) {
  if (labelsOutput.includes(label)) {
    log(`Removing label: ${label}`);
    run(`bd label remove ${issueId} ${label}`, { ignoreError: true });
  }
}

// ── 3. Revert merge from main ───────────────────────────────────────────────
// If the ticket completed the merge phase, its branch commits were
// fast-forwarded onto main and a summary commit was added. We revert the
// entire range (fork-point..merge-commit] so the next run starts clean.
//
// Finding the merge commit:
//   a) GitHub PR merge: "Merge pull request #N from <remote>/<branch>"
//   b) Local git merge: "Merge <branch>: ..."
// We search for both patterns.
//
// Finding the fork point:
//   a) True merge commit (PR merge): first parent is pre-merge main.
//   b) Fast-forward (local merge): use branch reflog or main reflog.

const branch = `sandcastle/issue-${issueId}`;

// Find the most recent merge commit for this issue on main.
// Match both GitHub PR merge messages and local merge messages.
let mergeCommit = run(
  `git log --grep="/${branch.replace(/\//g, "\\/")}" --merges --format=%H -1 main`,
  { ignoreError: true },
);
if (!mergeCommit) {
  mergeCommit = run(
    `git log --grep="^Merge ${branch.replace(/\//g, "\\/")}:" --format=%H -1 main`,
    { ignoreError: true },
  );
}

if (mergeCommit) {
  // Check if this merge was already reverted by a previous reset.
  const revertExists = run(
    `git log --grep="^Revert sandcastle/${issueId.replace(/\./g, "\\.")}:" --format=%H -1 main`,
    { ignoreError: true },
  );
  const alreadyReverted = revertExists
    ? run(`git merge-base --is-ancestor ${mergeCommit} ${revertExists} && echo yes || echo no`) === "yes"
    : false;

  if (alreadyReverted) {
    log(`Merge commit ${mergeCommit.slice(0, 7)} was already reverted — skipping.`);
  } else {
    log(`Found merge commit on main: ${mergeCommit.slice(0, 7)}`);

    // Find the fork point — the commit main was at before the branch was merged.
    //
    // Strategy A: true merge commit (GitHub PR merge) — first parent is
    //   the pre-merge main tip.
    //
    // Strategy B: branch reflog (most reliable when branch still exists).
    //   The last entry is "branch: Created from HEAD" at the fork SHA.
    //
    // Strategy C: main HEAD reflog.
    //   Find "merge <branch>: Fast-forward"; the next reflog entry is the
    //   pre-merge HEAD.
    let forkPoint = "";

    // Strategy A: true merge commit — first parent is the pre-merge main
    const parentCount = run(`git cat-file -p ${mergeCommit} | grep -c "^parent"`, { ignoreError: true });
    if (parseInt(parentCount, 10) >= 2) {
      forkPoint = run(`git rev-parse ${mergeCommit}^1`, { ignoreError: true });
    }

    // Strategy B: branch reflog
    if (!forkPoint) {
      const branchReflog = run(
        `git reflog show "${branch}" --format="%H %gs" 2>/dev/null`,
        { ignoreError: true },
      );
      if (branchReflog) {
        const lines = branchReflog.split("\n");
        const creation = lines.find((l) => l.includes("branch: Created from"));
        if (creation) {
          forkPoint = creation.split(" ")[0]!;
        }
      }
    }

    // Strategy C: main HEAD reflog
    if (!forkPoint) {
      const mainReflog = run(`git reflog --format="%H %gs"`, { ignoreError: true });
      if (mainReflog) {
        const lines = mainReflog.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.includes(`merge ${branch}:`)) {
            if (i + 1 < lines.length) {
              forkPoint = lines[i + 1]!.split(" ")[0]!;
            }
            break;
          }
        }
      }
    }

    if (forkPoint) {
      const isAncestor = run(
        `git merge-base --is-ancestor "${forkPoint}" "${mergeCommit}" && echo yes || echo no`,
      );
      if (isAncestor === "yes") {
        // For true merge commits, revert the merge itself (not the range)
        if (parseInt(parentCount, 10) >= 2) {
          log(`Reverting merge commit ${mergeCommit.slice(0, 7)} (PR merge)...`);
          run(`git revert -m 1 --no-commit ${mergeCommit}`);
        } else {
          const count = run(`git rev-list --count ${forkPoint}..${mergeCommit}`);
          log(`Reverting ${count} commit(s) (${forkPoint.slice(0, 7)}..${mergeCommit.slice(0, 7)})...`);
          run(`git revert --no-commit ${forkPoint}..${mergeCommit}`);
        }
        run(`git commit -m "Revert sandcastle/${issueId}: reset for re-processing"`);
        log("Merge reverted.");

        // Push the revert to the remote so origin/main is also clean.
        log("Pushing revert to origin/main...");
        run(`git push origin main`, { ignoreError: true });
      } else {
        log(`WARNING: fork point ${forkPoint.slice(0, 7)} is not an ancestor of merge — skipping revert.`);
      }
    } else {
      log("WARNING: Could not determine fork point from reflog — merge revert skipped.");
      log("         You may need to manually revert the merge commits.");
    }
  }
} else {
  log("No merge commit found on main (ticket was not merged).");
}

// ── 4. Remove worktree directory (must happen before branch delete) ──────────

const worktreeCandidates = [
  `.sandcastle/worktrees/sandcastle-issue-${issueId}`,
  `.sandcastle/worktrees/${branch.replace(/\//g, "-")}`,
];

for (const dir of worktreeCandidates) {
  if (existsSync(dir)) {
    log(`Removing worktree: ${dir}`);
    // Use git worktree remove first — this properly detaches the branch
    // so the subsequent branch delete (step 5) can succeed.
    run(`git worktree remove --force "${dir}"`, { ignoreError: true });

    // If git worktree remove failed (e.g. Docker-owned files), fall back
    // to manual cleanup: remove symlinks, then rmSync, then prune.
    if (existsSync(dir)) {
      log(`  git worktree remove failed, falling back to manual cleanup...`);
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
}

// Prune so git no longer associates the worktree with the branch.
run("git worktree prune", { ignoreError: true });

// ── 5. Delete sandcastle branch ─────────────────────────────────────────────

const branchExists = run(`git branch --list "${branch}"`, { ignoreError: true });

if (branchExists) {
  log(`Deleting local branch: ${branch}`);
  run(`git branch -D "${branch}"`);
} else {
  log(`No local branch to delete (${branch}).`);
}

// Also delete the remote branch — if it survives, createSandbox will check
// it out from origin and the implementer will see the old implementation.
const remoteBranchExists = run(
  `git branch -r --list "origin/${branch}"`,
  { ignoreError: true },
);

if (remoteBranchExists) {
  log(`Deleting remote branch: origin/${branch}`);
  run(`git push origin --delete "${branch}"`, { ignoreError: true });
}

// Always prune stale remote-tracking refs — even if the remote branch was
// already deleted (e.g. via GitHub UI), the local tracking ref survives and
// createSandbox will check it out, resurrecting the old implementation.
run(`git fetch origin --prune`, { ignoreError: true });

// Belt-and-suspenders: explicitly remove the tracking ref in case fetch
// --prune didn't cover it (offline, auth issues, etc.).
const trackingRefStillExists = run(
  `git branch -r --list "origin/${branch}"`,
  { ignoreError: true },
);
if (trackingRefStillExists) {
  log(`Removing stale tracking ref: origin/${branch}`);
  run(`git branch -d -r "origin/${branch}"`, { ignoreError: true });
}

// ── 6. Clean watch directory ────────────────────────────────────────────────
// The watch script creates symlinks in .sandcastle/watch/ that point into the
// worktree. After deleting the worktree these become dangling. Remove any
// symlink whose target lived inside the deleted worktree, and if the watch
// directory ends up empty (or only has non-symlink config copies), remove it.

const watchDir = ".sandcastle/watch";
if (existsSync(watchDir)) {
  let cleaned = false;
  for (const entry of readdirSync(watchDir)) {
    const p = join(watchDir, entry);
    try {
      if (lstatSync(p).isSymbolicLink()) {
        const target = readlinkSync(p);
        // Symlinks pointing into any worktree for this issue are stale
        if (target.includes(`sandcastle-issue-${issueId}`) || !existsSync(p)) {
          log(`  Removing stale watch symlink: ${entry}`);
          unlinkSync(p);
          cleaned = true;
        }
      }
    } catch {}
  }

  // Remove leftover config copies (tsconfig.json, vite.config.ts) and the
  // directory itself if no live symlinks remain.
  if (cleaned) {
    const remaining = readdirSync(watchDir);
    const hasLiveSymlinks = remaining.some((e) => {
      try { return lstatSync(join(watchDir, e)).isSymbolicLink(); } catch { return false; }
    });
    if (!hasLiveSymlinks) {
      log("Removing empty watch directory.");
      rmSync(watchDir, { recursive: true, force: true });
    }
  }
}

// ── 7. Remove logs ──────────────────────────────────────────────────────────

const logsDir = ".sandcastle/logs";
if (existsSync(logsDir)) {
  // Per-issue logs: sandcastle-issue-<id>-*.log
  const issueLogPrefix = `sandcastle-issue-${issueId}-`;
  // Orchestrator logs and prompts: main-*.log, planner.prompt.md, merger.prompt.md
  const orchestratorPrefix = "main-";

  // Shared orchestrator logs that accumulate across runs
  const sharedLogs = ["planner.log"];

  for (const entry of readdirSync(logsDir)) {
    const p = `${logsDir}/${entry}`;
    if (entry.startsWith(issueLogPrefix) || entry.startsWith(orchestratorPrefix) || sharedLogs.includes(entry)) {
      log(`Removing log: ${p}`);
      rmSync(p, { force: true });
    } else if (entry.endsWith(".prompt.md")) {
      log(`Removing prompt: ${p}`);
      rmSync(p, { force: true });
    } else if (entry === issueId && lstatSync(p).isDirectory()) {
      log(`Removing log subdirectory: ${p}`);
      rmSync(p, { recursive: true, force: true });
    } else if (entry === "monitor" && lstatSync(p).isDirectory()) {
      log(`Removing monitor directory: ${p}`);
      rmSync(p, { recursive: true, force: true });
    }
  }
}

// ── 8. Remove pipeline lock ─────────────────────────────────────────────────

const lockPath = ".sandcastle/pipeline.lock";
if (existsSync(lockPath)) {
  log("Removing pipeline lock...");
  rmSync(lockPath, { force: true });
}

log(`Done. Run \`npm run sandcastle\` to rebuild ${issueId}.`);
