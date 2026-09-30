# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `bd show <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# CONTRACT RULES

The acceptance tests in `e2e/acceptance/` are locked. Do not edit, delete, or move them. Do not edit files under `e2e/support/`, `scripts/ui-qa/`, `playwright.config.ts`, or `.claude/`. The guard hook will block you if you try.

If a test looks wrong, comment on the ticket with `bd update <ID> --notes "..."` and apply the `ready-for-human` label. Then stop.

Extra integration tests you write go in `e2e/agent/`, not `e2e/acceptance/`.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

Use the tdd skill to complete the task:

1. RED: write one failing test (unit test, or use an existing locked acceptance test)
2. GREEN: write the minimum implementation to pass that test
3. REPEAT until all acceptance tests for this ticket pass
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `npm run typecheck` and `npm run test` to ensure the tests pass.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# VISUAL QA

After all tests pass and you have committed, delegate to the **visual-qa** agent. It runs `npm run ui:qa`, triages any failures, and reports back PASS or FAIL. You cannot finish until visual-qa returns PASS.

If visual-qa reports regressions (under "Fix now"), fix them in your code, commit, and delegate to visual-qa again.

If visual-qa fails due to a tooling or environment issue (not a code regression), file a bug for the tooling issue using `bd create --type=bug --label=ready-for-human` with reproduction steps, link it in your ticket comment via `bd update <ID> --notes "..."`, and continue with escalation.

The finish hook will block you from stopping if:
- UI files changed but no QA report exists
- The QA report fingerprint does not match the current code
- The QA report status is not PASS

After 5 blocks, escalate: comment on the ticket, apply the `ready-for-human` label, and stop.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue — this will be done later by the merger.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
