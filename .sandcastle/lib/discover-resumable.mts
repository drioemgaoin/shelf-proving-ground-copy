// Discovers worktrees with commits ahead of main for --resume mode.

import { existsSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { log } from "./logging.mjs";
import type { PlannedIssue } from "./phases.mjs";

export function discoverResumableIssues(): PlannedIssue[] {
  const worktreeRoot = ".sandcastle/worktrees";
  if (!existsSync(worktreeRoot)) return [];

  const entries = readdirSync(worktreeRoot, { withFileTypes: true });
  const issues: PlannedIssue[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("sandcastle-issue-")) continue;
    const issueId = entry.name.replace("sandcastle-issue-", "");
    const worktreePath = `${worktreeRoot}/${entry.name}`;

    // Check the branch has commits ahead of main
    try {
      const branch = execSync(`git -C ${worktreePath} rev-parse --abbrev-ref HEAD`, { encoding: "utf8" }).trim();
      const ahead = execSync(`git rev-list --count main..${branch}`, { encoding: "utf8" }).trim();
      if (Number(ahead) === 0) continue;

      // Infer touchesUI from whether src/ files were changed
      const diff = execSync(`git diff --name-only main...${branch} -- src/`, { encoding: "utf8" }).trim();
      const touchesUI = diff.length > 0;

      // Get title from the last commit message
      const title = execSync(`git log -1 --format=%s ${branch}`, { encoding: "utf8" }).trim();

      issues.push({ id: issueId, title, branch, touchesUI, scope: "src/**" });
    } catch {
      log(`  Skipping ${issueId}: could not read worktree state.`);
    }
  }
  return issues;
}
