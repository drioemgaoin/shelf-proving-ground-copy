// Sandcastle Orchestrator
//
// Four-phase loop: Plan → Execute (with QA gates) → Merge → Global T2.
// Repeats until no unblocked issues remain or MAX_ITERATIONS is reached.
//
// Usage:
//   npx tsx .sandcastle/main.mts [--single] [--verbose] [--overlay] [--tickets [dir]] [--resume] [--keep-worktree]

import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { log } from "./lib/logging.mjs";
import { hasFlag, flag } from "./lib/cli.mjs";
import { buildWarmImage, createBuilderHooks, buildOverlayFileList } from "./lib/sandbox.mjs";
import { readTicketFiles, ticketsToReadyJson } from "./lib/tickets.mjs";
import { planIteration, executeInParallel, mergeCompleted, resumeQAGates } from "./lib/phases.mjs";
import type { PlannedIssue } from "./lib/phases.mjs";
import { CostCeilingExceededError } from "./lib/tagged-agent.mjs";
import { MAX_ITERATIONS } from "./config/constants.mjs";
import {
  VIEW_TASK_COMMAND,
  LIST_READY_COMMAND,
  CLOSE_TASK_COMMAND,
  COMMENT_TASK_COMMAND,
  LABEL_TASK_COMMAND,
  CREATE_BUG_COMMAND,
  SEARCH_BUGS_COMMAND,
  CLOSE_BUG_COMMAND,
  TICKET_OVERRIDES,
  DISTILL,
} from "./config/tracker.mjs";
import { distillIssueDetails } from "./lib/distill.mjs";
import { acquireLock, releaseLock } from "./lib/pipeline-lock.mjs";
import { runGlobalT2, createT2Runner, createT2Tracker } from "./lib/global-t2.mjs";
import { collectAllWorktrees } from "./lib/monitor-collect.mjs";

// ---------------------------------------------------------------------------
// SIGINT/SIGTERM: collect monitor data, release lock, and exit.
//
// Without process.exit(), registering a listener suppresses Node's default
// "terminate" behavior, so the process would hang after Ctrl-C.
// ---------------------------------------------------------------------------

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    collectAllWorktrees();
    releaseLock(process.cwd());
    process.exit(128 + (sig === "SIGINT" ? 2 : 15));
  });
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const SINGLE_MODE = hasFlag("single");
const VERBOSE = hasFlag("verbose");
const OVERLAY = hasFlag("overlay");
const RESUME = hasFlag("resume");
const KEEP_WORKTREE = hasFlag("keep-worktree");
const TICKETS_FLAG = hasFlag("tickets");
const TICKETS_DIR = (() => {
  const next = flag("tickets");
  // flag() returns the token after --tickets; skip if it's another flag
  return next && !next.startsWith("--") ? next : "./tickets";
})();

// ---------------------------------------------------------------------------
// Tracker commands — overridden in --tickets mode
// ---------------------------------------------------------------------------

const tracker = TICKETS_FLAG
  ? TICKET_OVERRIDES
  : { VIEW_TASK_COMMAND, LIST_READY_COMMAND, CLOSE_TASK_COMMAND, COMMENT_TASK_COMMAND, LABEL_TASK_COMMAND, CREATE_BUG_COMMAND, DISTILL };

// ---------------------------------------------------------------------------
// Gap 11: Concurrent run prevention
// ---------------------------------------------------------------------------

const RUN_ID = `run-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;
if (!acquireLock(process.cwd(), RUN_ID)) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

log("Building warm image...");
const warmImage = buildWarmImage();
log(`Warm image ready: ${warmImage}`);

const builderHooks = createBuilderHooks(OVERLAY);
const copyToWorktree = OVERLAY ? buildOverlayFileList() : [];

// ---------------------------------------------------------------------------
// Planner worktree cleanup
// ---------------------------------------------------------------------------

function cleanupPlannerWorktrees(): void {
  const root = ".sandcastle/worktrees";
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("sandcastle-planner-")) continue;
    const dir = `${root}/${entry}`;
    try {
      execSync(`git worktree remove --force ${dir}`, { encoding: "utf8", timeout: 10_000 });
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  try {
    execSync("git worktree prune", { encoding: "utf8", timeout: 10_000 });
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Pre-expansion helpers
// ---------------------------------------------------------------------------

function fetchReadyIssues(): { readyIssues: string; ticketFiles?: Map<string, { content: string }> } {
  if (TICKETS_FLAG) {
    const tickets = readTicketFiles(TICKETS_DIR);
    const ticketFiles = new Map(tickets.map((t) => [`ticket-${t.id}`, t]));
    log(`  Read ${tickets.length} ticket(s) from ${TICKETS_DIR}`);
    return { readyIssues: ticketsToReadyJson(tickets), ticketFiles };
  }
  return { readyIssues: execSync(tracker.LIST_READY_COMMAND, { encoding: "utf8" }).trim() };
}

function fetchIssueDetails(
  issues: Array<{ id: string; scope?: string }>,
  ticketFiles?: Map<string, { content: string }>,
): { details: Map<string, string>; codemaps: Map<string, string> } {
  const details = new Map<string, string>();
  const codemaps = new Map<string, string>();

  for (const issue of issues) {
    // Issue details
    if (TICKETS_FLAG && ticketFiles) {
      details.set(issue.id, distillIssueDetails(ticketFiles.get(issue.id)?.content ?? "", tracker.DISTILL));
    } else {
      const cmd = tracker.VIEW_TASK_COMMAND.replace("<ID>", issue.id);
      details.set(issue.id, distillIssueDetails(execSync(cmd, { encoding: "utf8" }).trim(), tracker.DISTILL));
    }

    // Codemap
    const scope = issue.scope || "src/**";
    const issueText = details.get(issue.id) ?? "";
    const includeTests = /\btest\b/i.test(issueText) ? "--include-tests" : "";
    const outPath = `/tmp/_codemap_${issue.id}.md`;
    try {
      execSync(
        `python3 codemap-tool/codemap-gen.py "${scope}" ${includeTests} -o ${outPath}`,
        { encoding: "utf8", timeout: 120_000 },
      );
      codemaps.set(issue.id, readFileSync(outPath, "utf8"));
      log(`  Codemap for ${issue.id}: scope="${scope}" ${includeTests || "(no tests)"}`);
    } catch (e) {
      log(`  Codemap generation failed for ${issue.id}: ${e}`);
      codemaps.set(issue.id, "<!-- codemap generation failed -->");
    }
  }

  return { details, codemaps };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Resume mode — skip planning + implementation, re-run QA gates on existing
// worktrees that have commits ahead of main.
// ---------------------------------------------------------------------------

function discoverResumableIssues(): PlannedIssue[] {
  const worktreeRoot = ".sandcastle/worktrees";
  if (!existsSync(worktreeRoot)) return [];

  const entries = readdirSync(worktreeRoot, { withFileTypes: true });
  const issues: PlannedIssue[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("sandcastle-issue-")) continue;
    const issueId = entry.name.replace("sandcastle-issue-", "");
    const worktreePath = `${worktreeRoot}/${entry.name}`;

    // Check the branch has commits ahead of main
    try {
      const branch = execSync(`git -C ${worktreePath} rev-parse --abbrev-ref HEAD`, { encoding: "utf8" }).trim();
      const ahead = execSync(`git rev-list --count main..${branch}`, { encoding: "utf8" }).trim();
      if (Number(ahead) === 0) continue;

      // Infer touchesUI from whether src/ files were changed
      const diff = execSync(`git diff --name-only main...${branch} -- src/`, { encoding: "utf8" }).trim();
      const touchesUI = diff.length > 0;

      // Get title from the last commit message
      const title = execSync(`git log -1 --format=%s ${branch}`, { encoding: "utf8" }).trim();

      issues.push({ id: issueId, title, branch, touchesUI, scope: "src/**" });
    } catch {
      log(`  Skipping ${issueId}: could not read worktree state.`);
    }
  }
  return issues;
}

try {
  if (RESUME) {
    // ── Resume path ──────────────────────────────────────────────────
    const issues = discoverResumableIssues();
    if (issues.length === 0) {
      log("Resume: no worktrees with commits found. Nothing to resume.");
    } else {
      log(`Resume: found ${issues.length} issue(s) with existing commits:`);
      for (const issue of issues) {
        log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
      }

      // Fetch issue details for QA prompts
      log("Pre-expanding issue details on host...");
      const { details } = fetchIssueDetails(issues);

      const completedIssues = await resumeQAGates(issues, {
        warmImage,
        hooks: builderHooks,
        copyToWorktree,
        verbose: VERBOSE,
        issueDetails: details,
        trackerCommands: {
          COMMENT_TASK_COMMAND: tracker.COMMENT_TASK_COMMAND,
          LABEL_TASK_COMMAND: tracker.LABEL_TASK_COMMAND,
          CREATE_BUG_COMMAND: tracker.CREATE_BUG_COMMAND,
        },
      });

      log(`Resume QA done. ${completedIssues.length} branch(es) passed QA:`);
      for (const issue of completedIssues) {
        log(`  ${issue.branch}`);
      }

      if (completedIssues.length > 0) {
        // Phase 3: Merge
        await mergeCompleted(completedIssues, {
          verbose: VERBOSE,
          closeTaskCommand: tracker.CLOSE_TASK_COMMAND,
          keepWorktree: KEEP_WORKTREE,
        });

        // Global T2 suite — post-merge
        log("Global T2 suite starting...");
        const t2result = await runGlobalT2({
          runner: createT2Runner(),
          tracker: createT2Tracker({
            searchCommand: SEARCH_BUGS_COMMAND,
            createBugCommand: tracker.CREATE_BUG_COMMAND,
            closeBugCommand: CLOSE_BUG_COMMAND,
            labelCommand: tracker.LABEL_TASK_COMMAND,
          }),
        });
        log(`Global T2 suite done. ${t2result.rounds} round(s), green=${t2result.green}.`);
      }
    }
  } else {
    // ── Normal path ──────────────────────────────────────────────────
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      log(`=== Iteration ${iteration}/${MAX_ITERATIONS} ===`);

      // Phase 1: Plan
      log("Pre-expanding issue list on host...");
      const { readyIssues, ticketFiles } = fetchReadyIssues();
      let issues = await planIteration({ readyIssues, warmImage, verbose: VERBOSE });

      // Clean up orphaned planner worktrees — merge-to-head doesn't always
      // self-clean (Docker file ownership, timing).  Safe to remove since the
      // planner writes no commits.
      cleanupPlannerWorktrees();

      if (SINGLE_MODE && issues.length > 1) {
        log(`Single mode: picking only ${issues[0]!.id}, skipping ${issues.length - 1} other(s).`);
        issues = [issues[0]!];
      }

      if (issues.length === 0) {
        log("No unblocked issues to work on. Exiting.");
        break;
      }

      log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
      for (const issue of issues) {
        log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
      }

      // Pre-expand issue details + codemaps on the host
      log("Pre-expanding issue details on host...");
      const { details, codemaps } = fetchIssueDetails(issues, ticketFiles);
      log("Generating codemaps...");

      // Phase 2: Execute + QA Gates
      const completedIssues = await executeInParallel(issues, {
        warmImage,
        hooks: builderHooks,
        copyToWorktree,
        verbose: VERBOSE,
        issueDetails: details,
        codemaps,
        trackerCommands: {
          COMMENT_TASK_COMMAND: tracker.COMMENT_TASK_COMMAND,
          LABEL_TASK_COMMAND: tracker.LABEL_TASK_COMMAND,
          CREATE_BUG_COMMAND: tracker.CREATE_BUG_COMMAND,
        },
      });

      log(`Phase 2 done. ${completedIssues.length} branch(es) with commits:`);
      for (const issue of completedIssues) {
        log(`  ${issue.branch}`);
      }

      if (completedIssues.length === 0) {
        log("No commits produced. Nothing to merge.");
        if (SINGLE_MODE) break;
        continue;
      }

      // Phase 3: Merge
      await mergeCompleted(completedIssues, {
        verbose: VERBOSE,
        closeTaskCommand: tracker.CLOSE_TASK_COMMAND,
        keepWorktree: KEEP_WORKTREE,
      });

      // Global T2 suite — post-merge
      log("Global T2 suite starting...");
      const t2result = await runGlobalT2({
        runner: createT2Runner(),
        tracker: createT2Tracker({
          searchCommand: SEARCH_BUGS_COMMAND,
          createBugCommand: tracker.CREATE_BUG_COMMAND,
          closeBugCommand: CLOSE_BUG_COMMAND,
          labelCommand: tracker.LABEL_TASK_COMMAND,
        }),
      });
      log(`Global T2 suite done. ${t2result.rounds} round(s), green=${t2result.green}.`);

      if (SINGLE_MODE) {
        log("Single mode: stopping after one issue.");
        break;
      }
    }
  }
} catch (e) {
  if (e instanceof CostCeilingExceededError) {
    // Spec line 1255: labeling already done in executeInParallel; halt pipeline
    log("⛔ Pipeline halted: cost ceiling exceeded.");
  } else {
    throw e;
  }
}

releaseLock(process.cwd());
log("All done.");
