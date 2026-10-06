# Transcript: Adding enforcement blocks to code-quality.md

## Discovery

Rules files found:
- `.claude/rules/code-quality.md` (working copy in outputs)
- `.claude/rules/ui-base.md`
- `.claude/rules/ui-project.md`
- `.claude/rules/visual-rules.md`

Existing enforcement blocks: 3 T3 rules in visual-rules.md, 0 scopeless T3, 0 critical T3.

## Sorting test — all 5 rules

### Rule 1: "Use descriptive variable names that convey purpose and meaning."

- **Step 1 (tool catch?):** No. The adjective trap applies: "descriptive" is a qualifying adjective requiring judgment. A regex cannot judge whether `x` is descriptive enough in context — it would flag false positives on valid code (e.g., loop counters, math variables). The core criterion is a quality judgment, not a syntactic signature.
- **Step 2 (test catch?):** No runtime test for naming quality.
- **Step 3 (LLM judgment?):** Yes, but reviewers would NOT converge. What's "descriptive enough" varies by reviewer, domain, and context. Sliding standard, no objective referent.
- **Step 4:** **Human**.
- Rule ID: `code-quality:naming:Human`

### Rule 2: "Functions should do one thing well and have a name that describes that thing."

- **Step 1 (tool catch?):** No. "One thing well" is the single responsibility principle — a classic judgment call. "Describes that thing" is also subjective naming judgment. No syntactic proxy.
- **Step 2 (test catch?):** No.
- **Step 3 (LLM judgment?):** Yes, but reviewers disagree on what constitutes "one thing" at different abstraction levels. Sliding standard.
- **Step 4:** **Human**.
- Rule ID: `code-quality:naming:Human`

### Rule 3: "No unused imports."

- **Step 1 (tool catch?):** Yes. ESLint `no-unused-imports` and TypeScript's `noUnusedLocals` detect this deterministically. The violation has a clear syntactic signature — an import symbol with zero references in the file.
- **Classification:** **T1**.
- Rule ID: `code-quality:imports:T1`

### Rule 4: "Group imports by source: external packages first, then internal modules."

- **Step 1 (tool catch?):** Yes. `eslint-plugin-import/order` enforces import grouping deterministically. The violation is structural — wrong ordering of import statements. Auto-fixable.
- **Classification:** **T1**.
- Rule ID: `code-quality:imports:T1`

### Rule 5: "Log errors with sufficient context to diagnose the issue in production."

This is the critical rule requiring careful application of the sorting test.

- **Step 1 (tool catch?):** Evaluated the "mostly" branch: could a linter catch the structural part (ensuring errors are logged) while leaving the judgment part ("sufficient context") uncovered?
- **Applied the Guard:** "Removing the adjective still leaves a real, enforceable rule?" Removing "sufficient context" yields "Log errors" — which is satisfied by ANY log call (even `console.log("error")`). The skill explicitly calls out this exact example: "'log errors with sufficient context' -> 'log errors' is satisfied by any log call." The adjective is the rule's core criterion. The Guard says the "mostly" branch does NOT apply. The adjective trap takes precedence.
- **Step 2 (test catch?):** No runtime test can judge context sufficiency.
- **Step 3 (LLM judgment?):** Yes, but "sufficient" is a qualifying adjective with no objective referent. What counts as sufficient diagnostic context (request IDs? stack traces? input values? user context?) varies by error type, domain, and reviewer judgment. Reviewers would not converge on a stable standard.
- **Step 4:** **Human**.
- Rule ID: `code-quality:error-handling:Human`

## Budget check (post-classification)

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 3 | 3 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 0 | 10 | OK |
| Critical T3 | 0 | 0 | 10 | OK |

No new T3 rules were added (0 T3 in this file). All budgets well within limits.

## Actions taken

1. Copied fixture file to outputs directory.
2. Applied the sorting test to all 5 rules.
3. Generated enforcement blocks: 2 T1 (imports), 3 Human (naming x2, error handling).
4. Appended each block after its rule text, indented for bullet-list format.
5. Ran budget checks — all clear.
