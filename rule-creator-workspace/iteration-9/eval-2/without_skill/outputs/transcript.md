# Transcript: Classifying Go Standards (Types + Error handling)

## Task

Classify all rules under "Types" and "Error handling" in `go-standards.md` with enforcement blocks. The user noted that some rules look like they need code understanding but actually have syntactic shortcuts.

## Discovery

- Input file: `.claude/skills/rule-creator/evals/fixtures/go-project/.claude/rules/go-standards.md`
- Read `references/tier-formats.md` for YAML block templates
- Read `references/worked-examples.md` for calibration (especially the "Tricky: Animation properties" example showing a rule that looks semantic but is syntactic)

## Classification walkthrough

### Types

#### Rule 1: "Use `any` instead of `interface{}`."

- **Sorting test Step 1:** Can a tool catch it? Yes. `interface{}` is a literal token in Go source. A regex `interface\{\}` catches every violation. No judgment needed.
- **Classification: T1**
- **Syntactic shortcut:** Direct string match on the old syntax.

#### Rule 2: "Prefer named return values only when they clarify the function signature. Do not use them just for naked returns."

- **Sorting test Step 1:** "Clarify" is a qualifying adjective (adjective trap). But the second sentence gives a concrete structural prohibition: no naked returns. A naked return is syntactically detectable -- a bare `return` statement in a function with named return values. The structural part ("do not use for naked returns") is independently meaningful without the adjective.
- **Classification: T1** on the syntactic part (naked returns), with a documented gap for the judgment part.
- **Syntactic shortcut:** Grep for bare `return` at statement level. Go's `nakedret` linter also catches this directly.

### Error handling

#### Rule 3: "Always check returned errors. Never discard with `_`."

- **Sorting test Step 1:** Can a tool catch it? Yes. Assigning an error to `_` is syntactically detectable. Pattern: `_ = funcCall()` or similar. Go's `errcheck` linter catches this comprehensively (including implicit discards where the error return isn't even assigned).
- **Classification: T1**
- **Syntactic shortcut:** The `_` discard is a literal token pattern; `errcheck` linter handles the implicit case.

#### Rule 4: "Wrap errors with context using `fmt.Errorf("doing X: %w", err)`."

- **Sorting test Step 1:** Can a tool catch it? Partially. A bare `return err` is syntactically detectable -- it means the error is being returned without any wrapping. Whether the context message is *meaningful* requires judgment, but the structural violation (no wrapping at all) is independently meaningful. Per the SKILL.md "mostly but not entirely" branch: classify at T1 for the enforceable structural part, surface the gap.
- **Classification: T1** with documented gap for message quality.
- **Syntactic shortcut:** Match `return err` (bare error returns without wrapping). Go's `wrapcheck` linter also detects this.

#### Rule 5: "Error messages start with lowercase and do not end with punctuation."

- **Sorting test Step 1:** Can a tool catch it? Yes. The string literal argument to `fmt.Errorf()` and `errors.New()` can be matched with a regex. Check if the first character after the opening quote is uppercase, or if the last character before the closing quote is `.`, `!`, or `?`.
- **Classification: T1**
- **Syntactic shortcut:** Regex on string arguments to error-constructing functions. The `goerr113` / `err113` and custom lint rules catch this.

## Summary

All 5 rules classified as **T1** (deterministic). This confirms the user's intuition: every rule in these two sections has a syntactic shortcut even though some initially appear to require semantic understanding.

| # | Rule | Tier | Syntactic proxy |
|---|------|------|----------------|
| 1 | Use `any` instead of `interface{}` | T1 | Literal string match |
| 2 | Named returns / no naked returns | T1 | Bare `return` statement detection (gap: "clarify" judgment) |
| 3 | Never discard errors with `_` | T1 | `_` assignment pattern / `errcheck` linter |
| 4 | Wrap errors with `%w` | T1 | Bare `return err` detection (gap: context message quality) |
| 5 | Error messages lowercase, no trailing punctuation | T1 | Regex on `fmt.Errorf`/`errors.New` string args |

Two rules (2 and 4) have documented gaps where a judgment aspect exists but the structural part is independently enforceable.

## Files produced

- `go-standards.md` -- copy of input with enforcement blocks added to Types and Error handling sections
- `transcript.md` -- this file
