// The three orchestration phases as standalone functions.
//
// Phase 1 (Plan):    Analyze issues, select unblocked ones.
// Phase 2 (Execute): Implement + QA gates in parallel.
// Phase 3 (Merge):   Merge all branches, close issues.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { z } from "zod";
import { log } from "./logging.mjs";
import { expandAndSave } from "./prompt.mjs";
import { type SandboxHooks, getGuardBase } from "./sandbox.mjs";
import { timedRun, timedSandboxRun } from "./tagged-agent.mjs";
import { runGateLoop, type GateContext } from "./qa-gates.mjs";
import { createVisualGate, createReviewGate } from "./gates.mjs";
import {
  PLANNER,
  IMPLEMENTER,
  MERGER,
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
  hooks: SandboxHooks;
  verbose: boolean;
}

export async function planIteration(opts: PlanOptions): Promise<PlannedIssue[]> {
  log("Phase 1: Planner starting...");
  const plannerArgs = { READY_ISSUES: opts.readyIssues };
  expandAndSave(".sandcastle/prompts/plan.prompt.md", plannerArgs, promptPath("planner"));

  const plan = await timedRun<any>("Planner", PLANNER, {
    hooks: opts.hooks,
    sandbox: docker({ imageName: opts.warmImage }),
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

  // Return only issues that produced commits
  return settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        (entry.outcome as PromiseFulfilledResult<{ commits: unknown[] }>).value.commits.length > 0,
    )
    .map((entry) => entry.issue);
}

interface RunResult {
  commits: Array<{ sha: string }>;
  iterations: ReadonlyArray<unknown>;
}

async function executeIssue(
  issue: PlannedIssue,
  opts: ExecuteOptions,
): Promise<RunResult> {
  log(`  Creating sandbox for ${issue.id} (${issue.branch})...`);
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

    if (impl.commits.length > 0) {
      await runQAGates(issue, sandbox, opts);
    }

    return impl;
  } finally {
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
  const codingStandards = readFileSync(".sandcastle/CODING_STANDARDS.md", "utf8");
  const implArgs = {
    TASK_ID: issue.id,
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    ISSUE_DETAILS: opts.issueDetails.get(issue.id)!,
    CODEMAP: opts.codemaps.get(issue.id) ?? "",
    CODING_STANDARDS: codingStandards,
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
    maxIterations: 100,
    logging: loggingConfig("implementer", opts.verbose, issue.id),
    promptFile: "./.sandcastle/prompts/implementer.prompt.md",
    promptArgs: implArgs,
  });
}

async function runQAGates(
  issue: PlannedIssue,
  sandbox: sandcastle.Sandbox,
  opts: ExecuteOptions,
): Promise<void> {
  const worktree = `.sandcastle/worktrees/sandcastle-issue-${issue.id}`;
  const issueDetails = opts.issueDetails.get(issue.id)!;

  const ctx: GateContext = {
    issueId: issue.id,
    branch: issue.branch,
    worktree,
    sandbox,
    state: { reviewBase: "main", fixHistory: "" },
  };

  // Gates are a list — open for extension.
  // To add a new gate (a11y, perf), append to this array.
  const gates = [
    ...(issue.touchesUI
      ? [createVisualGate(issue.id, issue.branch, issueDetails)]
      : []),
    createReviewGate(issue.id, issue.branch, issueDetails),
  ];

  for (const gate of gates) {
    await runGateLoop(gate, ctx, opts.verbose);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Merge
// ---------------------------------------------------------------------------

export interface MergeOptions {
  warmImage: string;
  hooks: SandboxHooks;
  verbose: boolean;
  closeTaskCommand: string;
}

export async function mergeCompleted(
  completedIssues: PlannedIssue[],
  opts: MergeOptions,
): Promise<void> {
  log("Phase 3: Merger starting...");
  const mergerArgs = {
    BRANCHES: completedIssues.map((i) => `- ${i.branch}`).join("\n"),
    ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
    CLOSE_TASK_COMMAND: opts.closeTaskCommand,
  };
  expandAndSave(".sandcastle/prompts/merger.prompt.md", mergerArgs, promptPath("merger"));
  await timedRun("Merger", MERGER, {
    hooks: opts.hooks,
    sandbox: docker({ imageName: opts.warmImage }),
    name: "merger",
    maxIterations: 1,
    logging: loggingConfig("merger", opts.verbose),
    promptFile: "./.sandcastle/prompts/merger.prompt.md",
    promptArgs: mergerArgs,
  });
  log("Phase 3: Merger done. Branches merged.");
}
