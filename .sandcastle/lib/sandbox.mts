// Sandbox infrastructure — warm image, hooks, overlay, and worktree helpers.

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from "fs";
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
 * Hooks for agents that write code (Implementer, Fixer).
 *
 * Full toolchain: node_modules, beads, CLAUDE.md trimming,
 * enforcement stripping, backpressure baseline.
 * Optionally includes overlay skip-worktree commands.
 *
 * IMPORTANT: These hooks mutate files inside the sandbox.  They are
 * safe ONLY when the sandbox is backed by a git worktree (branch strategy
 * "branch" or "merge-to-head"), never with "head" (host bind-mount).
 */
export function createBuilderHooks(overlay: boolean): SandboxHooks {
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
            "rm -rf ./.beads && cp -a /warm/.beads ./.beads && chmod 700 .beads && " +
            "bd init --reinit-local --non-interactive -q 2>/dev/null; true",
        },
        {
          command:
            // Strip Beads block and Agent skills section — irrelevant inside sandbox
            "sed -i.bak '/<!-- BEGIN BEADS/,/<!-- END BEADS/d' CLAUDE.md && " +
            "sed -i.bak '/^## UI rules$/,$d' CLAUDE.md && " +
            "rm -f CLAUDE.md.bak",
        },
        // Deny tools the implementer never uses.  permissions.deny removes
        // tool definitions from the system prompt, saving ~5-10K tokens/turn.
        {
          command:
            `node -e "` +
            `const f='.claude/settings.json';` +
            `const s=JSON.parse(require('fs').readFileSync(f,'utf8'));` +
            `s.permissions=s.permissions||{};` +
            `s.permissions.deny=[` +
            `'WebSearch','WebFetch','Agent','Skill',` +
            `'EnterPlanMode','ExitPlanMode','EnterWorktree','ExitWorktree',` +
            `'CronCreate','CronDelete','CronList','RemoteTrigger',` +
            `'NotebookEdit','AskUserQuestion','LSP','ToolSearch',` +
            `'TaskCreate','TaskGet','TaskList','TaskOutput','TaskStop','TaskUpdate'` +
            `];` +
            `require('fs').writeFileSync(f,JSON.stringify(s,null,2));` +
            `"`,
        },
        // Write T1 cache for in-container hooks, then stash rules dir
        // so Claude Code loads zero rules into LLM context.
        // T1 hooks read from .t1-cache.json; T3 payloads injected into prompts.
        // Stash goes to .sandcastle/ (not .claude/) so agents exploring
        // .claude/ for config can't discover and read the raw rule files.
        { command: "node scripts/write-t1-cache.mjs" },
        { command: "mv .claude/rules .sandcastle/.rules-stash" },
        // Restore T1 cache to the path apply-t1.mjs expects (.claude/rules/.t1-cache.json)
        { command: "mkdir -p .claude/rules && cp .sandcastle/.rules-stash/.t1-cache.json .claude/rules/ 2>/dev/null; true" },
        // Remove skills and agents — not used inside sandbox (Skill tool is
        // denied) and their presence lets agents read prompt prose by accident.
        // Also prune hooks to only those referenced in settings.json
        // (guard, apply-t1, backpressure + lib/).
        { command: "rm -rf .claude/skills .claude/agents" },
        { command: "find .claude/hooks -maxdepth 1 -name 'check-*.mjs' -delete" },
        ...(overlay
          ? [
              {
                command:
                  "git ls-files -z CLAUDE.md AGENTS.md .claude/ .sandcastle/ tests/ | " +
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
 * Hooks for read-only agents (Planner).
 *
 * Minimal setup: node_modules and beads only.  No rules stripping,
 * no skip-worktree, no CLAUDE.md mutation.  Safe with any branch
 * strategy including "merge-to-head".
 */
export function createLightHooks(): SandboxHooks {
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
            "rm -rf ./.beads && cp -a /warm/.beads ./.beads && chmod 700 .beads && " +
            "bd init --reinit-local --non-interactive -q 2>/dev/null; true",
        },
        // Stash rules so planner doesn't waste context on ~330 lines of prose.
        { command: "test -d .claude/rules && mv .claude/rules .sandcastle/.rules-stash || true" },
        { command: "rm -rf .claude/skills .claude/agents" },
        { command: "find .claude/hooks -maxdepth 1 -name 'check-*.mjs' -delete" },
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
            "rm -rf ./.beads && cp -a /warm/.beads ./.beads && chmod 700 .beads && " +
            "bd init --reinit-local --non-interactive -q 2>/dev/null; true",
        },
        // Write T1 cache then stash rules (same as builder hooks).
        { command: "node scripts/write-t1-cache.mjs" },
        { command: "mv .claude/rules .sandcastle/.rules-stash" },
        { command: "mkdir -p .claude/rules && cp .sandcastle/.rules-stash/.t1-cache.json .claude/rules/ 2>/dev/null; true" },
        { command: "rm -rf .claude/skills .claude/agents" },
        { command: "find .claude/hooks -maxdepth 1 -name 'check-*.mjs' -delete" },
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
    // Only hooks and settings — rules are prompt-injected (T1/T3),
    // skills are not used in containers.
    ".claude/hooks",
    ".claude/settings.json",
    "tests",
  ]);
}

// ---------------------------------------------------------------------------
// Rules visibility
// ---------------------------------------------------------------------------

const RULES_DIR = ".claude/rules";
const RULES_STASH = ".sandcastle/.rules-stash";

/**
 * Show or hide `.claude/rules` inside a sandcastle worktree.
 *
 * Used by QA gates to toggle visibility mid-run: hide for checkers
 * (rules arrive via T3 payloads), restore for fixers (need full context).
 *
 * Guard: refuses to operate on the host project root — only worktree paths.
 * Idempotent: hiding when already hidden or restoring when already visible
 * is a no-op.
 */
export function setRulesVisible(worktree: string, visible: boolean): void {
  // Guard: never rename .claude/rules on the host root — only inside
  // sandcastle worktrees.  A bare "." or empty string would resolve to
  // the orchestrator's cwd (the project root), corrupting the host.
  if (!worktree || !worktree.includes("worktrees")) {
    throw new Error(
      `setRulesVisible refused: target "${worktree}" does not look like a sandcastle worktree. ` +
      `This would modify the host .claude/rules.`,
    );
  }
  const active = join(worktree, RULES_DIR);
  const stashed = join(worktree, RULES_STASH);
  try {
    if (visible && existsSync(stashed)) {
      renameSync(stashed, active);
    } else if (!visible && existsSync(active)) {
      renameSync(active, stashed);
    }
  } catch (e) {
    // Log but don't throw — a rename failure is degraded but not fatal.
    // Visible-to-checker: redundant context (rules + T3 payloads), harmless.
    // Hidden-from-fixer: fixer still gets rules via prompt, functional.
    console.error(`⚠️  setRulesVisible(${visible}) failed for ${worktree}: ${e}`);
  }
}

/** Compute the merge-base commit on the host for the backpressure hook. */
export function getGuardBase(): string {
  return execSync("git merge-base HEAD main", { encoding: "utf8" }).trim();
}
