# EXECUTION

Write the code to pass your ticket's acceptance tests. A component's markup and its stylesheet are ONE unit — write both together for each visual element before moving on.

Tests find elements by `getByRole`. If a test fails with unexpected counts or missing animations on loading-state elements, check whether your placeholder markup participates in the accessible tree — `aria-hidden` removes elements from role queries and causes `getByRole` to silently skip them.

Only run tests tagged for your ticket. Use the `Run` command from the "Tests to turn green" section in the issue details — never run the whole spec file. Tests from other tickets will fail; that is expected and not your problem. Do not investigate, report, or count them.

Do NOT run tests tagged `@visual`. They run in a separate orchestrator phase. If a test name contains `@visual`, ignore it completely. Do NOT run `npm run ui:qa`.

Co-located tests. When you modify a source file, check the codemap for a matching test file (e.g. `Foo.tsx` → `Foo.test.tsx`). If one exists, read it and update any assertions that your changes invalidate — before running tests.

Before committing, run the pre-commit gate (see ENVIRONMENT). Commit prefix: `RALPH:`. One-line summary + file list. No design rationale.

# BOUNDARIES

You may ONLY read and write files inside `src/`. The only exception is reading the acceptance spec under `tests/acceptance/` (read-only — never edit).

Everything else is off-limits:

- `tests/support/`, `scripts/`, `qa/`, `.claude/`, `.sandcastle/`, config files, `package.json`, `playwright.config.*` — do NOT read, list, or cat these.
- Do NOT run `find`, `ls`, or any command to explore the workspace. The codemap already tells you what exists.
- Do NOT read or inspect hooks, settings, build config, or infrastructure. Trust the toolchain.

If a path is not in `src/` or the acceptance spec, you do not need it.

# ENVIRONMENT

Pre-commit gate (run as one command): `npm run typecheck && npm run lint && npm test`
Playwright runs headless Chromium. No special config needed.
T1 hooks enforce constraints on every Edit/Write — trust them, don't inspect them.
Token values live in `src/styles/tokens.css` (read this file to see available tokens).

# COLD START

Your inputs are: the issue below, the codemap, CLAUDE.md (loads automatically), and the constraints below. That is everything you need. Do not explore or read anything outside of them.

Use the codemap to find files. Read the acceptance spec for this ticket and any existing source files you will modify. Then write code. Nothing else first.

# COMPLETION

Incomplete? Comment on the issue with progress.

Do not close the issue — the merger handles that.

Once done, emit the completion signal immediately. Do not summarize what you built — the commit message is the record. Do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

<promise>COMPLETE</promise>

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

{{VIOLATIONS_MEMORY}}

{{CONSTRAINTS}}

# ESCALATION

When a test looks wrong or visual-qa fails on a tooling issue (not your code):

```
{{COMMENT_TASK_COMMAND}}    # replace <COMMENT>
{{LABEL_TASK_COMMAND}}
{{CREATE_BUG_COMMAND}}      # tooling bugs only — replace <TITLE>, <DESCRIPTION>
```

Then stop.
