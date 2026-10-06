# Rule Creator Transcript -- Budget Pressure Eval

## Discovery

Rules file found: `.claude/rules/ui-rules.md` (fixture copy)

No other rules files discovered in this fixture.

## Pre-existing enforcement audit

Counted enforcement blocks by tier:

| Metric | Count |
|--------|-------|
| Total T3 blocks | 11 |
| Scopeless T3 (`scope: "*"`) | 8 (headings hierarchy, body text, dark mode, accent colors, hover effects, disabled elements, loading states, no-overlap) |
| Critical T3 (`critical: true`) | 2 (dark mode text, loading states) |
| T1 blocks | 0 |
| T2 blocks | 0 |
| Human blocks | 0 |

## Budget situation before adding new rules

| Budget | Limit | Current | Remaining |
|--------|-------|---------|-----------|
| Total T3 | 150 warn / 200 soft / 300 hard | 11 | 139 to warn |
| Scopeless T3 | 10 max | 8 | **2 remaining** |
| Critical T3 | 10 max | 2 | 8 remaining |

**Key constraint:** Only 2 scopeless T3 slots remain. All 3 new rules must use specific scopes or we will exceed the budget.

## Sorting test for each new rule

### Rule 1: "Empty states show a helpful message and a call-to-action, not just blank space."

**Step 1 -- Can a tool catch it?**
No. A regex cannot verify that an empty state has a "helpful" message or that a CTA is present in the rendered UI. The rule requires seeing rendered output.

**Step 2 -- Can a test catch it?**
Partially. A test could assert that specific elements exist (e.g., a button with text "Add a book"), but "helpful message" involves judgment about quality and context-appropriateness. Different empty states need different messages. This goes beyond deterministic pass/fail.

**Step 3 -- Does it need LLM judgment?**
Yes. An agent needs to see the empty state in a screenshot and judge whether the message is helpful and whether a CTA is present and discoverable. Reviewers would converge -- either there is a CTA and message or there is not.

**Classification: T3, agent: visual-qa**

**Scope decision:** Must use specific scope due to scopeless budget pressure. Scoped to `"EmptyState, Shelf"` -- the components that render empty states.

### Rule 2: "Error states include a retry mechanism and a human-readable explanation."

**Step 1 -- Can a tool catch it?**
No. A regex cannot verify that a rendered error state has a retry button or that the explanation is "human-readable" vs. a raw error code.

**Step 2 -- Can a test catch it?**
Partially. A test could assert a retry button exists, but "human-readable explanation" requires judgment. A test could check for the presence of elements but not their quality.

**Step 3 -- Does it need LLM judgment?**
Yes. An agent needs to see the error state and judge whether the message is human-readable (not a stack trace or raw error code) and whether a retry mechanism is visible. Reviewers would converge -- the distinction between a friendly error and a raw stack trace is clear.

**Classification: T3, agent: visual-qa**

**Scope decision:** Scoped to `"ErrorState, Shelf"` -- the components that render error states.

### Rule 3: "Modal dialogs are centered and never extend beyond the viewport."

**Step 1 -- Can a tool catch it?**
No. Centering and viewport overflow are visual properties of the rendered output, not syntactic patterns.

**Step 2 -- Can a test catch it?**
Partially. A Playwright test could check `getBoundingClientRect()` to verify centering and no overflow. However, "centered" has nuance (vertically centered? top-aligned with margin? consistent across breakpoints?) and checking "never extends beyond" requires testing at multiple viewport sizes. This is borderline T2/T3. However, the centering judgment (is it visually centered with appropriate margins) and the multi-breakpoint visual check make this more naturally a visual-qa task.

**Step 3 -- Does it need LLM judgment?**
Yes. Visual-qa can check centering and overflow at multiple viewport sizes in screenshots. Reviewers would converge -- a dialog that is off-center or clipped is visually obvious.

**Classification: T3, agent: visual-qa**

**Scope decision:** Scoped to `"Drawer, Dialog"` -- the modal components in this project.

## Budget check after adding 3 new rules

| Budget | Limit | Before | After | Status |
|--------|-------|--------|-------|--------|
| Total T3 | 150 warn / 200 soft / 300 hard | 11 | **14** | OK (well under 150) |
| Scopeless T3 | 10 max | 8 | **8** (no new scopeless added) | OK |
| Critical T3 | 10 max | 2 | **2** (no new critical added) | OK |

All budgets satisfied. The 3 new rules use specific scopes to avoid exceeding the scopeless budget of 10.

## Rule IDs (derived, not written into blocks)

- `ui-rules:new-rules-to-add:empty-states:T3`
- `ui-rules:new-rules-to-add:error-states:T3`
- `ui-rules:new-rules-to-add:modal-dialogs:T3`

## Output file

`ui-rules.md` -- updated with 3 new enforcement blocks appended after each rule in the "NEW RULES TO ADD" section.
