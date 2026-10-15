// Replay code review on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay/replay-review.mts <issue-id> [options]
//
// Options:
//   --model <model>          Agent model (default: claude-sonnet-4-6)
//   --max-iterations <n>     Iteration cap (default: 1)

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import { log } from "../lib/logging.mjs";
import { positional, flag } from "../lib/cli.mjs";
import { expandAndSave } from "../lib/prompt.mjs";
import { buildWarmImage, createReplayHooks } from "../lib/sandbox.mjs";

const issueId = positional();
const model = flag("model") ?? "claude-sonnet-4-6";
const maxIterations = Number(flag("max-iterations") ?? 1);

if (!issueId) {
  console.error(
    "Usage: npx tsx .sandcastle/replay/replay-review.mts <issue-id> " +
      "[--model <model>] [--max-iterations <n>]",
  );
  process.exit(1);
}

const branch = `sandcastle/issue-${issueId}`;
const worktree = `.sandcastle/worktrees/sandcastle-issue-${issueId}`;

if (!existsSync(worktree)) {
  console.error(`Worktree not found: ${worktree}. Run the implementer first.`);
  process.exit(1);
}

log(`Issue: ${issueId} | Branch: ${branch} | Base: main`);

const issueDetails = execSync(`bd show ${issueId}`, { encoding: "utf8" }).trim();
const promptArgs = { BRANCH: branch, BASE_BRANCH: "main", ISSUE_DETAILS: issueDetails, FINDINGS_FILE: ".qa/review.md", FIX_HISTORY: "" };
const expandedPath = `.sandcastle/logs/${issueId}/review-replay.prompt.md`;
expandAndSave(".sandcastle/prompts/reviewer.prompt.md", promptArgs, expandedPath);
log(`Expanded prompt saved: ${expandedPath}`);

const qaFile = `${worktree}/.qa/review.md`;
if (existsSync(qaFile)) { rmSync(qaFile); log("Cleared prior .qa/review.md"); }

const warmImage = buildWarmImage();
log(`Warm image ready: ${warmImage}`);

const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker({ imageName: warmImage }),
  hooks: createReplayHooks(),
});

try {
  log(`Agent starting (model: ${model}, max iterations: ${maxIterations})...`);
  const start = Date.now();
  const result = await sandbox.run({
    prompt: readFileSync(expandedPath, "utf8"),
    agent: sandcastle.claudeCode(model),
    maxIterations,
    name: "reviewer",
    logging: { type: "file", verbose: true, path: `.sandcastle/logs/${issueId}/review-replay.log` },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);
  if (result.completionSignal) log(`Completion signal: ${result.completionSignal}`);

  if (existsSync(qaFile)) {
    const report = readFileSync(qaFile, "utf8");
    log(`Review result: ${report.trim().split("\n")[0]!}`);
    console.log("\n" + report);
  } else {
    log("WARNING: Agent did not write .qa/review.md");
  }
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Review replay done.");
