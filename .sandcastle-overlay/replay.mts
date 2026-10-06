// Replay a single sandcastle step from a saved (and optionally edited) prompt.
//
// Usage:
//   npx tsx .sandcastle/replay.mts <prompt-file> --branch <branch> [options]
//
// Options:
//   --branch <name>          Branch to work on (required)
//   --model <model>          Agent model (default: claude-opus-4-8)
//   --max-iterations <n>     Iteration cap (default: 100)
//
// The prompt file should be an already-expanded .prompt.md from a prior run.
// It's passed as an inline string — no {{VAR}} or !`cmd` expansion happens.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "child_process";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const promptFile = args.find((a) => !a.startsWith("--"));

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

if (!promptFile) {
  console.error("Usage: npx tsx .sandcastle/replay.mts <prompt-file> --branch <branch> [--model <model>] [--max-iterations <n>]");
  process.exit(1);
}

const branch = flag("branch");
if (!branch) {
  console.error("Error: --branch is required");
  process.exit(1);
}

const model = flag("model") ?? "claude-opus-4-8";
const maxIterations = Number(flag("max-iterations") ?? 100);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const prompt = readFileSync(promptFile, "utf8");

log(`Replaying: ${promptFile}`);
log(`Branch: ${branch} | Model: ${model} | Max iterations: ${maxIterations}`);

// Build warm image (same as main.mts)
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

// Compute the merge-base on the host so the backpressure hook inside Docker
// uses the correct starting commit (origin/main inside the warm image can be stale).
const guardBase = execSync(`git merge-base HEAD main`, { encoding: "utf8" }).trim();
log("Creating sandbox...");
const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker({ imageName: warmImage, env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase } }),
  hooks,
});

try {
  log("Agent starting...");
  const start = Date.now();
  const result = await sandbox.run({
    prompt,
    agent,
    maxIterations,
    name: "replay",
    logging: {
      type: "file",
      verbose: true,
      path: `.sandcastle/logs/replay-${Date.now()}.log`,
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
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Replay done.");
