# Transcript: Multi-file Budget Enforcement

## Task

Add enforcement blocks to the 3 new rules at the bottom of `code-rules.md`, counting budgets across both `ui-rules.md` and `code-rules.md`.

## Input Analysis

### ui-rules.md (before)
- **T3 blocks:** 8
- **Critical:** 2 (dark mode invisible text, loading states)
- **Scopeless (`scope: "*"`):** 3 (headings hierarchy, body text readability, dark mode invisible text)
- **Groups used:** layout, typography, theming, interaction
- **Agent:** visual-qa (all 8)

### code-rules.md (before)
- **T3 blocks:** 4
- **Critical:** 0
- **Scopeless:** 0 (all have specific file-glob scopes)
- **Groups used:** layout, hooks, architecture, contracts
- **Agent:** reviewer (all 4)

### Cross-file totals (before)
- **Total T3:** 12
- **Total critical:** 2
- **Total scopeless:** 3

## 3 New Rules to Enforce

1. **Utility functions must be pure** -- no side effects, no I/O, no state mutation.
2. **Test files must not import from other test files.**
3. **Components must not exceed 200 lines** including template/JSX.

## Design Decisions

### Agent selection
All three rules are code-level structural concerns, not visual. Agent: `reviewer` (consistent with existing code-rules.md patterns).

### Scope selection
Each rule targets a specific file pattern rather than using `scope: "*"`:
- Rule 1: `src/utils/**/*.ts` -- purity applies to utility modules specifically
- Rule 2: `src/**/*.test.{ts,tsx}` -- targets test files directly
- Rule 3: `src/components/**/*.tsx` -- component size is a component concern

This keeps the scopeless count at 3 (all in ui-rules.md), unchanged.

### Critical designation
None of the three new rules are critical. They are structural quality rules, not correctness/safety concerns like invisible text or missing loading states. Critical count stays at 2.

### Priority assignment
- Rule 1 (pure utils): priority 1 -- purity violations cause hard-to-debug issues
- Rule 2 (test imports): priority 2 -- code smell but not immediately dangerous
- Rule 3 (component size): priority 3 -- advisory, large components still work

### Group assignment
- Rule 1: `architecture` -- structural concern about function purity
- Rule 2: `testing` -- new group for test-specific rules
- Rule 3: `architecture` -- structural concern about component size

### Section organization
The 3 new rules were placed under a new `## Purity and Isolation` section heading rather than under `## Structure`, to keep sections focused and avoid one overly long section. The heading was removed from the original "NEW RULES TO ADD" marker.

## Cross-file Totals (after)

| Metric     | ui-rules.md | code-rules.md | Total |
|------------|-------------|---------------|-------|
| T3 blocks  | 8           | 7             | 15    |
| Critical   | 2           | 0             | 2     |
| Scopeless  | 3           | 0             | 3     |

## Validation

- All enforcement blocks follow the existing YAML schema (tier, agent, scope, instruction, triage_hint, group, priority, critical)
- No new critical flags added (budget-safe)
- No new scopeless rules added (budget-safe)
- T3 count increased from 12 to 15 (within reasonable limits)
- Each new block has a `triage_hint` field matching the pattern in existing code-rules.md blocks
- Frontmatter preserved unchanged in both files
