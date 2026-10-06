# Rule Creator Transcript

## Task

Classify all rules under "Types" and "Error handling" in `go-standards.md` with enforcement blocks. The user noted that some rules look like they need code understanding but actually have syntactic shortcuts.

## Discovery

Found one rules file: `.claude/rules/go-standards.md` (frontmatter scoped to `**/*.go`).

Existing enforcement blocks: 0 (none in the file).

## Sorting Test — Group 1: Types (2 rules)

### Rule 1: "Use `any` instead of `interface{}`."

**Step 1: Can a tool catch it?**
Yes. `interface{}` is a literal token. A regex `interface\{\}` matches every violation with zero false positives. No context or intent needed — the old syntax is always wrong in modern Go (1.18+).

**Classification: T1**

**Rule ID:** `go-standards:types:t1` (first rule)

---

### Rule 2: "Prefer named return values only when they clarify the function signature. Do not use them just for naked returns."

**Step 1: Can a tool catch it?**
Two parts here:
1. "Do not use them just for naked returns" — naked returns (`return` with no values in a function with named returns) have a clear syntactic signature. The `nakedret` linter catches these. A regex matching a bare `return` statement in a named-return function works.
2. "only when they clarify the function signature" — the word "clarify" is a qualifying adjective. No linter can judge whether named returns add clarity. This is the **adjective trap**.

**Applying the "mostly but not entirely" branch:** The structural part (no naked returns) is independently meaningful. Removing the "clarify" qualifier still leaves a real, enforceable rule. The structural violation (naked return in a named-return function) is worth catching at T1 on its own.

**Classification: T1** (for the naked-return prohibition), with a gap surfaced for the "clarify" judgment.

**Rule ID:** `go-standards:types:t1` (second rule)

---

## Sorting Test — Group 2: Error handling (3 rules)

### Rule 3: "Always check returned errors. Never discard with `_`."

**Step 1: Can a tool catch it?**
Yes. Two syntactic signatures:
1. Assigning an error return to `_` — regex catches `_ = someFunc()` or `_, err` patterns where the error position is `_`.
2. Ignoring error returns entirely — the `errcheck` linter flags any function call whose error return is not captured.

Both are purely syntactic. The linter does not need to understand whether ignoring the error is "safe" — the rule says *never* discard, which is an absolute prohibition.

**Classification: T1**

**Rule ID:** `go-standards:error-handling:t1` (first rule)

---

### Rule 4: "Wrap errors with context using `fmt.Errorf("doing X: %w", err)`."

**Step 1: Can a tool catch it?**
Partially. The `wrapcheck` linter catches the structural violation: returning an error from an external package without wrapping it with `%w`. A regex can also catch `return err` (bare error returns without wrapping) and `fmt.Errorf` calls that don't use `%w`.

The gap: whether the context message ("doing X") is *meaningful* is a judgment call. But removing that qualifier, the rule still stands as "wrap errors with %w" — which is independently meaningful and structurally enforceable.

**Applying the "mostly but not entirely" branch:** The structural wrapping requirement (`%w`) is the enforceable core. The context quality is a gap to surface.

**Classification: T1** (for the wrapping requirement), with a gap surfaced for context message quality.

**Rule ID:** `go-standards:error-handling:t1` (second rule)

---

### Rule 5: "Error messages start with lowercase and do not end with punctuation."

**Step 1: Can a tool catch it?**
Yes. Two syntactic patterns:
1. Error strings starting with uppercase: `errors.New("Something")` or `fmt.Errorf("Something: %w", err)` — regex matches the first character after the opening quote in error-creation calls.
2. Error strings ending with punctuation: regex matches `.` or `!` or `?` before the closing quote.

The `revive` linter has an `error-strings` rule that checks both conventions. This is a Go community convention (per Effective Go), making it a textbook T1 case.

**Classification: T1**

**Rule ID:** `go-standards:error-handling:t1` (third rule)

---

## Summary Table

| # | Rule | Tier | Reasoning | Syntactic shortcut |
|---|------|------|-----------|--------------------|
| 1 | Use `any` instead of `interface{}` | T1 | Literal token match | `interface\{\}` regex |
| 2 | Prefer named return values only when they clarify; no naked returns | T1 (gap: "clarify") | `nakedret` linter catches bare returns | Bare `return` in named-return functions |
| 3 | Always check returned errors, never discard with `_` | T1 | `errcheck` linter, `_` assignment pattern | `_ =` regex + errcheck |
| 4 | Wrap errors with context using `%w` | T1 (gap: context quality) | `wrapcheck` linter catches unwrapped returns | Missing `%w` in fmt.Errorf |
| 5 | Error messages start lowercase, no trailing punctuation | T1 | `revive` error-strings rule | Uppercase after `("` or punctuation before `")` |

## Budget Check

Counts across all discovered rules files (`go-standards.md`):

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 0 | 150 warn / 200 soft / 300 hard | Well within |
| Scopeless T3 | 0 | 10 | Clear |
| Critical T3 | 0 | 10 | Clear |

All five classified rules are T1. No budget concerns.

## Key Insight

The user correctly identified that these rules "look like they need code understanding but actually have syntactic shortcuts." Every rule under Types and Error handling has a syntactic proxy:

- `interface{}` is a literal token, not a semantic concept
- Naked returns are a syntactic pattern (bare `return` statement)
- Unchecked errors are caught by `errcheck` (static analysis)
- Missing `%w` wrapping is a syntactic absence in `fmt.Errorf` calls
- Error string casing/punctuation is character-level pattern matching

Two rules (named returns + error wrapping) have judgment aspects ("clarify" and "meaningful context"), but these are secondary qualifiers on top of independently enforceable structural requirements. The gaps were surfaced as notes in the output file.
