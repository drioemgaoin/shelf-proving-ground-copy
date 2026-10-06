# Rule Creator Transcript: code-quality.md enforcement blocks

## Discovery

Found rules files in `.claude/rules/`:
- `ui-project.md`
- `ui-base.md`
- `visual-rules.md` (3 existing T3 blocks)
- `code-quality.md` (target file, no enforcement blocks)
- `team-standards.md`

Existing enforcement block counts:
- T1: 0
- T2: 0
- T3: 3 (all in visual-rules.md)
- Human: 0
- Scopeless T3: 0
- Critical T3: 0

## Sorting Test: Group 1 of 2 (Rules 1-3)

### Rule 1: "Use descriptive variable names that convey purpose and meaning."

**Step 1 - Can a tool catch it?** No. "Descriptive" is a qualifying adjective (adjective trap). No regex can judge whether a variable name conveys sufficient purpose. Removing "descriptive" leaves "use variable names" which is vacuous -- the adjective IS the core criterion. Not T1.

**Step 2 - Can a test catch it?** No deterministic runtime assertion for "descriptive." Not T2.

**Step 3 - Does it need LLM judgment?** Yes, but reviewers would disagree on what's "descriptive enough." The standard slides by reviewer and domain context.

**Step 4 - Human.** Classification: **Human**

### Rule 2: "Functions should do one thing well and have a name that describes that thing."

**Step 1 - Can a tool catch it?** No. "One thing well" is inherently subjective -- the single-responsibility principle. No syntactic signature. Not T1.

**Step 2 - Can a test catch it?** No runtime pass/fail for "does one thing well." Not T2.

**Step 3 - Does it need LLM judgment?** Yes, but this is the canonical example of a rule where reviewers disagree. What constitutes "one thing" depends on abstraction level, context, and team norms.

**Step 4 - Human.** Classification: **Human**

### Rule 3: "No unused imports."

**Step 1 - Can a tool catch it?** Yes. ESLint's `no-unused-imports` rule and TypeScript's `--noUnusedLocals` flag detect every unused import deterministically. The violation has a clear syntactic signature: an import symbol with zero references in the file.

Classification: **T1**

## Sorting Test: Group 2 of 2 (Rules 4-5)

### Rule 4: "Group imports by source: external packages first, then internal modules."

**Step 1 - Can a tool catch it?** Yes. `eslint-plugin-import` with the `import/order` rule can enforce grouping and ordering. The distinction between external packages (in `node_modules`) and internal modules (relative or aliased paths) is deterministic.

Classification: **T1**

### Rule 5: "Log errors with sufficient context to diagnose the issue in production."

**Step 1 - Can a tool catch it?** "Sufficient context" is a qualifying adjective. A linter could catch bare `console.error(err)` calls, but per the vacuity guard: "log errors" without "sufficient context" is trivially satisfied by any log call. The adjective IS the rule's core criterion and cannot be removed without making the rule vacuous. Not T1.

**Step 2 - Can a test catch it?** No deterministic test for "sufficient context." Not T2.

**Step 3 - Does it need LLM judgment?** Yes, but "sufficient context" is subjective -- what's sufficient depends on the error scenario, the production environment, and the reviewer's operational experience. Reviewers would not converge.

**Step 4 - Human.** Classification: **Human**

## Enforcement Blocks Generated

All 5 enforcement blocks were appended to the rules in the output file.

## Budget Check (Post-Addition)

Aggregated across all discovered rules files:

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 3 | 3 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 0 | 10 | OK |
| Critical T3 | 0 | 0 | 10 | OK |

Per-file breakdown:
- `visual-rules.md`: 3 T3 (unchanged)
- `code-quality.md`: 0 T3, 2 T1, 3 Human (new)
- `ui-project.md`: 0 enforcement blocks
- `ui-base.md`: 0 enforcement blocks
- `team-standards.md`: 0 enforcement blocks

No budget concerns.

## Rule IDs

- `code-quality:naming:Human` (descriptive variable names)
- `code-quality:naming:Human` (functions do one thing)
- `code-quality:imports:T1` (no unused imports)
- `code-quality:imports:T1` (group imports by source)
- `code-quality:error-handling:Human` (log errors with context)
