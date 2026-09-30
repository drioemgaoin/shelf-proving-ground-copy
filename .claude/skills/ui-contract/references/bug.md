# Mode: bug

Input: a bug report. Output: one or a few tests that fail because of the bug, and an agent-ready ticket.

## 1. Reproduce by hand first

Find the smallest steps that show the bug. Note the route, viewport, color mode, and browser. If you can't reproduce it, ask the reporter one question and stop. The ticket stays in the info-needed state.

## 2. Name the expected behavior

Write one sentence: what should happen instead. The source must be `ui-base.md`, `ui-project.md`, the original spec, or the user's decision now. If none of these says what's right, ask the user. That decision is a design choice, not a bug fix.

## 3. Write the regression test

Test the expected behavior, not the bug. Use the tag that matches the kind of bug. If the bug only shows in one project (dark, webkit, zoom), the tag must include that project's tag set (see `helpers.md`).

## 4. Prove red for the right reason

Run the test. It must fail, and the failure message must describe the bug. A test that fails for another reason proves nothing.

## 5. Update the ticket

Add to the bug ticket: the regression test path and name, the one-sentence expected behavior, and "Done when: this test passes and `npm run ui:qa` reports no new failures." Then apply the ready-for-agent label from `docs/agents/triage-labels.md`.
