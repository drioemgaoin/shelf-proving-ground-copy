# Transcript: Adding enforcement blocks under budget pressure

## Task

Add T3 enforcement blocks to 3 new rules at the bottom of a UI rules file that already has 11 T3 blocks, with budget constraints.

## Analysis of existing state

### Existing T3 blocks: 11

| # | Rule | Scope | Critical | Group |
|---|------|-------|----------|-------|
| 1 | Card aspect ratios | CardGrid | false | layout |
| 2 | Navigation reachable | Navigation | false | layout |
| 3 | Heading hierarchy | * | false | typography |
| 4 | Body text min size | * | false | typography |
| 5 | Line length | ContentArea | false | typography |
| 6 | Dark mode contrast | * | true | theming |
| 7 | Accent color limit | * | false | theming |
| 8 | Hover effects | * | false | interaction |
| 9 | Disabled elements | * | false | interaction |
| 10 | Loading states | * | true | interaction |
| 11 | No overlap | * | false | spacing |

### Budget status BEFORE adding new rules

| Budget | Current | Limit | Headroom |
|--------|---------|-------|----------|
| Total T3 | 11 | 150 warn / 200 soft / 300 hard | Comfortable |
| Scopeless (scope: "*") | 8 | 10 | 2 remaining |
| Critical | 2 | 10 | 8 remaining |

### Key constraint: Scopeless budget

With 8 out of 10 scopeless slots used, adding 3 more scopeless rules would exceed the budget (11 > 10). All 3 new rules can be given specific component scopes, so I assigned named scopes to avoid budget pressure.

## Decisions for new rules

### Rule 1: Empty states

- **Scope:** `EmptyState` (not `*`) -- empty states are a specific component/view, not a global concern
- **Group:** `states` -- new group for state-related rules
- **Priority:** 1 -- empty states are a core UX concern
- **Critical:** false -- not a safety/accessibility issue
- **Agent:** visual-qa -- this is a visual check

### Rule 2: Error states

- **Scope:** `ErrorState` (not `*`) -- error states are a specific component/view
- **Group:** `states` -- same group as empty states for group affinity
- **Priority:** 1 -- error recovery is important UX
- **Critical:** false -- not a safety/accessibility issue
- **Agent:** visual-qa -- this is a visual check

### Rule 3: Modal dialogs

- **Scope:** `Dialog` (not `*`) -- modals are a specific component
- **Group:** `layout` -- centering/overflow is a layout concern
- **Priority:** 1 -- viewport overflow is a significant usability issue
- **Critical:** false -- not a safety/accessibility issue
- **Agent:** visual-qa -- this is a visual check

## Budget status AFTER adding new rules

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 11 | 14 | 150 warn | Well within limits |
| Scopeless (scope: "*") | 8 | 8 | 10 | Unchanged -- all 3 new rules have named scopes |
| Critical | 2 | 2 | 10 | Unchanged -- no new critical rules added |

## File breakdown

| File | T3 count | Scopeless | Critical |
|------|----------|-----------|----------|
| ui-rules.md | 14 | 8 | 2 |
| **Aggregated total** | **14** | **8** | **2** |

All budgets remain within safe limits. No warnings triggered.

## Structural changes

- Renamed the "NEW RULES TO ADD" section to "States and Dialogs" to match the project's heading convention.
- Each new rule received a full T3 enforcement block following the existing format.

## Output

- `ui-rules.md` -- the complete updated rules file with all 14 enforcement blocks.
