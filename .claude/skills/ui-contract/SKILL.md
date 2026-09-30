---
name: ui-contract
description: Write locked Playwright tests that define what "correct" looks like for a UI, before the builder writes or fixes code. Three modes. feature: a spec adds or changes UI (run after to-spec, before to-tickets). bug: a reported visual or UX bug (run after triage, before the fix). cover: an existing screen with no UI tests. Use when the user says "ui contract", "write the UI tests", "lock this bug", or "cover this screen".
disable-model-invocation: true
---

# UI Contract

You write the checks that define "done". The builder agent must make them pass and can never edit them, so they are a contract. You run in the day shift, with the user present.

## Pick the mode

| Input | Mode | Tests start | Read |
|---|---|---|---|
| A spec (issue or file) that adds or changes UI | feature | red | `references/feature.md` |
| A bug report | bug | red | `references/bug.md` |
| An existing route with no tests | cover | green | `references/cover.md` |

If unclear, ask once. Then read only that mode's reference file.

## Always read

1. The input: spec, bug, or route. Use the tracker described in `docs/agents/issue-tracker.md`.
2. `GLOSSARY.md`. Use its terms exactly in test names and locators.
3. `.claude/rules/ui-base.md` and `.claude/rules/ui-project.md`.
4. `references/helpers.md` for the test API. Do not open `e2e/support/*.ts` unless a helper misbehaves.

## Shared rules for every test

- Import from `../support/fixtures` (or `../../support/fixtures` in subfolders), never from `@playwright/test` directly. The fixture fails any test that logs a console error.
- Name tests `<Element>: <expected behavior>`, so tickets can reference them by name.
- Tag each test by what it checks: `@visual`, `@motion`, `@a11y`, `@layout`, `@stability`, `@perf`. Plain behavior tests have no tag. Tags decide which browsers and modes run the test.
- Find elements by role and accessible name. If an element has no accessible name, that is a finding, not a reason to use a CSS selector.
- Read token values from the page with `readToken`. Never hard-code a duration, color, or size.
- No `test.skip`, `test.fixme`, soft assertions, or `waitForTimeout` as an assertion.
- If a state can't be shown without app support (e.g. an error state), the test uses the project's fixture convention (see `ui-project.md`). If none exists, note it in the contract as a dependency for the first ticket.

## Where tests go

| Mode | Path |
|---|---|
| feature | `e2e/acceptance/<feature-slug>.spec.ts` |
| bug | `e2e/acceptance/regressions/<issue-id>-<slug>.spec.ts` |
| cover | `e2e/acceptance/cover/<route-slug>.spec.ts` |

Everything under `e2e/acceptance/` is locked for AFK agents. Builders put extra tests in `e2e/agent/`.

## Context budget

One feature, one bug, or one route per session. If the matrix grows past about 25 tests, stop and split the work with the user. Each session should end well under 60k tokens.

## Finish

Run the file: `npx playwright test <path> --reporter=line`. Check the result matches the mode's expectation (red or green), then commit the test file alone. The mode reference says what to record on the tracker.
