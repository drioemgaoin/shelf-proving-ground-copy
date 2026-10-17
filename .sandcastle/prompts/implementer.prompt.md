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

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# CODING STANDARDS

```
{{CODING_STANDARDS}}
```

# COLD START

Your inputs are: the issue above, the codemap (file structure + signatures), CLAUDE.md (loads automatically), the coding standards above, and recent commits. That is everything you need to start.

The codemap shows the repo layout and function signatures for your working area. Use it to find the right files — do not explore the tree yourself.

Read the locked acceptance spec for this ticket and any existing source files you will modify. Then write code. Nothing else first.

Do NOT:
- Browse the file tree, list directories, or search for tooling
- Read config files, build scripts, or test infrastructure
- Diagnose or fix environment/toolchain errors — escalate these instead

# BOUNDARIES

You are an implementer, not a researcher. No spikes, no experiments, no throwaway scripts. Trust the toolchain — it works. Your job is to make the acceptance tests pass, not to understand how they run.

Opaque — do not read or edit: `tests/support/`, `scripts/ui-qa/`, `playwright.config.ts`, config files.

Locked — read to understand what to implement, do not edit: `tests/acceptance/`.

No issue-tracker commands. The issue is above. Your integration tests go in `qa/agent/`.

# EXECUTION

Vertical slice, then widen. Red-green-refactor (TDD): read one acceptance test, write the minimum code to pass it, run it, repeat. Do not read all tests upfront. Do NOT write more than one source file before running tests. If you write multiple files before your first test run, you have violated your contract.

Only run tests tagged for your ticket. Use the `Run` command from the "Tests to turn green" section in the issue details — never run the whole spec file. Tests from other tickets will fail; that is expected and not your problem. Do not investigate, report, or count them.

Do NOT run tests tagged `@visual` — not to debug them, not to validate them, not to "check before delegating." They run in a separate orchestrator phase that you cannot see or trigger. If a test name contains `@visual`, ignore it completely. Do NOT run `npm run ui:qa` — that is the orchestrator's job.

Co-located tests. When you modify a source file, check the codemap for a matching test file (e.g. `Foo.tsx` → `Foo.test.tsx`). If one exists, read it and update any assertions that your changes invalidate — before running tests. Do not wait for a test failure to discover a stale assertion you could have anticipated from reading the file.

Before committing:

1. `npm run typecheck && npm run lint && npm run test`
2. Verify all test assertions use role-based queries (`getByRole`, `getByLabelText`), not `querySelector`.
3. Verify no nested ternary operators — use if/else or switch.
4. Verify all `@keyframes` declarations are inside their parent `@layer` block.

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
