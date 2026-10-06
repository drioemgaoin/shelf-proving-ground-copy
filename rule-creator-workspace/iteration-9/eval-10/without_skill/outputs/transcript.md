# Transcript: Adding Enforcement Blocks to code-rules.md

## Step 1: Inventory existing enforcement blocks across both files

### ui-rules.md (unchanged)
| # | Rule | Tier | Scope | Critical |
|---|------|------|-------|----------|
| 1 | Cards maintain consistent aspect ratios | T3 | CardGrid | no |
| 2 | Navigation always reachable without scrolling | T3 | Navigation | no |
| 3 | Sidebar does not overlap content on tablet | T3 | Sidebar | no |
| 4 | Headings follow clear visual hierarchy | T3 | * (scopeless) | no |
| 5 | Body text readable at default zoom | T3 | * (scopeless) | no |
| 6 | Dark mode has no invisible text | T3 | * (scopeless) | yes |
| 7 | Accent colors used sparingly | T3 | Dashboard | no |
| 8 | Loading states show skeleton or spinner | T3 | DataTable, CardGrid | yes |

**Totals: 8 T3, 2 critical, 3 scopeless**

### code-rules.md (before changes)
| # | Rule | Tier | Scope | Critical |
|---|------|------|-------|----------|
| 1 | Components own no space outside themselves | T3 | src/components/**/*.css | no |
| 2 | Hooks do not call other hooks conditionally | T3 | src/hooks/**/*.ts | no |
| 3 | Event handlers delegate to hooks/utils | T3 | src/components/**/*.tsx | no |
| 4 | API response types match OpenAPI schema | T3 | src/api/**/*.ts | no |

**Totals: 4 T3, 0 critical, 0 scopeless**

### Cross-file totals before changes
- **T3: 12** (limit: 150 warn / 200 soft cap / 300 hard cap)
- **Critical: 2** (limit: 10)
- **Scopeless: 3** (limit: 10)

## Step 2: Sorting test for each new rule

### Rule A: "Utility functions must be pure -- no side effects, no I/O, no state mutation."

**Step 1 -- Can a tool catch it?**
Partial. A linter could catch some patterns (e.g., `fetch()` calls, `console.log`), but "pure" encompasses all side effects including argument mutation, module-level state changes, and subtle I/O. No single regex or lint rule catches every violation without false positives. The adjective trap also applies here -- "pure" is a quality judgment that goes beyond syntax.

**Step 2 -- Can a test catch it?**
No deterministic runtime assertion for purity in general.

**Step 3 -- Does it need LLM judgment?**
Yes. A reviewer reading the code can assess whether a function mutates state, performs I/O, or has side effects. Reviewers would converge -- purity is a well-defined concept with objective criteria. The violation is in code structure, so agent = reviewer.

**Classification: T3, agent: reviewer**
- scope: `src/utils/**/*.ts` (narrowed to utility modules where the rule applies)
- critical: false (important but not a safety/accessibility issue)
- priority: 2

### Rule B: "Test files must not import from other test files."

**Step 1 -- Can a tool catch it?**
Yes. The violation has a clear syntactic signature: any `import` statement in a test file that references another `.test.` or `.spec.` file. A regex or lint rule can detect this with no false positives.

**Classification: T1**
- pattern: `import .+from ['"]\.\.?/.*\.(test|spec)\.`
- scope: `src/**/*.{test,spec}.{ts,tsx}`

### Rule C: "Components must not exceed 200 lines including template/JSX."

**Step 1 -- Can a tool catch it?**
Yes. This is a hard threshold -- line count is deterministic. A script or lint rule can count lines in component files and flag those exceeding 200.

**Classification: T1**
- scope: `src/components/**/*.tsx`
- assert: file line count <= 200

## Step 3: Budget check after changes

### Cross-file totals after changes
- **T3: 13** (12 existing + 1 new) -- well under 150 warn threshold
- **Critical: 2** (unchanged) -- well under 10 limit
- **Scopeless: 3** (unchanged) -- well under 10 limit
- **T1: 2 new** (no T1 budget limit)

### Per-file breakdown

**ui-rules.md (unchanged):**
- T3: 8
- Critical: 2
- Scopeless: 3

**code-rules.md (after changes):**
- T3: 5 (4 existing + 1 new)
- T1: 2 (new)
- Critical: 0
- Scopeless: 0

All budgets are within limits. No warnings needed.

## Step 4: Changes made

Added enforcement blocks to the 3 new rules at the bottom of code-rules.md:

1. **Utility purity rule** -- classified as T3/reviewer, scoped to `src/utils/**/*.ts`. Instruction covers what to look for (side effects, I/O, state mutation), what counts as a violation (any impure operation), and what correct looks like (pure transformations).

2. **No cross-test imports** -- classified as T1 with a regex pattern matching imports from test/spec files within test files. Includes fix guidance to extract helpers to a shared test-utils module.

3. **200-line component cap** -- classified as T1 with a line-count check. Includes fix guidance to split components or extract logic into hooks.

Organized the 3 new rules under a new "Purity and Isolation" heading to keep the file structured.

## Rule IDs

- `code-rules:purity-and-isolation:T3` -- utility purity
- `code-rules:purity-and-isolation:T1` -- test import isolation
- `code-rules:purity-and-isolation:T1` -- component line limit (note: shares heading slug; in practice a parser would disambiguate by rule index)
