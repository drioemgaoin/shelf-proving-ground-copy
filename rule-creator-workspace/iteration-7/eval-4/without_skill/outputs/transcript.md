# Transcript: Adding Enforcement Blocks Under Budget Pressure

## Initial Analysis

**Existing T3 blocks: 11**
- 2 critical: dark mode text visibility, loading states
- 8 scopeless (scope: `*`): headings hierarchy, body text size, dark mode text, accent colors, hover effects, disabled elements, loading states, element overlap
- 3 scoped: CardGrid (aspect ratios), Navigation (reachability), ContentArea (line length)

**Budget situation:**
- Typical T3 budget is ~15 blocks
- Already at 11 — adding 3 brings total to 14, just under ceiling
- 8 of 11 existing blocks use scope `*` (scopeless), which is expensive because visual-qa runs them on every component
- Adding more scopeless blocks would increase visual-qa runtime significantly

## Decisions for the 3 New Rules

### Rule 1: Empty states show a helpful message and CTA
- **Scope:** `EmptyState` (not `*`) — empty states are a specific UI pattern, not something to check on every component. Scoping reduces visual-qa cost.
- **Group:** `states` — new group for state-related checks, distinct from `interaction` which covers hover/disabled/loading
- **Priority:** 1 — empty states are a core UX concern; users hitting a blank screen is a usability failure
- **Critical:** false — not a showstopper like invisible text or missing loading indicators

### Rule 2: Error states include retry and explanation
- **Scope:** `ErrorState` (not `*`) — same rationale as empty states; error UIs are a specific pattern
- **Group:** `states` — consistent with Rule 1
- **Priority:** 1 — error handling is fundamental to user experience
- **Critical:** false — important but not at the same severity level as the existing critical rules (invisible text, blank loading)

### Rule 3: Modal dialogs centered and within viewport
- **Scope:** `Dialog` (not `*`) — modals are a specific component type; no need to check centering on every element
- **Group:** `layout` — fits naturally with the existing layout group (card aspect ratios, navigation reachability)
- **Priority:** 1 — modals overflowing the viewport is a significant layout failure
- **Critical:** false — visually broken but not data-loss or inaccessibility level

## Budget Impact Summary

| Metric | Before | After | Budget |
|--------|--------|-------|--------|
| Total T3 blocks | 11 | 14 | ~15 |
| Critical blocks | 2 | 2 | unchanged |
| Scopeless (`*`) blocks | 8 | 8 | unchanged |
| Scoped blocks | 3 | 6 | +3 scoped |

Key budget-conscious choices:
1. All 3 new rules use specific scopes (`EmptyState`, `ErrorState`, `Dialog`) rather than `*`, keeping the scopeless count at 8
2. No new critical flags added — the 2 existing criticals (dark mode, loading) remain the only ones
3. Total T3 count reaches 14, staying within the ~15 budget ceiling

## Structural Changes
- Added a new `## States and Feedback` section to house the empty-state and error-state rules
- Placed the modal dialog rule under the same section for proximity, though its group is `layout` to align with the existing layout group
- Removed the `## NEW RULES TO ADD (no enforcement yet)` header since all rules now have enforcement
