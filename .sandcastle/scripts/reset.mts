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
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e: any) {
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

// ── 3. Surgical revert of ticket-changed src/ files ─────────────────────────
//
// Only revert files the ticket branch actually changed — not the entire src/
// tree. A blanket restore would clobber independent changes (e.g. tokens.css
// updated outside the ticket).
//
// Approach: diff the merge's parents to find exactly which src/ files the
// ticket touched, then restore only those from the baseline.

const branch = `sandcastle/issue-${issueId}`;

// Find ALL merge commits for this issue on main (there may be multiple runs).
// The NEWEST merge's first parent gives us the correct baseline — the state
// of main right before the latest run merged, preserving independent changes.
const escapedBranch = branch.replace(/\//g, "\\/");
let mergeCommits = run(
  `git log --first-parent --grep="/${escapedBranch}" --merges --format=%H main`,
  { ignoreError: true },
);
if (!mergeCommits) {
  mergeCommits = run(
    `git log --first-parent --grep="^Merge ${escapedBranch}:" --format=%H main`,
    { ignoreError: true },
  );
}

if (mergeCommits) {
  const mergeList = mergeCommits.split("\n").filter(Boolean);
  const newestMerge = mergeList[0]!;
  const oldestMerge = mergeList[mergeList.length - 1]!;
  log(`Found ${mergeList.length} merge(s) for this ticket on main.`);
  log(`  Newest: ${newestMerge.slice(0, 7)}, Oldest: ${oldestMerge.slice(0, 7)}`);

  // Two baselines needed for multi-merge tickets:
  //   preTicket = oldestMerge^1 — true pre-ticket state (before any run)
  //   preLatest = newestMerge^1 — main before the latest merge (has independent evolution)
  //
  // For files the ticket introduced (not at preTicket): remove them.
  // For files the ticket modified that also exist at preTicket:
  //   if the file also evolved independently on main → restore to preLatest (preserves independent work)
  //   otherwise → restore to preTicket
  const oldestParentCount = run(`git cat-file -p ${oldestMerge} | grep -c "^parent"`, { ignoreError: true });
  let preTicket = "";
  if (parseInt(oldestParentCount, 10) >= 2) {
    preTicket = run(`git rev-parse ${oldestMerge}^1`, { ignoreError: true });
  }

  let preLatest = "";
  if (newestMerge !== oldestMerge) {
    const newestParentCount = run(`git cat-file -p ${newestMerge} | grep -c "^parent"`, { ignoreError: true });
    if (parseInt(newestParentCount, 10) >= 2) {
      preLatest = run(`git rev-parse ${newestMerge}^1`, { ignoreError: true });
    }
  }

  if (!preTicket) {
    // Fallback: branch reflog
    const branchReflog = run(
      `git reflog show "${branch}" --format="%H %gs" 2>/dev/null`,
      { ignoreError: true },
    );
    if (branchReflog) {
      const creation = branchReflog.split("\n").find((l) => l.includes("branch: Created from"));
      if (creation) preTicket = creation.split(" ")[0]!;
    }
  }

  if (preTicket) {
    log(`Pre-ticket baseline: ${preTicket.slice(0, 7)}`);
    if (preLatest) log(`Pre-latest-merge baseline: ${preLatest.slice(0, 7)}`);

    // Compare current src/ tree against pre-ticket — skip if already matching.
    const currentTree = run(`git rev-parse HEAD:src`, { ignoreError: true });
    const preTicketTree = run(`git rev-parse ${preTicket}:src`, { ignoreError: true });

    if (currentTree && preTicketTree && currentTree === preTicketTree) {
      log("src/ already matches pre-ticket state — nothing to revert.");
    } else {
      // Diff HEAD against the true pre-ticket state to find ALL files the
      // ticket introduced or modified across every run.
      const changedFiles = run(
        `git diff --name-only ${preTicket} HEAD -- src/`,
        { ignoreError: true },
      );
      const fileList = changedFiles ? changedFiles.split("\n").filter(Boolean) : [];

      if (fileList.length === 0) {
        log("No src/ files changed by the ticket — nothing to revert.");
      } else {
        log(`Reverting ${fileList.length} file(s) changed by the ticket...`);
        for (const file of fileList) {
          const existsAtPreTicket = run(
            `git ls-tree ${preTicket} -- "${file}" 2>/dev/null`,
            { ignoreError: true },
          );
          if (existsAtPreTicket) {
            // File existed before the ticket. Check if it was also modified
            // by non-merge commits on main (independent evolution like WIP
            // or foundation work). Merge commits are ticket runs — those
            // don't count as independent. If independent evolution exists,
            // restore to preLatest to preserve that work.
            let restoreTo = preTicket;
            if (preLatest) {
              const nonMergeChanges = run(
                `git log --first-parent --no-merges --format=%H ${preTicket}..${preLatest} -- "${file}"`,
                { ignoreError: true },
              );
              if (nonMergeChanges) {
                log(`  ${file}: independently evolved on main — using pre-latest-merge version`);
                restoreTo = preLatest;
              }
            }
            run(`git checkout ${restoreTo} -- "${file}"`);
          } else {
            // File was added by the ticket — remove it
            run(`git rm -f --cached "${file}"`, { ignoreError: true });
            run(`rm -f "${file}"`, { ignoreError: true });
          }
        }
      }
      run(`git clean -fd src/`, { ignoreError: true });

      const staged = run(`git diff --cached --name-only`, { ignoreError: true });
      if (staged) {
        run(`git commit -m "Revert src/ to pre-sandcastle state for ${issueId} re-processing"`);
        log("src/ restored to pre-implementation state.");

        log("Pushing to origin/main...");
        run(`git push origin main`, { ignoreError: true });
      } else {
        log("src/ already matches pre-ticket state — nothing to revert.");
      }
    }
  } else {
    log("WARNING: Could not determine baseline — src/ revert skipped.");
    log("         You may need to manually revert the src/ changes.");
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
