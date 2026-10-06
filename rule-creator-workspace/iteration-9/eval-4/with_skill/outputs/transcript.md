# Rule Creator Transcript: Budget Pressure Eval

## Discovery

Rules files found:
- `.claude/rules/ui-rules.md` (the input file, copied to outputs)

No other rules files discovered (eval fixture contains only this one file).

## Pre-existing enforcement block inventory

| # | Rule | Tier | Scope | Critical |
|---|------|------|-------|----------|
| 1 | Cards maintain consistent aspect ratios | T3 | CardGrid | false |
| 2 | Navigation always reachable | T3 | Navigation | false |
| 3 | Headings visual hierarchy | T3 | * | false |
| 4 | Body text readable (>=14px) | T3 | * | false |
| 5 | Line length <= 80 chars | T3 | ContentArea | false |
| 6 | Dark mode no invisible text | T3 | * | true |
| 7 | Accent colors max 2 visible | T3 | * | false |
| 8 | Hover effects visible | T3 | * | false |
| 9 | Disabled elements distinct | T3 | * | false |
| 10 | Loading states show skeleton/spinner | T3 | * | true |
| 11 | No elements overlap | T3 | * | false |

**Budget status before changes:**
- Total T3: 11 / 150 warn / 200 soft cap / 300 hard cap
- Scopeless T3 (`scope: "*"`): 8 / 10 max -- only 2 slots remaining!
- Critical T3: 2 / 10 max

## Sorting test: 3 new rules (Group 1 of 1)

### Rule 1: "Empty states show a helpful message and a call-to-action, not just blank space."

- **Step 1 (T1?):** No. No regex or lint rule can verify that a UI shows a "helpful" message or a CTA. The rule is about rendered output quality, not syntax.
- **Step 2 (T2?):** Partially -- you could assert a CTA button exists in the DOM during empty state, but "helpful message" is a judgment call. The combination of both checks and the quality aspect makes a pure assertion insufficient.
- **Step 3 (T3?):** Yes. A visual-qa agent can view the empty state screenshot and judge whether there is a visible message and a CTA. Reviewers would converge -- either there's a message+CTA or there isn't.
- **Classification: T3 (visual-qa)**
- **Scope decision:** Scoped to "ShelfGrid" (the component that renders the empty state). This avoids burning a scopeless slot. Budget pressure demands scoped rules.
- **Critical:** false -- not a safety/accessibility concern.

### Rule 2: "Error states include a retry mechanism and a human-readable explanation."

- **Step 1 (T1?):** No. "Human-readable explanation" requires judgment, not pattern matching.
- **Step 2 (T2?):** Partially -- you could assert a retry button exists, but "human-readable" is judgment.
- **Step 3 (T3?):** Yes. Visual-qa can view the error screen and check for both elements. Reviewers would converge.
- **Classification: T3 (visual-qa)**
- **Scope decision:** Scoped to "ErrorState" to preserve scopeless budget.
- **Critical:** false.

### Rule 3: "Modal dialogs are centered and never extend beyond the viewport."

- **Step 1 (T1?):** No. Centering and viewport bounds are layout properties, not syntax.
- **Step 2 (T2?):** Yes! Playwright can compute bounding boxes of modal dialogs and deterministically assert: (1) the dialog center matches the viewport center within tolerance, (2) all edges are within viewport boundaries. This is a pass/fail assertion with no judgment required.
- **Classification: T2**
- **No T3 budget impact.**

## Budget check after changes

### Per-file breakdown

**ui-rules.md:**
- T3 total: 13 (was 11, added 2)
- Scopeless T3 (`scope: "*"`): 8 (unchanged -- both new T3 rules are scoped)
- Critical T3: 2 (unchanged)

### Aggregated totals (all rules files)

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 11 | 13 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 8 | 8 | 10 | OK (2 slots remaining -- tight) |
| Critical T3 | 2 | 2 | 10 | OK |

**Budget commentary:** The scopeless budget is tight at 8/10. By scoping both new T3 rules to specific components (ShelfGrid, ErrorState), we avoided exceeding the limit. The third rule classified as T2 entirely avoids T3 budget pressure. If future rules need `scope: "*"`, consider narrowing existing scopeless rules (e.g., the heading hierarchy check could be scoped to specific page layouts).

## Rule IDs (implicit, derived from location)

- `ui-rules:new-rules-to-add:T3` (empty states) -- note: two rules share the heading slug; parsers disambiguate by position
- `ui-rules:new-rules-to-add:T3` (error states)
- `ui-rules:new-rules-to-add:T2` (modal dialogs)

## Output

Modified file saved to: `rule-creator-workspace/iteration-9/eval-4/with_skill/outputs/ui-rules.md`
