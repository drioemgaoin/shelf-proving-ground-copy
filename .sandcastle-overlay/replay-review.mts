// Replay code review on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay-review.mts <issue-id> [options]
//
// Options:
//   --model <model>          Agent model (default: claude-sonnet-4-6)
//   --max-iterations <n>     Iteration cap (default: 1)
//
// The script:
//   1. Derives the branch name from the issue ID
//   2. Fetches issue details via `bd show` for scope context
//   3. Expands review-prompt.md with BRANCH + BASE_BRANCH + ISSUE_DETAILS
//   4. Resets any prior .qa/review.md in the worktree
//   5. Runs the review agent in a Docker sandbox

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
    "Usage: npx tsx .sandcastle/replay-review.mts <issue-id> [--model <model>] [--max-iterations <n>]\n" +
    "       Example: npx tsx .sandcastle/replay-review.mts shelf-proving-ground-djk.1"
  );
  process.exit(1);
}

const model = flag("model") ?? "claude-sonnet-4-6";
const maxIterations = Number(flag("max-iterations") ?? 1);

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
const baseBranch = "main";
const worktree = `.sandcastle/worktrees/sandcastle-issue-${issueId}`;

if (!existsSync(worktree)) {
  console.error(`Worktree not found: ${worktree}`);
  console.error("Run the implementer first, or check the issue ID.");
  process.exit(1);
}

log(`Issue: ${issueId}`);
log(`Branch: ${branch}`);
log(`Base: ${baseBranch}`);
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
let prompt = readFileSync(".sandcastle/review-prompt.md", "utf8");

// Stage 1: substitute {{VAR}} placeholders
const promptArgs: Record<string, string> = {
  BRANCH: branch,
  BASE_BRANCH: baseBranch,
  ISSUE_DETAILS: issueDetails,
};
prompt = prompt.replace(
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
  (match, key) => (key in promptArgs ? promptArgs[key] : match),
);

// Stage 2: expand !`cmd` shell expressions
prompt = prompt.replace(/!`([^`]+)`/g, (_match, cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 30_000 }).trimEnd();
  } catch {
    return `<!-- shell expansion failed: ${cmd} -->`;
  }
});

// Save expanded prompt for inspection
const expandedPath = `.sandcastle/logs/${issueId}/review-replay.prompt.md`;
mkdirSync(dirname(expandedPath), { recursive: true });
writeFileSync(expandedPath, prompt);
log(`Expanded prompt saved: ${expandedPath}`);

// ---------------------------------------------------------------------------
// Reset prior QA output
// ---------------------------------------------------------------------------
const qaFile = `${worktree}/.qa/review.md`;
if (existsSync(qaFile)) {
  rmSync(qaFile);
  log("Cleared prior .qa/review.md");
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
    name: "reviewer",
    logging: {
      type: "file",
      verbose: true,
      path: `.sandcastle/logs/${issueId}/review-replay.log`,
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
    log(`Review result: ${firstLine}`);
    console.log("\n" + report);
  } else {
    log("WARNING: Agent did not write .qa/review.md");
  }
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Review replay done.");
