# Transcript: Agent Selection Evaluation

## Task

Add enforcement blocks to all 4 rules in review-rules.md. The user specified two are visual quality rules and two are code structure rules, and wants each to get the right T3 agent -- visual-qa for screenshot-judged rules, reviewer for code-judged rules.

## Discovery

Found one rules file: `.claude/rules/review-rules.md` (scoped to `src/**/*`).

All 4 rules already have enforcement blocks. Ran the sorting test on each to verify the existing classifications are correct.

## Sorting Test Results

### Rule 1: "Loading skeletons match the shape and layout of the content they replace."

**Section:** Visual Quality

- **Step 1 -- Can a tool catch it?** No. Whether skeletons "match the shape and layout" of content requires comparing two visual states side by side. No regex or AST walker can evaluate spatial correspondence between skeleton placeholders and rendered content elements.
- **Step 2 -- Can a test catch it?** No. There is no deterministic assertion that can compare skeleton geometry to content geometry without understanding what "matching" means visually. You could check for the presence of skeleton elements, but not whether their shapes correspond to real content.
- **Step 3 -- Does it need LLM judgment?** Yes. An agent needs to see screenshots of both skeleton and loaded states and judge whether placeholders correspond to real content in position, size, and count. This is visible in screenshots, not code. Reviewers would converge -- either a skeleton matches or it clearly doesn't.

**Classification: T3, agent: visual-qa** -- the violation is visible in a screenshot comparison.

**Existing block:** T3 visual-qa with scope "ShelfGrid, BookCard, Drawer". Correct. The instruction is well-formed: it describes what to look for (skeleton vs loaded states), what counts as a violation (missing/mismatched skeletons), and what correct looks like (every content piece has a matching placeholder). No changes needed.

---

### Rule 2: "Dark mode toggle does not cause a visible layout shift."

**Section:** Visual Quality

- **Step 1 -- Can a tool catch it?** No. Layout shift is a runtime phenomenon -- it depends on how computed styles change when the theme attribute toggles.
- **Step 2 -- Can a test catch it?** Yes. Cumulative Layout Shift (CLS) is a measurable metric via the PerformanceObserver API. A Playwright test can toggle `data-theme`, collect `layout-shift` entries, sum the scores, and assert the total is below a threshold (e.g., 0.01). This is a deterministic pass/fail assertion.

**Classification: T2** -- runtime pass/fail via CLS measurement.

**Key reasoning:** Although this rule lives under "Visual Quality" and the word "visible" appears in the rule text, the violation is measurable by a deterministic metric. The sorting test says to pick the cheapest tier that catches every violation. CLS measurement at T2 is cheaper and more reliable than having an LLM eyeball screenshots for layout shift. This is NOT a T3 rule.

**Existing block:** T2 with global scope and a CLS assertion. Correct. No changes needed.

---

### Rule 3: "No business logic in React component files -- extract to custom hooks or utility modules."

**Section:** Code Structure

- **Step 1 -- Can a tool catch it?** No. What constitutes "business logic" vs rendering logic requires understanding intent. A regex can't distinguish a filter call that's domain logic from one that's purely presentational.
- **Step 2 -- Can a test catch it?** No. There is no runtime assertion for "this function is business logic."
- **Step 3 -- Does it need LLM judgment?** Yes. A reviewer reads the component source and judges whether inline computations are domain logic or rendering helpers. This is about code structure, not visual output -- you judge it by reading `.tsx` files, not by looking at screenshots. Reviewers would converge: data transformations, validation rules, and state machines in a component file are clearly business logic.

**Classification: T3, agent: reviewer** -- the violation is in code structure, visible in source files.

**Existing block:** T3 reviewer with scope "src/components/**/*.tsx". Correct. The instruction covers what to look for, what counts as a violation, and what correct looks like. Has triage_hint as required for reviewer agent. No changes needed.

---

### Rule 4: "Functions longer than 50 lines are split into smaller, focused units."

**Section:** Code Structure

- **Step 1 -- Can a tool catch it?** Yes, partially. The 50-line threshold is a hard, measurable number. An AST walker can count lines from opening to closing brace of every function/arrow function. This is the "hard threshold with a soft qualifier" branch from the sorting test: classify at T1 for the threshold, surface the "focused" qualifier as a gap.

**Classification: T1** -- deterministic line-count check on the measurable threshold.

**Key reasoning:** Although this rule lives under "Code Structure" and contains a qualifier ("focused"), the threshold is independently meaningful -- a 50-line limit is a real, enforceable rule even without "focused." The qualifier describes why the team chose the threshold. Per the skill's "hard threshold with a soft qualifier" guidance, this is T1 on the threshold with the gap surfaced separately.

**Existing block:** T1 with AST line count pattern, appropriate scope and fix. The gap note about "focused" is already documented. Correct. No changes needed.

---

## Budget Check

Counting enforcement tiers across all discovered rules files:

| Tier | Count |
|------|-------|
| T1   | 1     |
| T2   | 1     |
| T3   | 2     |
| Human | 0    |

**T3 budget:** 2 of 300 hard cap. Well within limits.
**Scopeless T3:** 0 of 10. Both T3 rules have explicit scopes.
**Critical T3:** 0 of 10. Neither T3 rule is marked critical.

All budgets are healthy.

## Summary

All 4 existing enforcement blocks are correctly classified:

| Rule | Tier | Agent | Rationale |
|------|------|-------|-----------|
| Loading skeletons match content shape | T3 | visual-qa | Screenshot comparison needed |
| Dark mode toggle no layout shift | T2 | n/a | CLS is a deterministic metric |
| No business logic in components | T3 | reviewer | Code structure judgment |
| Functions under 50 lines | T1 | n/a | AST line count is deterministic |

The two T3 rules correctly use different agents: visual-qa for the skeleton rule (judged from screenshots) and reviewer for the business-logic rule (judged from code). The other two rules are correctly at cheaper tiers (T2 and T1) because deterministic checks can catch their violations -- upgrading them to T3 would be a permanent tax on the pipeline for no benefit.

No changes were made to the enforcement blocks. The file was copied as-is because all classifications were already correct.

## Rule IDs

- `review-rules:visual-quality:T3` -- skeleton matching
- `review-rules:visual-quality:T2` -- dark mode CLS
- `review-rules:code-structure:T3` -- business logic separation
- `review-rules:code-structure:T1` -- function length
