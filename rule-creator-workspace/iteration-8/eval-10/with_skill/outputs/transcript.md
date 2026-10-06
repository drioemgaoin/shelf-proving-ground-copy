# Transcript: Adding enforcement blocks to 3 new rules in code-rules.md

## Discovery

Found two rules files:
- `.claude/rules/ui-rules.md` (scoped to `src/components/**/*`)
- `.claude/rules/code-rules.md` (scoped to `src/**/*`)

## Pre-edit inventory (cross-file budget count)

### ui-rules.md
| Metric | Count | Details |
|--------|-------|---------|
| T3 blocks | 8 | CardGrid aspect ratios, Navigation reachable, Sidebar overlap, Headings hierarchy, Body text readable, Dark mode invisible text, Accent colors, Loading states |
| Critical | 2 | Dark mode invisible text, Loading states |
| Scopeless (`scope: "*"`) | 3 | Headings hierarchy, Body text readable, Dark mode invisible text |

### code-rules.md (before edits)
| Metric | Count | Details |
|--------|-------|---------|
| T3 blocks | 4 | Component spacing, Conditional hooks, Event handler logic, API response types |
| Critical | 0 | — |
| Scopeless | 0 | — |

### Cross-file totals (before)
| Budget | Current | Limit |
|--------|---------|-------|
| Total T3 | 12 | 150 warn / 200 soft / 300 hard |
| Scopeless T3 | 3 | 10 |
| Critical T3 | 2 | 10 |

## Sorting test for each new rule

### Rule 1: "Utility functions must be pure — no side effects, no I/O, no state mutation."

**Step 1 — Can a tool catch it?**
No. A regex could catch obvious I/O calls like `fetch` or `console.log`, but cannot detect all forms of side effects (e.g., mutating a parameter object, writing to a closure variable). The rule's core criterion — "pure" — requires understanding what the function does, not just its syntax.

**Step 2 — Can a test catch it?**
No. There is no deterministic runtime assertion for function purity.

**Step 3 — Does it need LLM judgment?**
Yes. A reviewer needs to read the function body and determine whether it has side effects. Reviewers would converge — side effects are objective (does the function write to external state or perform I/O, or not). The violation is in code structure, not screenshots.

**Classification: T3 (reviewer)**

Scope: `src/utils/**/*.ts` — narrowed to utility files only, which is where the rule applies. Not scopeless.

### Rule 2: "Test files must not import from other test files."

**Step 1 — Can a tool catch it?**
Yes. An import statement in a `.test.ts` or `.spec.ts` file that resolves to another `.test.ts` or `.spec.ts` file has a clear syntactic signature. A regex or lint rule can match import paths containing `.test` or `.spec` within test files.

**Classification: T1 (deterministic)**

Scope: `src/**/*.{test,spec}.{ts,tsx}` — only test files need checking.

### Rule 3: "Components must not exceed 200 lines including template/JSX."

**Step 1 — Can a tool catch it?**
Yes. This is a hard numeric threshold — 200 lines. A lint rule or script can count lines in component files. The "hard threshold with a soft qualifier" branch does not apply here because there is no soft qualifier; 200 lines is the entire rule.

**Classification: T1 (deterministic)**

Scope: `src/components/**/*.tsx` — only component files.

Note on the gap: the line-count check does not evaluate whether the extracted sub-components are "well-structured." If the team wants to enforce that, it would be a separate rule at T3 or Human tier.

## Post-edit budget check

### code-rules.md (after edits)
| Metric | Count | Details |
|--------|-------|---------|
| T3 blocks | 5 | +1 (utility function purity) |
| T1 blocks | 2 | +2 (test imports, component line count) |
| Critical | 0 | — |
| Scopeless | 0 | — |

### Cross-file totals (after)
| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 12 | 13 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 3 | 3 | 10 | OK (no new scopeless added) |
| Critical T3 | 2 | 2 | 10 | OK (no new critical added) |

All budgets well within limits.

## Rule IDs (implicit, derived from location)

| Rule | ID |
|------|-----|
| Utility functions must be pure | `code-rules:new-rules-to-add:T3` |
| Test files must not import from other test files | `code-rules:new-rules-to-add:T1` |
| Components must not exceed 200 lines | `code-rules:new-rules-to-add:T1` |

Note: Two rules share the same heading slug and tier prefix. If the heading is restructured (e.g., moving rules under their own subheadings), the IDs will become unique. This is a minor issue with the current "NEW RULES TO ADD" heading grouping both T1 rules.
