// Replay fixer on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay/replay-fix.mts <issue-id> --gate visual|review [options]
//
// Options:
//   --gate <visual|review>    Which gate's findings to fix (required)
//   --model <model>           Agent model (default: claude-opus-4-8)
//   --max-iterations <n>      Iteration cap (default: 50)

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { log } from "../lib/logging.mjs";
import { positional, flag } from "../lib/cli.mjs";
import { expandAndSave } from "../lib/prompt.mjs";
import { buildWarmImage, createReplayHooks, getGuardBase } from "../lib/sandbox.mjs";

const issueId = positional();
const gate = flag("gate");
const model = flag("model") ?? "claude-opus-4-8";
const maxIterations = Number(flag("max-iterations") ?? 50);

if (!issueId || !gate || !["visual", "review"].includes(gate)) {
  console.error(
    "Usage: npx tsx .sandcastle/replay/replay-fix.mts <issue-id> --gate visual|review " +
      "[--model <model>] [--max-iterations <n>]",
  );
  process.exit(1);
}

const branch = `sandcastle/issue-${issueId}`;
const worktree = `.sandcastle/worktrees/sandcastle-issue-${issueId}`;

if (!existsSync(worktree)) {
  console.error(`Worktree not found: ${worktree}`);
  process.exit(1);
}

log(`Issue: ${issueId} | Branch: ${branch} | Gate: ${gate}`);

const headBefore = execSync(`git -C ${worktree} rev-parse HEAD`, { encoding: "utf8" }).trim();
log(`HEAD before: ${headBefore}`);

// Fetch issue details to compute test prefix
const details = execSync(`bd show ${issueId}`, { encoding: "utf8" }).trim();
const titleMatch = details.match(/·\s+(.+?)\s+\[/);
const testPrefix = (titleMatch ? titleMatch[1] : "").split(":")[0].trim();
log(`Test prefix: "${testPrefix}"`);

const findingsFile = gate === "visual" ? ".qa/visual.md" : ".qa/review.md";
const verifyCommand =
  gate === "visual"
    ? `npm run ui:qa -- --grep "${testPrefix}.*@visual"`
    : "npm run typecheck && npm run lint && npm run test";

const findingsPath = `${worktree}/${findingsFile}`;
if (!existsSync(findingsPath)) {
  console.error(`Findings file not found: ${findingsPath}. Run the QA gate first.`);
  process.exit(1);
}

log(`Findings preview: ${readFileSync(findingsPath, "utf8").trim().split("\n")[0]}`);

const promptArgs = { BRANCH: branch, TASK_ID: issueId, FINDINGS_FILE: findingsFile, VERIFY_COMMAND: verifyCommand };
const expandedPath = `.sandcastle/logs/${issueId}/fix-${gate}-replay.prompt.md`;
expandAndSave(".sandcastle/prompts/fixer.prompt.md", promptArgs, expandedPath);
log(`Expanded prompt saved: ${expandedPath}`);

const warmImage = buildWarmImage();
log(`Warm image ready: ${warmImage}`);

const guardBase = getGuardBase();
const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker({ imageName: warmImage, env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase } }),
  hooks: createReplayHooks(),
});

try {
  log(`Agent starting (model: ${model}, max iterations: ${maxIterations})...`);
  const start = Date.now();
  const result = await sandbox.run({
    prompt: readFileSync(expandedPath, "utf8"),
    agent: sandcastle.claudeCode(model),
    maxIterations,
    name: `${gate}-fixer`,
    logging: { type: "file", verbose: true, path: `.sandcastle/logs/${issueId}/fix-${gate}-replay.log` },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);
  if (result.completionSignal) log(`Completion signal: ${result.completionSignal}`);
  for (const commit of result.commits) log(`  Commit: ${commit.sha}`);

  if (existsSync(findingsPath)) {
    log(`WARNING: ${findingsFile} was NOT deleted by the agent`);
  } else {
    log(`${findingsFile} deleted (fix complete)`);
  }
} finally {
  await sandbox.close();
  log("Sandbox closed.");
  log(`To restore worktree: git -C ${worktree} reset --hard ${headBefore}`);
}

log("Fix replay done.");
