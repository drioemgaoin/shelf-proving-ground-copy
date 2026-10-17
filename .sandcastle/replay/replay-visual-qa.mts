// Replay visual QA on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay/replay-visual-qa.mts <issue-id> [options]
//
// Options:
//   --model <model>          Agent model (default: claude-sonnet-4-6)
//   --max-iterations <n>     Iteration cap (default: 10)

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import { log } from "../lib/logging.mjs";
import { positional, flag } from "../lib/cli.mjs";
import { expandPrompt, expandAndSave } from "../lib/prompt.mjs";
import { distillIssueDetails, distillBeads } from "../lib/distill.mjs";
import { buildWarmImage, createReplayHooks } from "../lib/sandbox.mjs";

const issueId = positional();
const model = flag("model") ?? "claude-sonnet-4-6";
const maxIterations = Number(flag("max-iterations") ?? 10);

if (!issueId) {
  console.error(
    "Usage: npx tsx .sandcastle/replay/replay-visual-qa.mts <issue-id> " +
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

log(`Issue: ${issueId} | Branch: ${branch} | Worktree: ${worktree}`);

const issueDetails = distillIssueDetails(
  execSync(`bd show ${issueId}`, { encoding: "utf8" }).trim(),
  distillBeads,
);
const promptArgs = { BRANCH: branch, ISSUE_DETAILS: issueDetails, FINDINGS_FILE: ".qa/visual.md" };
const expandedPath = `.sandcastle/logs/${issueId}/visual-qa-replay.prompt.md`;
expandAndSave(".sandcastle/prompts/visual-qa.prompt.md", promptArgs, expandedPath);
log(`Expanded prompt saved: ${expandedPath}`);

const qaFile = `${worktree}/.qa/visual.md`;
if (existsSync(qaFile)) { rmSync(qaFile); log("Cleared prior .qa/visual.md"); }

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
    name: "visual-qa",
    logging: { type: "file", verbose: true, path: `.sandcastle/logs/${issueId}/visual-qa-replay.log` },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);
  if (result.completionSignal) log(`Completion signal: ${result.completionSignal}`);

  if (existsSync(qaFile)) {
    const report = readFileSync(qaFile, "utf8");
    log(`QA result: ${report.trim().split("\n")[0]!}`);
    console.log("\n" + report);
  } else {
    log("WARNING: Agent did not write .qa/visual.md");
  }
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Visual QA replay done.");
