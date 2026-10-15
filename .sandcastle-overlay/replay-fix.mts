// Replay fixer on an existing sandcastle branch.
//
// Usage:
//   npx tsx .sandcastle/replay-fix.mts <issue-id> --gate visual|review [options]
//
// Options:
//   --gate <visual|review>    Which gate's findings to fix (required)
//   --model <model>           Agent model (default: claude-opus-4-8)
//   --max-iterations <n>      Iteration cap (default: 50)
//
// The script:
//   1. Derives the branch name from the issue ID
//   2. Fetches issue details to compute the test prefix
//   3. Expands fix-prompt.md with FINDINGS_FILE + VERIFY_COMMAND
//   4. Saves current HEAD so the worktree can be restored after
//   5. Runs the fixer agent in a Docker sandbox

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
    "Usage: npx tsx .sandcastle/replay-fix.mts <issue-id> --gate visual|review [--model <model>] [--max-iterations <n>]",
  );
  process.exit(1);
}

const gate = flag("gate");
if (!gate || !["visual", "review"].includes(gate)) {
  console.error("Error: --gate is required (visual or review)");
  process.exit(1);
}

const model = flag("model") ?? "claude-opus-4-8";
const maxIterations = Number(flag("max-iterations") ?? 50);

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
  process.exit(1);
}

log(`Issue: ${issueId}`);
log(`Branch: ${branch}`);
log(`Gate: ${gate}`);
log(`Worktree: ${worktree}`);

// Save current HEAD for restore instructions
const headBefore = execSync(`git -C ${worktree} rev-parse HEAD`, { encoding: "utf8" }).trim();
log(`HEAD before: ${headBefore}`);

// Fetch issue details to compute test prefix
let issueTitle: string;
try {
  const details = execSync(`bd show ${issueId}`, { encoding: "utf8" }).trim();
  // Extract title from the first line: "○ id · Title   [P2 · OPEN]"
  const match = details.match(/·\s+(.+?)\s+\[/);
  issueTitle = match ? match[1] : "";
} catch {
  console.error(`Failed to fetch issue details: bd show ${issueId}`);
  process.exit(1);
}

const testPrefix = issueTitle.split(":")[0].trim();
log(`Test prefix: "${testPrefix}"`);

// Build gate-specific args
const findingsFile = gate === "visual" ? ".qa/visual.md" : ".qa/review.md";
const verifyCommand =
  gate === "visual"
    ? `npm run ui:qa -- --grep "${testPrefix}.*@visual"`
    : "npm run typecheck && npm run lint && npm run test";

log(`Findings file: ${findingsFile}`);
log(`Verify command: ${verifyCommand}`);

// Check that findings file exists in worktree
const findingsPath = `${worktree}/${findingsFile}`;
if (!existsSync(findingsPath)) {
  console.error(`Findings file not found: ${findingsPath}`);
  console.error("Run the corresponding QA gate first.");
  process.exit(1);
}

log(`Findings preview: ${readFileSync(findingsPath, "utf8").trim().split("\n")[0]}`);

// ---------------------------------------------------------------------------
// Expand prompt
// ---------------------------------------------------------------------------
let prompt = readFileSync(".sandcastle/prompts/fixer.prompt.md", "utf8");

const promptArgs: Record<string, string> = {
  BRANCH: branch,
  TASK_ID: issueId,
  FINDINGS_FILE: findingsFile,
  VERIFY_COMMAND: verifyCommand,
};
prompt = prompt.replace(
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
  (match, key) => (key in promptArgs ? promptArgs[key] : match),
);

const expandedPath = `.sandcastle/logs/${issueId}/fix-${gate}-replay.prompt.md`;
mkdirSync(dirname(expandedPath), { recursive: true });
writeFileSync(expandedPath, prompt);
log(`Expanded prompt saved: ${expandedPath}`);

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

const guardBase = execSync("git merge-base HEAD main", { encoding: "utf8" }).trim();

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
  sandbox: docker({ imageName: warmImage, env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase } }),
  hooks,
});

try {
  log(`Agent starting (model: ${model}, max iterations: ${maxIterations})...`);
  const start = Date.now();
  const result = await sandbox.run({
    prompt,
    agent,
    maxIterations,
    name: `${gate}-fixer`,
    logging: {
      type: "file",
      verbose: true,
      path: `.sandcastle/logs/${issueId}/fix-${gate}-replay.log`,
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);

  if (result.completionSignal) {
    log(`Completion signal: ${result.completionSignal}`);
  }

  for (const commit of result.commits) {
    log(`  Commit: ${commit.sha}`);
  }

  // Check if findings file was deleted (step 6 of fix prompt)
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
