# EXECUTION

Write the code to pass your ticket's acceptance tests. A component's markup and its stylesheet are ONE unit — write both together for each visual element before moving on.

Tests find elements by `getByRole`. If a test fails with unexpected counts or missing animations on loading-state elements, check whether your placeholder markup participates in the accessible tree — `aria-hidden` removes elements from role queries and causes `getByRole` to silently skip them.

Only run tests tagged for your ticket. Use the `Run` command from the "Tests to turn green" section in the issue details — never run the whole spec file. Tests from other tickets will fail; that is expected and not your problem. Do not investigate, report, or count them.

Do NOT run tests tagged `@visual`. They run in a separate orchestrator phase. If a test name contains `@visual`, ignore it completely. Do NOT run `npm run ui:qa`.

Co-located tests. When you modify a source file, check the codemap for a matching test file (e.g. `Foo.tsx` → `Foo.test.tsx`). If one exists, read it and update any assertions that your changes invalidate — before running tests.

Before committing, run each verification command separately with full output. Do not pipe through `tail` or `head` — truncated output hides errors and wastes turns on misdiagnosis. Then run the pre-commit gate (see ENVIRONMENT). Commit prefix: `RALPH:`. One-line summary + file list. No design rationale.

# BOUNDARIES

You may ONLY read and write files inside `src/`. The only exception is reading the acceptance spec under `tests/acceptance/` (read-only — never edit).

Everything else is off-limits:

- `tests/support/`, `scripts/`, `qa/`, `.claude/`, `.sandcastle/`, config files, `package.json`, `playwright.config.*` — do NOT read, list, or cat these.
- Do NOT run `find`, `ls`, or any command to explore the workspace. The codemap already tells you what exists.
- Do NOT read or inspect hooks, settings, build config, or infrastructure. Trust the toolchain.

If a path is not in `src/` or the acceptance spec, you do not need it.

**Never reduce scope and report success.** If a technique obstacle blocks part of your task after 3 distinct approaches, escalate with `{{COMMENT_TASK_COMMAND}}` — do not silently drop the work and report COMPLETE.

# ENVIRONMENT

Pre-commit gate (run as one command): `npx stylelint --fix 'src/**/*.css' && npm run typecheck && npm run lint && npm test`
Playwright runs headless Chromium. No special config needed.
T1 hooks enforce constraints on every Edit/Write — trust them, don't inspect them.
Token values live in `src/styles/tokens.css` (read this file to see available tokens).
Every custom property defined in `:root` MUST also be defined in ALL dark-mode blocks in tokens.css (`[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`). A light-only token causes axe contrast failures.
Every custom-styled `<button>` needs `appearance: none` and an explicit `background-color` from a `--shelf-bgColor-*` token. UA defaults do not adapt to dark mode.

# COLD START

Your inputs are: the issue below, the codemap, CLAUDE.md (loads automatically), and the constraints below. That is everything you need. Do not explore or read anything outside of them.

Use the codemap to find files. Read the acceptance spec for this ticket and any existing source files you will modify. Then write a brief plan (3 lines max) and start coding the first component immediately — do not plan all components before starting.

# COMPLETION

Incomplete? Comment on the issue with progress.

Do not close the issue — the merger handles that.

Do not summarize what you built — the commit message is the record.

Once done, output the completion signal below as the **very last tokens you generate**. After emitting this tag, do not make any more tool calls, do not write any more text, do not explain what happens next, do not discuss the stop hook, do not verify or clean up anything. The signal is a hard stop — your turn ends the instant it appears.

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
