# Visual QA Prompt Adjustments Log

Tracking changes to `visual-qa-prompt.md` and their results.

## Issues to Fix

1. **Agent continues after COMPLETE** — Must stop immediately after `<promise>COMPLETE</promise>`. No more tool calls, no more text.
2. **`npm run ui:qa` run multiple times** — Should run once. Only re-run individual tests for flaky detection via `npx playwright test -g`.
3. **No test filtering** — Must filter `npm run ui:qa` to only ticket-related tests using `-- --grep`.
4. **Non-visual tests running** — Visual QA should only run visual tests (`@visual` tag), not behavioral tests.

---

## Adjustment 1

**Changes:**
- Added hard stop instruction after `<promise>COMPLETE</promise>` (consistent with implementer/merger prompts)
- Changed execution to run `npm run ui:qa -- --grep "@visual"` to filter to visual tests only
- Added `--grep` with ticket test names to scope to only ticket-related tests
- Clarified that `npm run ui:qa` must run exactly once
- Removed instruction that could lead to re-running `npm run ui:qa` (flaky check uses targeted `npx playwright test` only)

**Result:** SUCCESS — All 4 issues fixed.
- Agent stopped immediately after `<promise>COMPLETE</promise>` (no post-COMPLETE tool calls)
- `npm run ui:qa` called exactly once
- Correct `--grep "Shelf grid.*@visual"` filter applied — only ran 3 visual tests × 6 projects
- No behavioral tests ran
- Run completed in ~84s, 16 turns, $0.33 (vs previous: ~290s, 26 turns, $0.57)
- Report correctly identified 6 in-scope failures (chip visual states across all viewports)

## Adjustment 2

**Changes:**
- Removed all `npx playwright test` usage — `npm run ui:qa` is now the only test command
- Replaced manual flaky re-runs with reliance on Playwright's built-in `retries: 1`
- Added explanation of why pass→fail flakiness is not a concern (animations disabled, screenshots deterministic)
- Agent reads `flaky` count from report instead of doing manual retries

**Reasoning:** Playwright's retry mechanism already does fail→pass detection in-process (faster, same browser context). Manual re-runs via `npx playwright test` were redundant and bypassed the report/baseline wrapper.

**Result:** SUCCESS — Verified in sandcastle replay.
- Agent stopped after COMPLETE (no post-COMPLETE actions)
- `npm run ui:qa` called exactly once with `--grep "Shelf grid.*@visual"`
- Zero `npx playwright test` calls
- Flaky detection delegated to Playwright's `retries: 1` (no manual re-runs)
- Report correctly classified 6 failures as contract gaps, 0 flaky

---

# Review Prompt Adjustments

## Adjustment 1 (review)

**Changes:**
- Added hard stop instruction after `<promise>COMPLETE</promise>` (consistent with visual-qa/implementer)
- Removed "Use the code-review skill" — agent doesn't have skills in sandbox; replaced with direct "Review the diff" instruction
- Restructured contract protection as Step 1 in an EXECUTION section, telling agent to scan the inlined diff for locked paths (no extra git command needed since diff is already in context)
- Gave the git command as a concrete verification step

**Run 1 result:** COMPLETE stop worked. Contract protection skipped (agent deprioritized the git command under maxIterations: 1).

**Run 2 result:** Changed to "scan the inlined diff" approach. Contract protection confirmed ("No locked paths were touched"). COMPLETE stop worked. 5 findings written. 4 tool calls total.

**Run 3 result:** SUCCESS — all checks pass.
- Agent ran `git diff main..HEAD --name-only` as first action (contract check)
- Agent explicitly said "I'll scan the locked paths first" and "No locked paths were touched"
- COMPLETE found, no post-COMPLETE actions
- `.qa/review.md` written with 5 actionable findings
