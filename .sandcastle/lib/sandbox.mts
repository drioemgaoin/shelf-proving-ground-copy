// Sandbox infrastructure — warm image, hooks, overlay, and worktree helpers.

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Warm image
// ---------------------------------------------------------------------------

/** Build (or reuse) the warm Docker image. Returns the image tag. */
export function buildWarmImage(): string {
  const output = execSync("bash .sandcastle/docker/build-warm.sh", { cwd: process.cwd() })
    .toString()
    .trim()
    .split("\n")
    .pop()!;
  return output;
}

// ---------------------------------------------------------------------------
// Sandbox hooks
// ---------------------------------------------------------------------------

export interface SandboxHooks {
  sandbox: {
    onSandboxReady: Array<{ command: string }>;
  };
}

/** Files tracked by git that agents don't need inside Docker. */
const WORKTREE_EXCLUDE = [
  "CLAUDE-TEMPLATE.md",
  "SETUP-GUIDE.md",
  "GLOSSARY.md",
  "README.md",
  ".codex/",
  ".cursor/",
];

/**
 * Build the default sandbox hooks (node_modules symlink, beads init,
 * backpressure baseline). Optionally includes overlay skip-worktree
 * commands when overlay mode is active.
 */
export function createHooks(overlay: boolean): SandboxHooks {
  return {
    sandbox: {
      onSandboxReady: [
        { command: `rm -rf ${WORKTREE_EXCLUDE.map((p) => `./${p}`).join(" ")}` },
        {
          command:
            "rm -rf ./node_modules && ln -s /warm/node_modules ./node_modules && " +
            'node -e "require(\'rollup\')" || { rm -f ./node_modules && cp -a /warm/node_modules ./node_modules; }',
        },
        {
          command:
            "cp -a /warm/.beads ./.beads && chmod 700 .beads && " +
            "bd init --reinit-local --non-interactive -q 2>/dev/null; true",
        },
        ...(overlay
          ? [
              {
                command:
                  "git ls-files -z CLAUDE.md AGENTS.md .claude/ .sandcastle/ e2e/ | " +
                  "xargs -0 git update-index --skip-worktree 2>/dev/null; true",
              },
            ]
          : []),
        { command: "node .claude/hooks/backpressure.mjs --baseline" },
      ],
    },
  };
}

/**
 * Lightweight hooks for replay scripts (no worktree exclusions, no overlay).
 */
export function createReplayHooks(): SandboxHooks {
  return {
    sandbox: {
      onSandboxReady: [
        {
          command:
            "rm -rf ./node_modules && ln -s /warm/node_modules ./node_modules && " +
            'node -e "require(\'rollup\')" || { rm -f ./node_modules && cp -a /warm/node_modules ./node_modules; }',
        },
        {
          command:
            "cp -a /warm/.beads ./.beads && chmod 700 .beads && " +
            "bd init --reinit-local --non-interactive -q 2>/dev/null; true",
        },
        { command: "node .claude/hooks/backpressure.mjs --baseline" },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Overlay — copy uncommitted host files into worktrees
// ---------------------------------------------------------------------------

/**
 * Expand directory paths into individual tracked file paths.
 * Only includes files tracked by git (untracked files would fail
 * because their parent directories don't exist in the worktree).
 */
function expandTrackedFiles(paths: string[]): string[] {
  const tracked = new Set(
    execSync("git ls-files", { encoding: "utf8" }).trim().split("\n"),
  );
  const result: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p, {
        withFileTypes: true,
        recursive: true,
      })) {
        if (entry.isFile()) {
          const full = join(entry.parentPath ?? entry.path, entry.name);
          if (tracked.has(full)) result.push(full);
        }
      }
    } else {
      if (tracked.has(p)) result.push(p);
    }
  }
  return result;
}

/** Build the list of files to copy into worktrees when overlay is active. */
export function buildOverlayFileList(): string[] {
  return expandTrackedFiles([
    // Sandcastle prompts and scripts (top-level files only)
    ...readdirSync(".sandcastle", { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => `.sandcastle/${e.name}`),
    ".sandcastle/prompts",
    ".sandcastle/config",
    ".sandcastle/lib",
    // Agent instruction files
    "CLAUDE.md",
    "AGENTS.md",
    ".claude/rules",
    ".claude/skills",
    ".claude/hooks",
    ".claude/settings.json",
    ".claude/settings.local.json",
    "e2e",
  ]);
}

/** Compute the merge-base commit on the host for the backpressure hook. */
export function getGuardBase(): string {
  return execSync("git merge-base HEAD main", { encoding: "utf8" }).trim();
}
