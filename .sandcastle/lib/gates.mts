// Gate factories — build Gate descriptors for the visual and review gates.

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { buildConstraints } from "../../scripts/build-constraints.mjs";
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
import { recordViolation } from "./violations-memory.mjs";

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
    requiresDevServer: true,
    checkerPromptFile: ".sandcastle/prompts/visual-qa.prompt.md",
    fixerPromptFile: ".sandcastle/prompts/fixer.prompt.md",

    findingsFile: (round) => `.qa/visual-r${round}.md`,

    buildCheckerArgs: (round, ctx) => ({
      BRANCH: branch,
      ISSUE_DETAILS: issueDetails,
      FINDINGS_FILE: `.qa/visual-r${round}.md`,
    }),

    buildFixerArgs: (round, ctx) => {
      const { constraints } = buildConstraints(process.cwd());
      return {
        BRANCH: branch,
        TASK_ID: issueId,
        FINDINGS_FILE: `.qa/visual-r${round}.md`,
        VERIFY_COMMAND: `npm run ui:qa -- --grep "@visual.*@${escapedId}"`,
        CONSTRAINTS: constraints,
      };
    },

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

    buildCheckerArgs: (round, ctx) => {
      const base = (ctx.state.reviewBase as string) ?? "main";
      let branchDiff = "";
      let branchLog = "";
      try {
        // -U1: 1 line context (vs default 3) — ~66% framing reduction
        // pathspec: only src/ files, exclude snapshots and lockfiles
        branchDiff = execSync(
          `git diff -U1 --no-color ${base}...${branch} -- 'src/' ':!*.snap' ':!*.lock'`,
          { encoding: "utf8" },
        ).trimEnd();
      } catch { /* empty diff if branch not reachable */ }

      // Empty narrowed diff (all findings settled/blocked/reverted) →
      // re-run full branch diff so the reviewer has something to evaluate.
      if (!branchDiff && base !== "main") {
        try {
          branchDiff = execSync(
            `git diff -U1 --no-color main...${branch} -- 'src/' ':!*.snap' ':!*.lock'`,
            { encoding: "utf8" },
          ).trimEnd();
        } catch { /* empty diff if branch not reachable */ }
      }

      try {
        branchLog = execSync(`git log ${base}..${branch} --oneline`, { encoding: "utf8" }).trimEnd();
      } catch { /* empty log if branch not reachable */ }
      return {
        BRANCH: branch,
        BASE_BRANCH: base,
        BRANCH_DIFF: branchDiff,
        BRANCH_LOG: branchLog,
        ISSUE_DETAILS: issueDetails,
        FINDINGS_FILE: `.qa/review-r${round}.md`,
        FIX_HISTORY: (ctx.state.fixHistory as string) ?? "",
      };
    },

    buildFixerArgs: (round, ctx) => {
      const { constraints } = buildConstraints(process.cwd());
      return {
        BRANCH: branch,
        TASK_ID: issueId,
        FINDINGS_FILE: `.qa/review-r${round}.md`,
        VERIFY_COMMAND:
          `npm run typecheck && npm run lint && npm run test && ` +
          `npx playwright test --grep "@${escapedId}" --grep-invert "@visual"`,
        CONSTRAINTS: constraints,
      };
    },

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

      // Persist violations to rolling memory for future implementers.
      try {
        const findingsPath = `${ctx.worktree}/.qa/review-r${round}.md`;
        if (existsSync(findingsPath)) {
          const findings = readFileSync(findingsPath, "utf8");
          // Parse FINDINGS entries: "- src/file.ext:line `selector`\n  Cause: [rule] ...\n  Current: ...\n  Fix: ..."
          const entryRe = /^- (\S+?):(\d+)\s+`([^`]*)`\n\s+Cause:\s+\[([^\]]+)\]\s+(.*)\n\s+Current:\s+(.*)\n\s+Fix:\s+(.*)/gm;
          let m;
          while ((m = entryRe.exec(findings)) !== null) {
            const [, file, , , ruleRef, , current, fix] = m;
            // Extract ruleId from "[.claude/rules/ui-base.md > Values > values-from-tokens]"
            const ruleId = ruleRef.split(">").pop()?.trim() ?? ruleRef;
            recordViolation({
              ts: new Date().toISOString(),
              issueId,
              ruleId,
              file,
              wrote: current.trim().slice(0, 80),
              fix: fix.trim().slice(0, 120),
              gate: "review",
            });
          }
        }
      } catch {
        // Violations memory is best-effort — never breaks the gate.
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
