// Replay visual QA on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay-visual-qa.mts <issue-id> [options]
//
// Options:
//   --model <model>          Agent model (default: claude-sonnet-4-6)
//   --max-iterations <n>     Iteration cap (default: 10)
//
// The script:
//   1. Derives the branch name from the issue ID
//   2. Fetches issue details via `bd show` for scope context
//   3. Expands visual-qa-prompt.md with BRANCH + ISSUE_DETAILS
//   4. Resets any prior .qa/visual.md in the worktree
//   5. Runs the visual QA agent in a Docker sandbox

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const issueId = args.find((a) => !a.startsWith("--"));

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

if (!issueId) {
  console.error(
    "Usage: npx tsx .sandcastle/replay-visual-qa.mts <issue-id> [--model <model>] [--max-iterations <n>]\n" +
    "       Example: npx tsx .sandcastle/replay-visual-qa.mts shelf-proving-ground-djk.1"
  );
  process.exit(1);
}

const model = flag("model") ?? "claude-sonnet-4-6";
const maxIterations = Number(flag("max-iterations") ?? 10);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Derive branch + issue details
// ---------------------------------------------------------------------------
const branch = `sandcastle/issue-${issueId}`;
const worktree = `.sandcastle/worktrees/sandcastle-issue-${issueId}`;

if (!existsSync(worktree)) {
  console.error(`Worktree not found: ${worktree}`);
  console.error("Run the implementer first, or check the issue ID.");
  process.exit(1);
}

log(`Issue: ${issueId}`);
log(`Branch: ${branch}`);
log(`Worktree: ${worktree}`);

// Fetch issue details for scope context
let issueDetails: string;
try {
  issueDetails = execSync(`bd show ${issueId}`, { encoding: "utf8" }).trim();
} catch {
  console.error(`Failed to fetch issue details: bd show ${issueId}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Expand prompt
// ---------------------------------------------------------------------------
const promptTemplate = readFileSync(".sandcastle/visual-qa-prompt.md", "utf8");
const prompt = promptTemplate
  .replace(/\{\{\s*BRANCH\s*\}\}/g, branch)
  .replace(/\{\{\s*ISSUE_DETAILS\s*\}\}/g, issueDetails);

// Save expanded prompt for inspection
const expandedPath = `.sandcastle/logs/${issueId}/visual-qa-replay.prompt.md`;
mkdirSync(dirname(expandedPath), { recursive: true });
writeFileSync(expandedPath, prompt);
log(`Expanded prompt saved: ${expandedPath}`);

// ---------------------------------------------------------------------------
// Reset prior QA output
// ---------------------------------------------------------------------------
const qaFile = `${worktree}/.qa/visual.md`;
if (existsSync(qaFile)) {
  rmSync(qaFile);
  log("Cleared prior .qa/visual.md");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
log("Building warm image...");
const warmImage = execSync("bash .sandcastle/build-warm.sh")
  .toString()
  .trim()
  .split("\n")
  .pop()!;
log(`Warm image ready: ${warmImage}`);

const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: "rm -rf ./node_modules && ln -s /warm/node_modules ./node_modules" },
      { command: "cp -a /warm/.beads ./.beads && chmod 700 .beads && bd init --reinit-local --non-interactive -q 2>/dev/null; true" },
      { command: "node .claude/hooks/backpressure.mjs --baseline" },
    ],
  },
};

const agent = sandcastle.claudeCode(model);

// No UI_GUARD — the backpressure hook is for the implementer, not the QA agent.
// The QA agent only reads and reports; it doesn't edit code.
log("Creating sandbox...");
const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker({ imageName: warmImage }),
  hooks,
});

try {
  log(`Agent starting (model: ${model}, max iterations: ${maxIterations})...`);
  const start = Date.now();
  const result = await sandbox.run({
    prompt,
    agent,
    maxIterations,
    name: "visual-qa",
    logging: {
      type: "file",
      verbose: true,
      path: `.sandcastle/logs/${issueId}/visual-qa-replay.log`,
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);

  if (result.completionSignal) {
    log(`Completion signal: ${result.completionSignal}`);
  }

  // Check the result
  if (existsSync(qaFile)) {
    const report = readFileSync(qaFile, "utf8");
    const firstLine = report.trim().split("\n")[0]!;
    log(`QA result: ${firstLine}`);
    console.log("\n" + report);
  } else {
    log("WARNING: Agent did not write .qa/visual.md");
  }
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Visual QA replay done.");
