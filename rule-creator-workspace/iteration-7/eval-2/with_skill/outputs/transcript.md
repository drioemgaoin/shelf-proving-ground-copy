# Rule Creator Transcript — go-standards.md (Types + Error handling)

## Task

Classify all rules under "Types" and "Error handling" in go-standards.md with enforcement blocks. The skill says to look for syntactic shortcuts even when rules sound like they need code understanding.

## Discovery

Only one rules file in scope: `.claude/rules/go-standards.md` (fixture copy).

### Pre-existing enforcement blocks

- Total T1: 0
- Total T2: 0
- Total T3: 0
- Total Human: 0

All rules were bare prose with no enforcement blocks.

## Sorting Test — Types

### Rule 1: "Use `any` instead of `interface{}`."

- **Step 1 — Can a tool catch it?** Yes. The literal token `interface{}` in Go source is always a violation — the `any` alias has been available since Go 1.18. A simple regex `interface\{\}` catches every case.
- **Classification: T1**
- **ID:** `go-standards:types:t1` (first rule)

### Rule 2: "Prefer named return values only when they clarify the function signature. Do not use them just for naked returns."

- **Step 1 — Can a tool catch it?** Partially. The phrase "clarify the function signature" is a judgment call (adjective trap: "clarify"). However, the second sentence — "Do not use them just for naked returns" — has a clear syntactic proxy: a naked `return` statement (return without values) in a function with named returns. Go linters like `nakedret` detect this pattern. The structural violation is detectable; the quality judgment is not.
- **Classification: T1** on the enforceable part (naked returns), with a gap note that the "clarify" judgment is not covered.
- **ID:** `go-standards:types:t1` (second rule)

## Sorting Test — Error handling

### Rule 1: "Always check returned errors. Never discard with `_`."

- **Step 1 — Can a tool catch it?** Yes. Assigning an error to `_` has a syntactic signature: `_ = foo()` or `val, _ := foo()` where the discarded value is an error. The `errcheck` linter catches unchecked errors. A regex can also match `_` in assignment positions paired with function calls.
- **Classification: T1**
- **ID:** `go-standards:error-handling:t1` (first rule)

### Rule 2: "Wrap errors with context using `fmt.Errorf("doing X: %w", err)`."

- **Step 1 — Can a tool catch it?** Partially. A bare `return err` (returning an error without wrapping) is syntactically detectable. The `wrapcheck` linter catches this. However, whether the wrapping context message is *meaningful* is a judgment call. The structural part (`%w` must be present) is enforceable; message quality is not.
- **Classification: T1** on the enforceable part (must use `%w` wrapping, no bare `return err`), with a gap note.
- **ID:** `go-standards:error-handling:t1` (second rule)

### Rule 3: "Error messages start with lowercase and do not end with punctuation."

- **Step 1 — Can a tool catch it?** Yes. A regex can match `errors.New("` or `fmt.Errorf("` followed by an uppercase letter, or error strings ending with `.`, `!`, or `?` before the closing quote. This follows Go convention (per the Go wiki and `golint`/`revive` rules). Pure syntactic check.
- **Classification: T1**
- **ID:** `go-standards:error-handling:t1` (third rule)

## Summary

All 5 rules classified as **T1**. Two rules (named returns, error wrapping) have syntactic proxies that catch the structural violation, with gap notes documenting the judgment aspects that aren't covered.

| # | Section | Rule | Tier | Key insight |
|---|---------|------|------|-------------|
| 1 | Types | Use `any` instead of `interface{}` | T1 | Literal string match |
| 2 | Types | Named returns / no naked returns | T1 (gap) | `nakedret` linter catches naked returns; "clarify" is judgment |
| 3 | Error handling | Always check errors, never `_` | T1 | `errcheck` linter; `_` assignment is syntactic |
| 4 | Error handling | Wrap with `%w` context | T1 (gap) | `wrapcheck` linter; message quality is judgment |
| 5 | Error handling | Lowercase, no trailing punctuation | T1 | Regex on error string literals |

## Budget Check (post-classification)

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 | 0 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

No budget concerns. All new blocks are T1.
