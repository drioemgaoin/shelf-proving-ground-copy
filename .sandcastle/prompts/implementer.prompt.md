# TASK

Implement {{TASK_ID}}: {{ISSUE_TITLE}}

Single-issue focus. Branch: {{BRANCH}}.

<issue>

{{ISSUE_DETAILS}}

</issue>

# CONTEXT

<codemap>

{{CODEMAP}}

</codemap>

<recent-commits>

!`git log -n 3 --format="%ad %s" --date=short`

</recent-commits>

# COLD START

Your inputs are: the issue above, the codemap, CLAUDE.md and `.claude/rules/` (both load automatically), and recent commits. That is everything you need.

Use the codemap to find files — do not explore the tree yourself.

Read the locked acceptance spec for this ticket and any existing source files you will modify. Then write code. Nothing else first.

# BOUNDARIES

Implementer, not researcher. Trust the toolchain. Make the acceptance tests pass.

Read-only: `tests/acceptance/`, `.claude/rules/`.
Opaque (don't read or edit): `tests/support/`, `scripts/`, config files.
Do not: browse dirs, read build config, diagnose env errors, run issue-tracker commands.
Your integration tests go in `qa/agent/`.

# EXECUTION

Vertical slice, then widen. Red-green-refactor (TDD): read one acceptance test, write the minimum code to pass it, run it, repeat. Do not read all tests upfront. Do NOT write more than one source file before running tests. If you write multiple files before your first test run, you have violated your contract.

Only run tests tagged for your ticket. Use the `Run` command from the "Tests to turn green" section in the issue details — never run the whole spec file. Tests from other tickets will fail; that is expected and not your problem. Do not investigate, report, or count them.

Do NOT run tests tagged `@visual` — not to debug them, not to validate them, not to "check before delegating." They run in a separate orchestrator phase that you cannot see or trigger. If a test name contains `@visual`, ignore it completely. Do NOT run `npm run ui:qa` — that is the orchestrator's job.

Co-located tests. When you modify a source file, check the codemap for a matching test file (e.g. `Foo.tsx` → `Foo.test.tsx`). If one exists, read it and update any assertions that your changes invalidate — before running tests. Do not wait for a test failure to discover a stale assertion you could have anticipated from reading the file.

Before committing:

1. `npm run typecheck && npm run lint && npm run test`
2. Verify code passes all T1 enforcement rules in `.claude/rules/`.

Commit prefix: `RALPH:`. Include: task + PRD ref, key decisions, files changed, blockers.

# ESCALATION

When a test looks wrong or visual-qa fails on a tooling issue (not your code):

```
{{COMMENT_TASK_COMMAND}}    # replace <COMMENT>
{{LABEL_TASK_COMMAND}}
{{CREATE_BUG_COMMAND}}      # tooling bugs only — replace <TITLE>, <DESCRIPTION>
```

Then stop.

# COMPLETION

Incomplete? Comment on the issue with progress.

Do not close the issue — the merger handles that.

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>
