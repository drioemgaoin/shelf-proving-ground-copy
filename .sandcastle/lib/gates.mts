// Gate factories — build Gate descriptors for the visual and review gates.

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import {
  VISUAL_QA,
  VISUAL_FIXER,
  REVIEWER,
  CODE_FIXER,
} from "../config/agents.mjs";
import {
  type Gate,
  type GateContext,
  archiveTestResults,
  setPhase,
  findingsOverlap,
} from "./qa-gates.mjs";

// ---------------------------------------------------------------------------
// Visual QA gate
// ---------------------------------------------------------------------------

export function createVisualGate(
  issueId: string,
  branch: string,
  issueDetails: string,
): Gate {
  const shortId = issueId.replace(/^.*?-(?=[a-z0-9]+(?:\.[0-9]+)?$)/, "");
  const escapedId = shortId.replace(/\./g, "\\.");

  return {
    name: "Visual QA",
    checker: VISUAL_QA,
    fixer: VISUAL_FIXER,
    checkerMaxIterations: 10,
    fixerMaxIterations: 50,
    passWord: "PASS",
    checkerPromptFile: ".sandcastle/prompts/visual-qa.prompt.md",
    fixerPromptFile: ".sandcastle/prompts/fixer.prompt.md",

    findingsFile: (round) => `.qa/visual-r${round}.md`,

    buildCheckerArgs: (round, ctx) => ({
      BRANCH: branch,
      ISSUE_DETAILS: issueDetails,
      FINDINGS_FILE: `.qa/visual-r${round}.md`,
    }),

    buildFixerArgs: (round, ctx) => ({
      BRANCH: branch,
      TASK_ID: issueId,
      FINDINGS_FILE: `.qa/visual-r${round}.md`,
      VERIFY_COMMAND: `npm run ui:qa -- --grep "@visual.*@${escapedId}"`,
    }),

    beforeCheck: (round, ctx) => {
      archiveTestResults(ctx.worktree, `visual-qa-r${round}`);
      setPhase(ctx.worktree, "visual-qa");
    },

    beforeFix: (round, ctx) => {
      archiveTestResults(ctx.worktree, `visual-fixer-r${round}`);
      setPhase(ctx.worktree, "fix");
    },
  };
}

// ---------------------------------------------------------------------------
// Code review gate
// ---------------------------------------------------------------------------

export function createReviewGate(
  issueId: string,
  branch: string,
  issueDetails: string,
): Gate {
  const shortId = issueId.replace(/^.*?-(?=[a-z0-9]+(?:\.[0-9]+)?$)/, "");
  const escapedId = shortId.replace(/\./g, "\\.");

  return {
    name: "Code review",
    checker: REVIEWER,
    fixer: CODE_FIXER,
    checkerMaxIterations: 1,
    fixerMaxIterations: 50,
    passWord: "CLEAN",
    checkerPromptFile: ".sandcastle/prompts/reviewer.prompt.md",
    fixerPromptFile: ".sandcastle/prompts/fixer.prompt.md",

    findingsFile: (round) => `.qa/review-r${round}.md`,

    buildCheckerArgs: (round, ctx) => ({
      BRANCH: branch,
      BASE_BRANCH: (ctx.state.reviewBase as string) ?? "main",
      ISSUE_DETAILS: issueDetails,
      FINDINGS_FILE: `.qa/review-r${round}.md`,
      FIX_HISTORY: (ctx.state.fixHistory as string) ?? "",
    }),

    buildFixerArgs: (round, ctx) => ({
      BRANCH: branch,
      TASK_ID: issueId,
      FINDINGS_FILE: `.qa/review-r${round}.md`,
      VERIFY_COMMAND:
        `npm run typecheck && npm run lint && npm run test && ` +
        `npx playwright test --grep "@${escapedId}" --grep-invert "@visual"`,
    }),

    beforeCheck: (round, ctx) => {
      setPhase(ctx.worktree, "review");
    },

    beforeFix: (round, ctx) => {
      // Capture branch HEAD before the fixer commits, so the next review
      // round diffs only the fixer's changes.
      ctx.state.reviewBase = execSync(`git rev-parse ${branch}`, {
        encoding: "utf8",
      }).trim();
      setPhase(ctx.worktree, "fix");
    },

    afterFix: (round, ctx) => {
      // Record fixer commit message for the next reviewer round.
      try {
        const fixerMsg = execSync(`git log -1 --format=%B ${branch}`, {
          encoding: "utf8",
        }).trim();
        ctx.state.fixHistory =
          ((ctx.state.fixHistory as string) ?? "") +
          `Round ${round}: ${fixerMsg}\n\n`;
      } catch {
        // No commit from fixer — nothing to record.
      }
    },

    detectOscillation: (round, ctx) => {
      if (round < 2) return false;
      const prevFile = `${ctx.worktree}/.qa/review-r${round - 1}.md`;
      const currFile = `${ctx.worktree}/.qa/review-r${round}.md`;
      if (!existsSync(prevFile) || !existsSync(currFile)) return false;
      return findingsOverlap(
        readFileSync(prevFile, "utf8"),
        readFileSync(currFile, "utf8"),
      );
    },
  };
}
