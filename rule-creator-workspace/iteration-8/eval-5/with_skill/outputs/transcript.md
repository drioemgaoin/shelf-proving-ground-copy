# Transcript: Adding Enforcement Blocks to code-quality.md

## Discovery

Found one rules file to process: `.claude/rules/code-quality.md` (scoped to `src/**/*`).
No existing enforcement blocks in the file. Five rules total, zero pre-existing tier counts.

## Sorting Test — All 5 Rules

### Group 1 of 2: Rules 1-3

| # | Rule | Recommended Tier | Reasoning |
|---|------|-----------------|-----------|
| 1 | Use descriptive variable names that convey purpose and meaning | Human | **Adjective trap.** "Descriptive" is a qualifying adjective requiring judgment. No regex can determine whether a variable name is descriptive enough in context — `x` may be fine in a math loop, terrible in a business function. Removing the adjective gives "use variable names" which is vacuous (trivially satisfied). The adjective IS the core criterion. Reviewers would disagree on what's descriptive enough. Explicitly listed as a Human example in the skill's Step 4. |
| 2 | Functions should do one thing well and have a name that describes that thing | Human | Two qualifying adjectives: "one thing" (single-responsibility principle) and "describes." No syntactic signature — function boundaries are an abstraction-level judgment. "Single responsibility" is explicitly listed as a Human example. Reviewers would disagree on where function boundaries belong. |
| 3 | No unused imports | T1 | Pure syntactic check. ESLint's `no-unused-imports` plugin or TypeScript's `--noUnusedLocals` flag can detect every violation deterministically. No judgment required — either a binding is referenced or it isn't. |

### Group 2 of 2: Rules 4-5

| # | Rule | Recommended Tier | Reasoning |
|---|------|-----------------|-----------|
| 4 | Group imports by source: external packages first, then internal modules | T1 | Syntactic check. ESLint `import/order` can enforce grouping based on import path structure (starts with `.` = internal, otherwise = external). Deterministic, auto-fixable. |
| 5 | Log errors with sufficient context to diagnose the issue in production | Human | **Adjective trap with vacuity guard.** "Sufficient context" is the core qualifying adjective. Tested the "mostly but not entirely" branch: stripping "with sufficient context" leaves "log errors" which is trivially satisfied by any `console.error(err)` call. Since the adjective IS the rule's core criterion (the vacuity guard fires), the adjective trap takes precedence over the syntactic proxy branch. No stable reviewer convergence on what "sufficient" means — it depends on error type, service architecture, and debugging workflows. |

## Enforcement Blocks Generated

All five blocks were appended directly after their rule text in the output file.

## Budget Check

| Budget | Before | After | Status |
|--------|--------|-------|--------|
| Total T3 rules | 0 | 0 | OK (limit: 150 warn) |
| Scopeless T3 | 0 | 0 | OK (limit: 10) |
| Critical T3 | 0 | 0 | OK (limit: 10) |

No T3 rules were added — all five rules classified as either T1 (2 rules) or Human (3 rules). No budget concerns.

## Rule IDs (derived)

- `code-quality:naming:human` (rule 1 — descriptive variable names)
- `code-quality:naming:human` (rule 2 — functions do one thing) *Note: shares heading; parser would need list-item disambiguation*
- `code-quality:imports:t1` (rule 3 — no unused imports)
- `code-quality:imports:t1` (rule 4 — group imports by source) *Note: shares heading; same disambiguation needed*
- `code-quality:error-handling:human` (rule 5 — log errors with context)

## Key Decisions

1. **Three rules classified as Human, not T3.** All three contain qualifying adjectives ("descriptive", "one thing", "sufficient") that are the rule's core criterion. The adjective trap applies in each case: the adjective resisted T1 because it requires judgment, and that same judgment is unstable across reviewers, so it also resists T3.

2. **Rule 5 specifically tested against the "mostly but not entirely" T1 branch.** A regex could catch bare `catch(e) { throw e }` patterns, but the skill's vacuity guard is clear: "log errors" without the qualifier is trivially satisfied by any log call, so the adjective is the core criterion and the adjective trap takes precedence.

3. **Two rules classified as T1** with concrete tooling references (ESLint plugins, TypeScript compiler flags) that are widely available in any TypeScript project.
