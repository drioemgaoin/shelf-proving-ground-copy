#!/usr/bin/env node
// Patches the stock parallel-planner main.mts for this project:
//
// 1. Adds `import { execSync }` for warm-image resolution
// 2. Replaces copyToWorktree + onSandboxReady with warm-image pattern
//    (pre-baked node_modules + .beads in Docker image → 2-3s cold start)
// 3. Adds a review phase between implement and merge (like Pocock's flow)
// 4. Switches execute phase to use createSandbox so implementer and reviewer
//    share the same sandbox/branch
// 5. Passes UI_GUARD=afk env to implementer and reviewer so guard +
//    backpressure hooks activate inside the sandbox
// 6. Replaces all docker() calls with docker({ imageName: warmImage })
//
// Idempotent — safe to run multiple times.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = ".sandcastle/main.mts";
let src = readFileSync(FILE, "utf8");

// 1. Add execSync import if missing
if (!src.includes("execSync")) {
  src = src.replace(
    /import { docker } from "@ai-hero\/sandcastle\/sandboxes\/docker";/,
    'import { docker } from "@ai-hero/sandcastle/sandboxes/docker";\nimport { execSync } from "child_process";'
  );
}

// 2. Replace copyToWorktree + onSandboxReady with warm-image pattern.
//    Handles both the stock template and previously-patched versions.
if (!src.includes("warmImage")) {
  // Replace the config section between MAX_ITERATIONS and the main loop.
  // Match from after MAX_ITERATIONS line through copyToWorktree declaration.
  src = src.replace(
    /\/\/ Hooks run inside[\s\S]*?const copyToWorktree\s*=\s*\[.*?\];/,
    `// ── Warm image: pre-baked deps so containers start in 2-3s ───
// build-warm.sh is idempotent — rebuilds only when deps/beads change.
const warmImage = execSync("bash .sandcastle/build-warm.sh")
  .toString()
  .trim()
  .split("\\n")
  .pop()!;

// Lightweight hooks — node_modules and .beads are already in the image.
// Symlink keeps heavy reads off the bind-mount (fast on macOS VirtioFS).
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: "ln -s /warm/node_modules ./node_modules" },
      { command: "cp -a /warm/.beads ./.beads && chmod 700 .beads" },
      { command: "node .claude/hooks/backpressure.mjs --baseline" },
    ],
  },
};

// Nothing to copy — everything is baked into the warm image.
const copyToWorktree: string[] = [];`
  );

  // Also remove the old hooks const if it survived (stock template declares
  // hooks separately from the replaced block).
  src = src.replace(
    /const hooks\s*=\s*\{\s*sandbox:\s*\{\s*onSandboxReady:\s*\[\s*\{\s*command:\s*"npm install"\s*\}\s*\]\s*\}\s*\};?\n?/,
    ""
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
        sandbox: docker({ imageName: warmImage }),
        hooks,
        copyToWorktree,
      });

      try {
        // Implement
        const impl = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),
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
            agent: sandcastle.claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),
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

// 5. UI_GUARD — already embedded in the createSandbox block above,
//    but handle the edge case where step 3 was already applied in a
//    previous run without step 5 (legacy overlay).
if (src.includes("review-prompt.md") && !src.includes("UI_GUARD")) {
  src = src.replace(
    /claudeCode\("claude-opus-4-8"\),\n(\s*)promptFile: "\.\/\.sandcastle\/implement-prompt\.md"/,
    'claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),\n$1promptFile: "./.sandcastle/implement-prompt.md"'
  );
  src = src.replace(
    /claudeCode\("claude-opus-4-8"\),\n(\s*)promptFile: "\.\/\.sandcastle\/review-prompt\.md"/,
    'claudeCode("claude-opus-4-8", { env: { UI_GUARD: "afk" } }),\n$1promptFile: "./.sandcastle/review-prompt.md"'
  );
}

// 6. Replace bare docker() with docker({ imageName: warmImage }) everywhere
src = src.replace(/docker\(\)/g, "docker({ imageName: warmImage })");

writeFileSync(FILE, src);
console.log(`Patched ${FILE} for warm image, review phase, and UI guard env.`);
