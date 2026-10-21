// Gate factory for the test-author phase.
//
// NOT PLUGGED IN — to enable, import createTestAuthorGate in phases.mts
// and add it to the gates array in runQAGates().
//
// The test author is a verification agent that writes tests for new
// modules after the builder finishes. It chooses the cheapest test type
// (unit, integration) that covers each behavior. Stack-agnostic — the
// project's test framework, conventions, and commands come from config.
//
// Enable per-project or per-ticket when the implementation has logic
// worth pinning (state machines, business rules, pure functions with
// combinatorial inputs). Skip for purely presentational UI.

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { TEST_AUTHOR, TEST_AUTHOR_FIXER } from "../config/agents.mjs";
import { buildConstraints } from "../../scripts/build-constraints.mjs";
import {
  type Gate,
  type GateContext,
  setPhase,
  findingsOverlap,
} from "./qa-gates.mjs";

// ---------------------------------------------------------------------------
// Project-specific test config — change these per project.
// TODO: move to .sandcastle/config/test-author.mts when multi-project.
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  /** Framework name shown to the agent (e.g. "Vitest + React Testing Library", "Jest", "pytest"). */
  framework: "Vitest + React Testing Library",
  /** Command the agent runs to execute tests. */
  command: "npm test",
  /** Naming convention for test files. */
  convention: "Co-locate as `ModuleName.test.tsx` (or `.test.ts`) next to the source file inside `src/`.",
  /** Glob patterns the agent may create/edit. */
  writablePatterns: "`*.test.tsx` and `*.test.ts` inside `src/`",
  /** Directories the agent may read. */
  sourceDirs: "`src/`",
  /** Diff pathspec — which files to include in the branch diff shown to the agent. */
  diffPathspec: "'src/' ':!*.snap' ':!*.lock' ':!*.test.*'",
  /** Codemap command — list source files for the agent. */
  codemapCmd: (branch: string) => `git ls-tree -r --name-only ${branch} -- src/`,
};

// ---------------------------------------------------------------------------
// Test author gate
// ---------------------------------------------------------------------------

export function createTestAuthorGate(
  issueId: string,
  branch: string,
  issueDetails: string,
): Gate {
  // Compute branch diff once — the checker needs it to see what was built.
  let branchDiff = "";
  let codemap = "";
  try {
    branchDiff = execSync(
      `git diff -U3 --no-color origin/main...${branch} -- ${TEST_CONFIG.diffPathspec}`,
      { encoding: "utf8" },
    ).trimEnd();
  } catch {
    // Empty diff if branch not reachable.
  }
  try {
    codemap = execSync(TEST_CONFIG.codemapCmd(branch), {
      encoding: "utf8",
    }).trimEnd();
  } catch {
    // Empty codemap if branch not reachable.
  }

  return {
    name: "Test author",
    checker: TEST_AUTHOR,
    fixer: TEST_AUTHOR_FIXER,
    checkerMaxIterations: 1, // One pass — write all tests at once
    fixerMaxIterations: 50,
    passWord: "PASS",
    checkerPromptFile: ".sandcastle/prompts/test-author.prompt.md",
    fixerPromptFile: ".sandcastle/prompts/fixer.prompt.md",

    findingsFile: (round) => `.qa/test-author-r${round}.md`,

    buildCheckerArgs: (round, _ctx) => ({
      BRANCH: branch,
      ISSUE_DETAILS: issueDetails,
      BRANCH_DIFF: branchDiff,
      CODEMAP: codemap,
      FINDINGS_FILE: `.qa/test-author-r${round}.md`,
      // Project-specific test environment
      TEST_FRAMEWORK: TEST_CONFIG.framework,
      TEST_COMMAND: TEST_CONFIG.command,
      TEST_FILE_CONVENTION: TEST_CONFIG.convention,
      TEST_FILE_PATTERNS: TEST_CONFIG.writablePatterns,
      SOURCE_DIRS: TEST_CONFIG.sourceDirs,
    }),

    buildFixerArgs: (round, _ctx) => {
      const { constraints } = buildConstraints(process.cwd());
      return {
        BRANCH: branch,
        TASK_ID: issueId,
        FINDINGS_FILE: `.qa/test-author-r${round}.md`,
        VERIFY_COMMAND: `npm run typecheck && ${TEST_CONFIG.command}`,
        CONSTRAINTS: constraints,
      };
    },

    beforeCheck: (_round, ctx) => {
      setPhase(ctx.worktree, "test-author");
    },

    beforeFix: (_round, ctx) => {
      setPhase(ctx.worktree, "fix");
    },

    detectOscillation: (round, ctx) => {
      if (round < 2) return false;
      const prevFile = `${ctx.worktree}/.qa/test-author-r${round - 1}.md`;
      const currFile = `${ctx.worktree}/.qa/test-author-r${round}.md`;
      if (!existsSync(prevFile) || !existsSync(currFile)) return false;
      return findingsOverlap(
        readFileSync(prevFile, "utf8"),
        readFileSync(currFile, "utf8"),
      );
    },
  };
}
