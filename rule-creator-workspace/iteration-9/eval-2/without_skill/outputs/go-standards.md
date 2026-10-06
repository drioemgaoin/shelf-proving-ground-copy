---
paths: "**/*.go"
---

# Go Standards

## Types

- Use `any` instead of `interface{}`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "interface\\{\\}"
    assert: "No use of interface{} — use the any alias instead"
    scope: "**/*.go"
    fix: "Replace interface{} with any"
  ```

- Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

  ```yaml
  enforcement:
    tier: T1
    pattern: "^\\treturn$"
    assert: "No naked returns in functions with named return values"
    scope: "**/*.go"
    fix: "Replace naked return with explicit return values, or remove named return values from the signature"
  ```

  > **Gap:** The qualitative aspect ("when they clarify the function signature") requires judgment that a regex cannot evaluate. The enforcement block catches the syntactic violation — naked returns — which is the independently meaningful structural rule. If the team wants "clarify" enforced, that would be a separate Human-tier rule.

## Error handling

- Always check returned errors. Never discard with `_`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\b_ = .*\\(|\\b_,? err\\b.*=.*\\("
    assert: "No discarding errors with _ — all returned errors must be checked"
    scope: "**/*.go"
    fix: "Handle the error: check it, wrap it, or return it"
  ```

  > **Note:** Go's `errcheck` linter catches this comprehensively, including cases where an error return is silently ignored without even assigning to `_`. The regex pattern above catches explicit `_` discards; pair with `errcheck` in the linter config for full coverage.

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "return err\\b(?!or)"
    assert: "Errors are wrapped with context using fmt.Errorf and %w, not returned bare"
    scope: "**/*.go"
    fix: "Replace bare return err with return fmt.Errorf(\"doing X: %w\", err) with appropriate context"
  ```

  > **Gap:** The pattern catches bare `return err` statements (the structural violation). Whether the wrapping message provides *meaningful* context is a judgment call that this pattern cannot evaluate. If message quality matters, add a separate T3 reviewer rule.

- Error messages start with lowercase and do not end with punctuation.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(fmt\\.Errorf|errors\\.New)\\(\"[A-Z]|(fmt\\.Errorf|errors\\.New)\\(\"[^\"]*[.!?]\""
    assert: "Error strings start with lowercase and do not end with punctuation"
    scope: "**/*.go"
    fix: "Lowercase the first letter of the error string and remove trailing punctuation"
  ```

## Concurrency

- Never share mutable state between goroutines without synchronization.
- Prefer channels over mutexes when the communication pattern is a pipeline.
- Context propagation is mandatory for all functions that do I/O.

## Structure

- One package per directory. Package name matches directory name.
- Exported functions have doc comments starting with the function name.
- Keep function complexity below 15 (cyclomatic complexity).

## Testing

- Table-driven tests for functions with more than 2 input variations.
- Benchmark any function expected to handle >1000 calls/second.
