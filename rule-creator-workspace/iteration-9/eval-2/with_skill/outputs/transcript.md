# Rule Creator Transcript

## Task

Classify all rules under "Types" and "Error handling" in `go-standards.md` with enforcement blocks. The user noted that some rules look like they need code understanding but actually have syntactic shortcuts.

## Discovery

Found one rules file: `go-standards.md` (scoped to `**/*.go`).

Existing enforcement blocks: 0 (none in any tier).

## Sorting Test: Group 1 (all 5 rules)

### Rule 1: Use `any` instead of `interface{}`

- **Step 1 — Can a tool catch it?** Yes. A regex matches the literal string `interface{}`. Every occurrence is a violation regardless of context. The skill explicitly lists this as a Go T1 example.
- **Classification: T1**
- **ID:** `go-standards:types:T1`

### Rule 2: Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

- **Step 1 — Can a tool catch it?** Partially. The "naked returns" part has a syntactic proxy: a linter or regex can detect bare `return` statements in functions with named return values. The "clarify" part is a qualifying adjective (adjective trap) requiring judgment. Applying the "Mostly, but not entirely" branch: the structural part (no naked returns) is independently meaningful — removing the adjective still leaves a real, enforceable rule.
- **Classification: T1** (with gap surfaced: whether named returns "clarify" the signature is judgment, not enforceable by T1)
- **ID:** `go-standards:types:T1`

### Rule 3: Always check returned errors. Never discard with `_`.

- **Step 1 — Can a tool catch it?** Yes. The `errcheck` linter catches unchecked errors. A regex can also match patterns like `_ = someFunc()` or `, _ :=` at error return positions. This is explicitly listed as a Go T1 example in the skill (unchecked errors).
- **Classification: T1**
- **ID:** `go-standards:error-handling:T1`

### Rule 4: Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

- **Step 1 — Can a tool catch it?** Partially. Linters (`errorlint`, `wrapcheck`) detect bare `return err` without wrapping via `%w`. The structural part (use `%w` wrapping) is syntactically detectable. Whether the context message is *meaningful* requires judgment. Per the "Mostly, but not entirely" branch: "wrap errors" stands alone as independently meaningful without the context quality aspect. The skill calls out this exact example: "wrap errors with context — linter catches missing %w, but not whether the context message is meaningful."
- **Classification: T1** (with gap surfaced: quality of context message not covered)
- **ID:** `go-standards:error-handling:T1`

### Rule 5: Error messages start with lowercase and do not end with punctuation.

- **Step 1 — Can a tool catch it?** Yes. A regex matches `fmt.Errorf("` or `errors.New("` followed by an uppercase letter, or error strings ending with `.`, `!`, `?` before the closing quote. Go linters (`staticcheck` ST1005, `revive`) enforce this exact convention deterministically.
- **Classification: T1**
- **ID:** `go-standards:error-handling:T1`

## Summary

| # | Rule | Tier | Key insight |
|---|------|------|-------------|
| 1 | Use `any` instead of `interface{}` | T1 | Literal string match |
| 2 | Named returns / no naked returns | T1 | Naked returns are syntactically detectable; "clarify" is a gap |
| 3 | Always check returned errors | T1 | `errcheck` linter catches this |
| 4 | Wrap errors with `%w` | T1 | `errorlint`/`wrapcheck` catch missing `%w`; context quality is a gap |
| 5 | Error messages lowercase, no trailing punctuation | T1 | Regex on error string literals; `staticcheck` ST1005 |

All 5 rules classified as T1. Two rules (2 and 4) use the "Mostly, but not entirely" branch where the structural part is independently enforceable but a judgment gap exists. Gaps are documented inline.

## Budget Check

Aggregated across all discovered rules files (1 file: `go-standards.md`):

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 0 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

Per-file breakdown:
- `go-standards.md`: 5x T1, 0x T2, 0x T3, 0x Human
