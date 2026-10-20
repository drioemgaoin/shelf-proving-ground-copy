// The three orchestration phases as standalone functions.
//
// Phase 1 (Plan):    Analyze issues, select unblocked ones.
// Phase 2 (Execute): Implement + QA gates in parallel.
// Phase 3 (Merge):   Merge all branches, close issues.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { z } from "zod";
import { log } from "./logging.mjs";
import { expandAndSave } from "./prompt.mjs";
import { type SandboxHooks, getGuardBase, setRulesVisible } from "./sandbox.mjs";
import { timedRun, timedSandboxRun, CostCeilingExceededError } from "./tagged-agent.mjs";
import { runGateLoop, escalate, type GateContext } from "./qa-gates.mjs";
import { createVisualGate, createReviewGate } from "./gates.mjs";
import { collectMonitorData } from "./monitor-collect.mjs";
import { loadViolationsMemory, recordViolation } from "./violations-memory.mjs";
import {
  PLANNER,
  IMPLEMENTER,
} from "../config/agents.mjs";
import {
  VIEW_TASK_COMMAND,
  COMMENT_TASK_COMMAND,
  LABEL_TASK_COMMAND,
  CREATE_BUG_COMMAND,
  CLOSE_TASK_COMMAND,
} from "../config/tracker.mjs";
import type { TicketFile } from "./tickets.mjs";

// ---------------------------------------------------------------------------
// Plan schema
// ---------------------------------------------------------------------------

const planSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      branch: z.string(),
      touchesUI: z.boolean(),
      scope: z.string().default("src/**"),
    }),
  ),
});

export type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function logPath(name: string, issueId?: string): string {
  return issueId
    ? `.sandcastle/logs/${issueId}/${name}.log`
    : `.sandcastle/logs/${name}.log`;
}

function promptPath(name: string, issueId?: string): string {
  return issueId
    ? `.sandcastle/logs/${issueId}/${name}.prompt.md`
    : `.sandcastle/logs/${name}.prompt.md`;
}

function loggingConfig(name: string, verbose: boolean, issueId?: string) {
  if (!verbose) return undefined;
  return { type: "file" as const, verbose: true, path: logPath(name, issueId) };
}

// ---------------------------------------------------------------------------
// Phase 1: Plan
// ---------------------------------------------------------------------------

export interface PlanOptions {
  readyIssues: string;
  warmImage: string;
  verbose: boolean;
}

export async function planIteration(opts: PlanOptions): Promise<PlannedIssue[]> {
  log("Phase 1: Planner starting...");
  const plannerArgs = { READY_ISSUES: opts.readyIssues };
  expandAndSave(".sandcastle/prompts/plan.prompt.md", plannerArgs, promptPath("planner"));

  const plan = await timedRun<any>("Planner", PLANNER, {
    sandbox: docker({ imageName: opts.warmImage }),
    branchStrategy: { type: "head" },
    name: "planner",
    maxIterations: 1,
    logging: loggingConfig("planner", opts.verbose),
    promptFile: "./.sandcastle/prompts/plan.prompt.md",
    promptArgs: plannerArgs,
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  return (plan.output as { issues: PlannedIssue[] }).issues;
}

// ---------------------------------------------------------------------------
// Phase 2: Execute + QA Gates
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  warmImage: string;
  hooks: SandboxHooks;
  copyToWorktree: string[];
  verbose: boolean;
  /** Pre-fetched issue details keyed by issue ID. */
  issueDetails: Map<string, string>;
  /** Pre-generated codemaps keyed by issue ID. */
  codemaps: Map<string, string>;
  /** Tracker command overrides (for --tickets mode). */
  trackerCommands?: {
    COMMENT_TASK_COMMAND: string;
    LABEL_TASK_COMMAND: string;
    CREATE_BUG_COMMAND: string;
  };
}

export async function executeInParallel(
  issues: PlannedIssue[],
  opts: ExecuteOptions,
): Promise<PlannedIssue[]> {
  log("Phase 2: Execute + QA Gates starting...");

  const commentCmd = opts.trackerCommands?.COMMENT_TASK_COMMAND ?? COMMENT_TASK_COMMAND;
  const labelCmd = opts.trackerCommands?.LABEL_TASK_COMMAND ?? LABEL_TASK_COMMAND;
  const bugCmd = opts.trackerCommands?.CREATE_BUG_COMMAND ?? CREATE_BUG_COMMAND;

  const settled = await Promise.allSettled(
    issues.map((issue) =>
      executeIssue(issue, {
        ...opts,
        trackerCommands: {
          COMMENT_TASK_COMMAND: commentCmd,
          LABEL_TASK_COMMAND: labelCmd,
          CREATE_BUG_COMMAND: bugCmd,
        },
      }),
    ),
  );

  // Log failures
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      log(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
    }
  }

  // Spec line 1255: "Cumulative LLM spend ≥ cost ceiling → pipeline-budget-exceeded:
  // Full pipeline halt, label all in-flight tickets"
  const budgetHit = settled.some(
    (s) => s.status === "rejected" && s.reason instanceof CostCeilingExceededError,
  );
  if (budgetHit) {
    log("  ⛔ Cost ceiling exceeded — labeling all in-flight tickets.");
    for (const issue of issues) {
      try {
        const cmd = labelCmd.replace("<ID>", issue.id).replace("ready-for-human", "pipeline-budget-exceeded");
        execSync(cmd, { encoding: "utf8" });
      } catch {
        log(`  ⚠️  Failed to label ${issue.id} with pipeline-budget-exceeded`);
      }
    }
    throw new CostCeilingExceededError(0, 0); // re-throw to halt the pipeline
  }

  // Return only issues that produced commits and were not escalated
  return settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        (entry.outcome as PromiseFulfilledResult<RunResult>).value.commits.length > 0 &&
        !(entry.outcome as PromiseFulfilledResult<RunResult>).value.escalated,
    )
    .map((entry) => entry.issue);
}

interface RunResult {
  commits: Array<{ sha: string }>;
  iterations: ReadonlyArray<unknown>;
  escalated: boolean;
}

async function executeIssue(
  issue: PlannedIssue,
  opts: ExecuteOptions,
): Promise<RunResult> {
  log(`  Creating sandbox for ${issue.id} (${issue.branch})...`);
  const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;
  const guardBase = getGuardBase();
  const sandbox = await sandcastle.createSandbox({
    branch: issue.branch,
    sandbox: docker({
      imageName: opts.warmImage,
      env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase },
    }),
    hooks: opts.hooks,
    copyToWorktree: opts.copyToWorktree,
  });

  try {
    const impl = await runImplementer(issue, sandbox, opts);
    log(`  Implementer done for ${issue.id}. ${impl.commits.length} commit(s).`);

    // Spec line 1118: "Exhaustion: 100 iterations → escalate
    // implementer-exhaustion. Do NOT proceed to gates."
    if (impl.iterations.length >= IMPLEMENTER_MAX_ITERATIONS) {
      log(`  ⚠️  Implementer exhausted for ${issue.id} (${impl.iterations.length} iterations). Escalating.`);
      escalate(issue.id, "implementer-exhaustion");
      return { ...impl, escalated: true };
    }

    let escalated = false;
    if (impl.commits.length > 0) {
      escalated = await runQAGates(issue, sandbox, opts);
    }

    return { ...impl, escalated };
  } finally {
    collectMonitorData(worktree, issue.id);
    await sandbox.close();
    log(`  Sandbox closed for ${issue.id}.`);
  }
}

async function runImplementer(
  issue: PlannedIssue,
  sandbox: sandcastle.Sandbox,
  opts: ExecuteOptions,
): Promise<RunResult> {
  log(`  Sandbox ready for ${issue.id}. Implementer starting...`);
  const implArgs = {
    TASK_ID: issue.id,
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    ISSUE_DETAILS: opts.issueDetails.get(issue.id)!,
    CODEMAP: opts.codemaps.get(issue.id) ?? "",
    // VIOLATIONS_MEMORY: loadViolationsMemory(), // temporarily disabled for testing
    VIOLATIONS_MEMORY: "",
    COMMENT_TASK_COMMAND: opts.trackerCommands!.COMMENT_TASK_COMMAND.replace("<ID>", issue.id),
    LABEL_TASK_COMMAND: opts.trackerCommands!.LABEL_TASK_COMMAND.replace("<ID>", issue.id),
    CREATE_BUG_COMMAND: opts.trackerCommands!.CREATE_BUG_COMMAND,
  };
  expandAndSave(
    ".sandcastle/prompts/implementer.prompt.md",
    implArgs,
    promptPath("implementer", issue.id),
  );
  return timedSandboxRun(`Implementer [${issue.id}]`, IMPLEMENTER, sandbox, {
    name: "implementer",
    maxIterations: IMPLEMENTER_MAX_ITERATIONS,
    logging: loggingConfig("implementer", opts.verbose, issue.id),
    promptFile: "./.sandcastle/prompts/implementer.prompt.md",
    promptArgs: implArgs,
  });
}

const IMPLEMENTER_MAX_ITERATIONS = 100;

async function runQAGates(
  issue: PlannedIssue,
  sandbox: sandcastle.Sandbox,
  opts: ExecuteOptions,
): Promise<boolean> {
  const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;
  const issueDetails = opts.issueDetails.get(issue.id)!;

  const ctx: GateContext = {
    issueId: issue.id,
    branch: issue.branch,
    worktree,
    sandbox,
    state: { reviewBase: "main", fixHistory: "" },
  };

  // Generate T3 payloads before gates run (spec: prompt expansion Stage 3).
  // apply-t3.mjs writes payloads to .sandcastle/payloads/{issueId}/ which
  // expandAndSave reads via the ticketId option during Stage 3 injection.
  const diffRef = `main...${issue.branch}`;
  try {
    execSync(`node scripts/apply-t3.mjs ${issue.id} ${diffRef}`, {
      encoding: "utf8",
      timeout: 60_000,
    });
    log(`  T3 payloads generated for ${issue.id}.`);
  } catch (e: any) {
    const exitCode = e.status ?? 2;
    if (exitCode === 1) {
      // Budget exceeded — escalate and abort gates
      log(`  T3 budget exceeded for ${issue.id}. Escalating.`);
      escalate(issue.id, "rule-budget-exceeded");
      return true;
    }
    // Exit 2 = infra failure — warn but continue (fail-open for T3)
    log(`  ⚠️  apply-t3 failed for ${issue.id} (exit ${exitCode}), continuing without T3 rules.`);
  }

  // Gates are a list — open for extension.
  // To add a new gate (a11y, perf), append to this array.
  const gates = [
    ...(issue.touchesUI
      ? [createVisualGate(issue.id, issue.branch, issueDetails)]
      : []),
    createReviewGate(issue.id, issue.branch, issueDetails),
  ];

  for (const gate of gates) {
    const escalated = await runGateLoop(gate, ctx, opts.verbose);
    if (escalated) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Resume: re-run QA gates on existing worktrees (skips plan + implement)
// ---------------------------------------------------------------------------

export interface ResumeOptions {
  warmImage: string;
  hooks: SandboxHooks;
  copyToWorktree: string[];
  verbose: boolean;
  issueDetails: Map<string, string>;
  trackerCommands: {
    COMMENT_TASK_COMMAND: string;
    LABEL_TASK_COMMAND: string;
    CREATE_BUG_COMMAND: string;
  };
}

export async function resumeQAGates(
  issues: PlannedIssue[],
  opts: ResumeOptions,
): Promise<PlannedIssue[]> {
  log("Resume: re-running QA gates on existing branches...");

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;
      const guardBase = getGuardBase();

      log(`  Re-creating sandbox for ${issue.id} (${issue.branch})...`);
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker({
          imageName: opts.warmImage,
          env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase },
        }),
        hooks: opts.hooks,
        copyToWorktree: opts.copyToWorktree,
      });

      try {
        // runQAGates expects ExecuteOptions but only reads issueDetails,
        // verbose, and trackerCommands.  Provide the missing fields as stubs.
        const executeOpts: ExecuteOptions = {
          warmImage: opts.warmImage,
          hooks: opts.hooks,
          copyToWorktree: opts.copyToWorktree,
          verbose: opts.verbose,
          issueDetails: opts.issueDetails,
          codemaps: new Map(),
          trackerCommands: opts.trackerCommands,
        };
        const escalated = await runQAGates(issue, sandbox, executeOpts);
        return { escalated };
      } finally {
        collectMonitorData(worktree, issue.id);
        await sandbox.close();
        log(`  Sandbox closed for ${issue.id}.`);
      }
    }),
  );

  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      log(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
    }
  }

  return settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        !(entry.outcome as PromiseFulfilledResult<{ escalated: boolean }>).value.escalated,
    )
    .map((entry) => entry.issue);
}

// ---------------------------------------------------------------------------
// Phase 3: Merge — push branches, create PRs, merge on GitHub
// ---------------------------------------------------------------------------

export interface MergeOptions {
  verbose: boolean;
  closeTaskCommand: string;
  keepWorktree?: boolean;
}

export async function mergeCompleted(
  completedIssues: PlannedIssue[],
  opts: MergeOptions,
): Promise<void> {
  log("Phase 3: Push + PR + merge starting...");

  for (const issue of completedIssues) {
    const { id, branch, title } = issue;

    // Remove the worktree so git can delete the local branch during merge.
    // --keep-worktree preserves it for post-run inspection (reset cleans it).
    const worktree = `.sandcastle/worktrees/sandcastle-issue-${id}`;
    if (existsSync(worktree) && !opts.keepWorktree) {
      try {
        execSync(`git worktree remove --force ${worktree}`, {
          encoding: "utf8",
          timeout: 30_000,
        });
      } catch {
        // Force-remove the directory and prune if git worktree remove fails
        rmSync(worktree, { recursive: true, force: true });
        execSync("git worktree prune", { encoding: "utf8", timeout: 10_000 });
      }
    }

    // Push the validated branch to the remote
    log(`  Pushing ${branch}...`);
    execSync(`git push origin ${branch} --force-with-lease`, {
      encoding: "utf8",
      timeout: 120_000,
    });

    // Create a PR and merge it
    log(`  Creating PR for ${id}: ${title}...`);
    const prBody = `Sandcastle build for ${id}: ${title}.\n\nAutomated implementation + QA (visual + code review).`;
    const prUrl = execSync(
      `gh pr create --base main --head ${branch} ` +
      `--title ${JSON.stringify(`${id}: ${title}`)} ` +
      `--body ${JSON.stringify(prBody)}`,
      { encoding: "utf8", timeout: 60_000 },
    ).trim();
    log(`  PR created: ${prUrl}`);

    log(`  Merging PR for ${id}...`);
    const deleteBranch = opts.keepWorktree ? "" : " --delete-branch";
    execSync(`gh pr merge ${branch} --merge${deleteBranch}`, {
      encoding: "utf8",
      timeout: 120_000,
    });
    log(`  PR merged for ${id}.`);

    // Close the tracker issue
    try {
      execSync(opts.closeTaskCommand.replace("<ID>", id), {
        encoding: "utf8",
        timeout: 30_000,
      });
      log(`  Issue ${id} closed.`);
    } catch (e) {
      log(`  ⚠️  Failed to close issue ${id}: ${e}`);
    }
  }

  // Pull merged changes so local main stays current
  execSync("git pull --ff-only origin main", {
    encoding: "utf8",
    timeout: 60_000,
  });

  log(`Phase 3: ${completedIssues.length} branch(es) merged via PR.`);
}
