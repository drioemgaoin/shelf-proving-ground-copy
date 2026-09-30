# Mode: cover

Input: one existing route with no UI tests. Output: tests that pass today and lock the current behavior and look, plus tickets for problems found.

These are characterization tests: they record what the screen does now, so future changes can't break it silently. They start green.

## 1. Walk the screen

Open the route at each viewport. List elements, states you can reach, and interactions.

## 2. Write tests for what is correct today

Write the matrix as in feature mode, but only for behavior that is already right. Where the screen breaks a rule in `ui-base.md` or `ui-project.md`, do NOT write a passing test that locks the defect in. Instead, file a bug on the tracker (needs-triage) describing the rule and what you saw.

## 3. Run and check green

Run the file. Behavior, layout, a11y and motion tests must pass. Screenshot tests create their baselines on first run; run once more to confirm they pass.

## 4. Record

Post a short note on the tracker (or in the commit message if there is no issue): route covered, test file, number of tests, bugs filed. The new baselines are approved when the user reviews the commit.
