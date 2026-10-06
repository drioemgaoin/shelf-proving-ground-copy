# Transcript: Adding enforcement blocks under budget pressure

## Initial analysis

Read the input file at `.claude/skills/rule-creator/evals/fixtures/budget-pressure/.claude/rules/ui-rules.md`.

**Existing enforcement blocks (11 total):**

| # | Rule | Scope | Critical | Group |
|---|------|-------|----------|-------|
| 1 | Card aspect ratios | CardGrid | no | layout |
| 2 | Navigation reachable | Navigation | no | layout |
| 3 | Heading hierarchy | * | no | typography |
| 4 | Body text min size | * | no | typography |
| 5 | Line length | ContentArea | no | typography |
| 6 | Dark mode text contrast | * | yes | theming |
| 7 | Accent color limit | * | no | theming |
| 8 | Hover effects | * | no | interaction |
| 9 | Disabled elements | * | no | interaction |
| 10 | Loading states | * | yes | interaction |
| 11 | No overlap | * | no | spacing |

**Counts before adding:**
- Total T3: 11 (budget: 150 warn / 200 soft / 300 hard) -- plenty of room
- Scopeless (`scope: "*"`): 8 (budget: max 10) -- only 2 slots remain
- Critical (`critical: true`): 2 (budget: max 10) -- plenty of room

## 3 new rules to enforce

1. Empty states show a helpful message and a CTA
2. Error states include a retry mechanism and explanation
3. Modal dialogs are centered and within viewport

## Budget decision

The scopeless budget is the binding constraint. With 8 of 10 slots used, I can only add 2 more scopeless rules. Since all 3 new rules can reasonably be scoped to specific components, I chose to give each a named scope rather than `"*"`:

- **Empty states** -> `scope: "EmptyState"` -- targets the empty state component specifically
- **Error states** -> `scope: "ErrorState"` -- targets the error state component specifically
- **Modal dialogs** -> `scope: "Dialog"` -- targets modal/dialog components specifically

This keeps the scopeless count at 8 (unchanged), well within the max-10 budget.

## New rule details

### Rule 12: Empty states
- **Scope:** EmptyState
- **Group:** states (new group, co-grouped with error states)
- **Priority:** 1 (important for user experience)
- **Critical:** false
- **Instruction:** Verify empty states display a descriptive message and include a visible CTA. Blank area = violation.

### Rule 13: Error states
- **Scope:** ErrorState
- **Group:** states
- **Priority:** 1
- **Critical:** false
- **Instruction:** Verify error states show a human-readable explanation and include a retry mechanism. Missing retry or technical-only message = violation.

### Rule 14: Modal dialogs
- **Scope:** Dialog
- **Group:** layout (joins existing layout group with card aspect ratios and navigation)
- **Priority:** 1
- **Critical:** false
- **Instruction:** Verify modals are centered and do not extend beyond viewport edges. Overflow or off-center = violation.

## Final budget counts

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 11 | 14 | 150 warn | OK |
| Scopeless T3 | 8 | 8 | 10 | OK (no new scopeless added) |
| Critical T3 | 2 | 2 | 10 | OK (no new criticals added) |

## Structural choices

- Created a new section "States and Feedback" to house the empty-state and error-state rules, since they don't fit neatly into existing sections.
- Placed the modal dialog rule under the same new section for proximity, though it shares the `layout` group with existing layout rules (enabling group affinity to pull in related layout checks).
- All 3 new rules use `agent: visual-qa` since they are visual/runtime checks observable in screenshots.
