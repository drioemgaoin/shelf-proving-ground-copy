# Transcript: Multi-File Budget Enforcement Block Addition

## Task
Add enforcement blocks to the 3 new rules at the bottom of `code-rules.md`, counting budgets across both `ui-rules.md` and `code-rules.md`.

## Budget Analysis (Cross-File)

### Before (existing rules)

| Metric        | ui-rules.md | code-rules.md | Total |
|---------------|-------------|---------------|-------|
| T3 blocks     | 8           | 4             | 12    |
| Critical      | 2           | 0             | 2     |
| Scopeless (*) | 3           | 0             | 3     |

### After (with 3 new enforcement blocks)

| Metric        | ui-rules.md | code-rules.md | Total |
|---------------|-------------|---------------|-------|
| T3 blocks     | 8           | 7             | 15    |
| Critical      | 2           | 0             | 2     |
| Scopeless (*) | 3           | 0             | 3     |

All 3 new rules received specific scopes (no wildcard), keeping scopeless count unchanged. None were marked critical. The total of 15 T3 blocks is within reasonable limits.

## Rules Added

### 1. Utility functions must be pure
- **Agent:** reviewer
- **Scope:** `src/utils/**/*.ts` -- targets utility files specifically
- **Group:** architecture
- **Priority:** 2
- **Critical:** false
- **Instruction:** Checks for side effects (console.log, fetch, DOM access, global mutation); expects pure functions.
- **Triage hint:** "Utility function has side effects"

### 2. Test files must not import from other test files
- **Agent:** reviewer
- **Scope:** `src/**/*.test.{ts,tsx}` -- targets test files across the project
- **Group:** testing
- **Priority:** 2
- **Critical:** false
- **Instruction:** Checks that test files don't import from other `.test.ts`/`.test.tsx` files; shared utilities belong in helper/fixture modules.
- **Triage hint:** "Test file imports from another test file"

### 3. Components must not exceed 200 lines
- **Agent:** reviewer
- **Scope:** `src/components/**/*.tsx` -- targets component files
- **Group:** architecture
- **Priority:** 3
- **Critical:** false
- **Instruction:** Checks file length and recommends extraction if over 200 lines.
- **Triage hint:** "Component file exceeds 200 lines"

## Design Decisions

1. **All new rules use `reviewer` agent** -- consistent with the existing code-rules.md pattern (all existing rules use reviewer, not visual-qa).
2. **All new rules include `triage_hint`** -- consistent with the existing code-rules.md pattern (all 4 existing rules have triage_hint).
3. **No new critical rules** -- none of these are safety/visibility-critical; they are code quality rules. This keeps the critical count at 2 total.
4. **No new scopeless rules** -- each rule has a specific file glob scope, avoiding the wildcard `*` pattern. This keeps scopeless at 3 total.
5. **Organized under a new section** -- the 3 new rules were grouped under "Purity and Isolation" rather than left under the "NEW RULES TO ADD" placeholder heading, since they now have enforcement blocks and are full rules.
6. **Priorities assigned contextually** -- purity (p2) and test isolation (p2) are moderately important; file length (p3) is a softer guideline.
