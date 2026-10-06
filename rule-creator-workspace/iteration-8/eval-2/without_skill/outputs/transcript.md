# Transcript: Classifying Go Standards Rules (Types + Error Handling)

## Task

Classify every rule under the "Types" and "Error handling" sections of `go-standards.md` with enforcement blocks. Focus on identifying which rules look like they need deep code understanding but actually have syntactic shortcuts.

## Analysis

### Types

#### Rule 1: "Use `any` instead of `interface{}`"

**Classification: grep**

This is a pure textual substitution rule. `interface{}` is a literal token that can be matched with a regex. Every occurrence is a violation; every fix is mechanical.

- Pattern: `interface\{\}`
- No false positives in Go source -- `interface{}` is always the empty interface.
- `any` is the alias introduced in Go 1.18; they are semantically identical.

#### Rule 2: "Prefer named return values only when they clarify the function signature. Do not use them just for naked returns."

**Classification: review**

This rule has two parts:
1. "clarify the function signature" -- pure judgment call, no syntactic signal.
2. "Do not use for naked returns" -- a naked return (`return` with no values in a function with named returns) IS syntactically detectable.

The naked-return part could be a grep shortcut (`return$` inside functions with named returns), but the full rule requires understanding whether the named returns add clarity. Because the primary intent is a design guideline, the enforcement is `review` with a grep shortcut noted.

### Error handling

#### Rule 1: "Always check returned errors. Never discard with `_`."

**Classification: lint**

At first glance this seems to require understanding which function calls return errors. But there are two strong syntactic shortcuts:

1. **Grep shortcut:** `, _ :=` and `, _ =` patterns catch the explicit discard case. This covers the "never discard with `_`" part directly.
2. **Lint tool:** `errcheck` from golangci-lint catches unchecked errors comprehensively, including cases where the error return is silently ignored (not even assigned).

The lint tool is the proper enforcement because grep only catches the explicit `_` discard, not the implicit ignore (e.g., `os.Remove(path)` with no assignment at all). But the grep shortcut is fast and catches the most egregious violations.

#### Rule 2: "Wrap errors with context using `fmt.Errorf(\"doing X: %w\", err)`"

**Classification: lint**

This looks like it needs understanding of error flow, but the most common violation -- `return err` without wrapping -- is a simple syntactic pattern.

1. **Grep shortcut:** `return err$` catches bare error returns. High signal, low noise.
2. **Lint tool:** `wrapcheck` from golangci-lint does this comprehensively, tracking which errors originate from external packages and need wrapping.

Classified as `lint` because the grep shortcut has edge cases (e.g., `return err` might be acceptable when the error is already wrapped higher up, or when returning a sentinel error).

#### Rule 3: "Error messages start with lowercase and do not end with punctuation"

**Classification: grep**

This is fully syntactic. Error strings in Go appear in two patterns:
- `fmt.Errorf("...")`
- `errors.New("...")`

The first character after the opening quote must be lowercase. The character before the closing quote (or before the format verb) must not be punctuation.

- Pattern for uppercase start: `fmt\.Errorf\("[A-Z]` or `errors\.New\("[A-Z]`
- Pattern for trailing punctuation: `[.!?]"\)` in error constructors
- Very few false positives -- Go convention is well-established here.

## Summary Table

| # | Rule | Looks like | Actually | Enforcement | Shortcut |
|---|------|-----------|----------|-------------|----------|
| T1 | Use `any` not `interface{}` | Syntactic | Syntactic | grep | `interface\{\}` |
| T2 | Named returns only for clarity | Semantic | Semantic (partial syntactic) | review | grep `return$` for naked returns |
| E1 | Check errors, never `_` | Semantic | Lint + syntactic | lint (errcheck) | grep `, _ :=` |
| E2 | Wrap errors with %w | Semantic | Lint + syntactic | lint (wrapcheck) | grep `return err$` |
| E3 | Lowercase error messages, no punctuation | Syntactic | Syntactic | grep | `Errorf\("[A-Z]` |
