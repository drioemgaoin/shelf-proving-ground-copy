#!/usr/bin/env node
// Patches the stock parallel-planner main.mts for this project:
//
// 1. Adds `.beads/embeddeddolt` to copyToWorktree (beads Docker portability)
// 2. Adds `chmod 700 .beads` and `bd bootstrap` to onSandboxReady hooks
// 3. Adds a review phase between implement and merge (like Pocock's flow)
// 4. Switches execute phase to use createSandbox so implementer and reviewer
//    share the same sandbox/branch
// 5. Passes UI_GUARD=afk env to implementer and reviewer so guard +
//    backpressure hooks activate inside the sandbox
//
// Idempotent — safe to run multiple times.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = ".sandcastle/main.mts";
let src = readFileSync(FILE, "utf8");

// 1. copyToWorktree: add .beads/embeddeddolt if missing
if (!src.includes(".beads/embeddeddolt")) {
  src = src.replace(
    /copyToWorktree\s*=\s*\["node_modules"\]/,
    'copyToWorktree = ["node_modules", ".beads/embeddeddolt"]'
  );
}

// 2. onSandboxReady hooks: add chmod + bd bootstrap before npm install
if (!src.includes("bd bootstrap")) {
  src = src.replace(
    /onSandboxReady:\s*\[\s*\{\s*command:\s*"npm install"\s*\}\s*\]/,
    `onSandboxReady: [
      { command: "chmod 700 .beads" },
      { command: "bd bootstrap --yes -q" },
      { command: "npm install" },
    ]`
  );
}

// 3. Add review phase: replace the execute phase's sandcastle.run() with
//    createSandbox() so implement + review share the same sandbox.
//    Only apply if review-prompt.md reference is not already present.
if (!src.includes("review-prompt.md")) {
  // Replace the execute block (Promise.allSettled with sandcastle.run per issue)
  // with createSandbox + implement + review per issue
  src = src.replace(
    /\/\/ -{60,}\n\s*\/\/ Phase 2: Execute[\s\S]*?Promise\.allSettled\(\n\s*issues\.map\(\(issue\) =>\n\s*sandcastle\.run\(\{[\s\S]*?\}\),?\n\s*\),?\n\s*\);/,
    `// -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a persistent sandbox so both the implementer
  // and reviewer work on the same branch. The implementer writes code,
  // then the reviewer checks it — matching Pocock's flow.
  //
  // Promise.allSettled means one failing agent doesn't cancel the others.
  // -------------------------------------------------------------------------
  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker(),
        hooks,
        copyToWorktree,
      });

      try {
        // Implement
        const impl = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-opus-4-8"),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });

        // Review (only if implementer made commits)
        if (impl.commits.length > 0) {
          await sandbox.run({
            name: "reviewer",
            maxIterations: 1,
            agent: sandcastle.claudeCode("claude-opus-4-8"),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BRANCH: issue.branch,
            },
          });
        }

        return impl;
      } finally {
        await sandbox.close();
      }
    }),
  );`
  );
}

// 5. Pass UI_GUARD=afk to implementer and reviewer so guard + backpressure
//    hooks activate inside the sandbox. NOT applied to planner or merger.
if (!src.includes("UI_GUARD")) {
  src = src.replace(
    /claudeCode\("claude-opus-4-8"\),\n(\s*)promptFile: "\.\/\.sandcastle\/implement-prompt\.md"/,
    'claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),\n$1promptFile: "./.sandcastle/implement-prompt.md"'
  );
  src = src.replace(
    /claudeCode\("claude-opus-4-8"\),\n(\s*)promptFile: "\.\/\.sandcastle\/review-prompt\.md"/,
    'claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),\n$1promptFile: "./.sandcastle/review-prompt.md"'
  );
}

writeFileSync(FILE, src);
console.log(`Patched ${FILE} for beads+Docker, review phase, and UI guard env.`);
