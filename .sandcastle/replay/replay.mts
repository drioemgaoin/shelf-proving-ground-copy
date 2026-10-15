// Replay a single sandcastle step from a saved (and optionally edited) prompt.
//
// Usage:
//   npx tsx .sandcastle/replay/replay.mts <prompt-file> --branch <branch> [options]
//
// Options:
//   --branch <name>          Branch to work on (required)
//   --model <model>          Agent model (default: claude-opus-4-8)
//   --max-iterations <n>     Iteration cap (default: 100)

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { readFileSync } from "fs";
import { log } from "../lib/logging.mjs";
import { positional, flag } from "../lib/cli.mjs";
import { buildWarmImage, createReplayHooks, getGuardBase } from "../lib/sandbox.mjs";

const promptFile = positional();
const branch = flag("branch");
const model = flag("model") ?? "claude-opus-4-8";
const maxIterations = Number(flag("max-iterations") ?? 100);

if (!promptFile || !branch) {
  console.error(
    "Usage: npx tsx .sandcastle/replay/replay.mts <prompt-file> --branch <branch> " +
      "[--model <model>] [--max-iterations <n>]",
  );
  process.exit(1);
}

const prompt = readFileSync(promptFile, "utf8");
log(`Replaying: ${promptFile}`);
log(`Branch: ${branch} | Model: ${model} | Max iterations: ${maxIterations}`);

const warmImage = buildWarmImage();
log(`Warm image ready: ${warmImage}`);

const guardBase = getGuardBase();
const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker({ imageName: warmImage, env: { UI_GUARD: "afk", UI_GUARD_BASE: guardBase } }),
  hooks: createReplayHooks(),
});

try {
  log("Agent starting...");
  const start = Date.now();
  const result = await sandbox.run({
    prompt,
    agent: sandcastle.claudeCode(model),
    maxIterations,
    name: "replay",
    logging: { type: "file", verbose: true, path: `.sandcastle/logs/replay-${Date.now()}.log` },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`Agent stopped after ${elapsed}s. ${result.commits.length} commit(s).`);
  if (result.completionSignal) log(`Completion signal: ${result.completionSignal}`);
  for (const commit of result.commits) log(`  Commit: ${commit.sha}`);
} finally {
  await sandbox.close();
  log("Sandbox closed.");
}

log("Replay done.");
