# Rule Creator Transcript — eval-10

## Task

Add enforcement blocks to the 3 new rules at the bottom of `code-rules.md`, counting budgets across both `ui-rules.md` and `code-rules.md`.

## Discovery

Two rules files found:
- `ui-rules.md` — 8 T3 blocks, 2 critical, 3 scopeless (`scope: "*"`)
- `code-rules.md` — 4 T3 blocks, 0 critical, 0 scopeless

**Pre-existing totals:** 12 T3, 2 critical, 3 scopeless.

## Sorting Test for Each New Rule

### Rule 1: "Utility functions must be pure — no side effects, no I/O, no state mutation."

- **Step 1 (T1 — can a tool catch it?):** Partially. A linter could flag obvious I/O calls (fetch, fs, console) but cannot determine purity through call chains or indirect mutations. The concept of "pure" requires understanding function behavior beyond syntax.
- **Step 2 (T2 — can a test catch it?):** No. There is no deterministic runtime assertion for function purity in general.
- **Step 3 (T3 — LLM judgment?):** Yes. A code reviewer can read a utility function and identify side effects. Reviewers would converge — side effects are objective (the function either calls I/O or it doesn't).
- **Classification: T3, agent: reviewer, scope: `src/utils/**/*.ts`**

### Rule 2: "Test files must not import from other test files."

- **Step 1 (T1 — can a tool catch it?):** Yes. The violation has a clear syntactic signature: an import statement in a test file whose path contains `.test.` or `.spec.`. A regex or lint rule catches every violation with zero false positives.
- **Classification: T1**

### Rule 3: "Components must not exceed 200 lines including template/JSX."

- **Step 1 (T1 — can a tool catch it?):** Yes. This is a hard numeric threshold — count lines in component files and flag any exceeding 200. No judgment required; pure arithmetic.
- **Classification: T1**

## Budget Check (After)

Counted across both `ui-rules.md` and `code-rules.md`:

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 12 | 13 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 3 | 3 | 10 max | OK |
| Critical T3 | 2 | 2 | 10 max | OK |

### Per-file breakdown

**ui-rules.md:** 8 T3 (unchanged)
- Scopeless: 3 (headings hierarchy, body text, dark mode invisible text)
- Critical: 2 (dark mode invisible text, loading states)

**code-rules.md:** 5 T3 (was 4, +1 for utility purity), 2 T1 (new)
- Scopeless: 0
- Critical: 0

## Rule IDs (derived)

- `code-rules:purity-and-isolation:T3` — utility purity
- `code-rules:purity-and-isolation:T1` — test file imports (first T1 in section)
- `code-rules:purity-and-isolation:T1` — component line count (second T1 in section)

## Actions Taken

1. Copied both source files to outputs directory.
2. Applied the sorting test to each of the 3 new rules.
3. Added enforcement blocks to all 3 rules in `code-rules.md`.
4. Verified budget totals across both files remain within all limits.
5. `ui-rules.md` left unchanged (no modifications needed).
