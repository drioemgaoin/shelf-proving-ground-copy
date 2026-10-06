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
    assert: "No occurrence of interface{} — use the any alias"
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
    fix: "Replace naked return with explicit return values, or remove named returns from the signature"
  ```

  > **Gap:** Whether named returns "clarify the function signature" is a judgment call not covered by this check. If that distinction matters, create a separate T3/Human rule for it.

## Error handling

- Always check returned errors. Never discard with `_`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(_\\s*=.*\\(|,\\s*_\\s*:?=)"
    assert: "Returned errors are never discarded with _ — use errcheck or golangci-lint"
    scope: "**/*.go"
    fix: "Handle the error: check and return/log it, or wrap it with context"
  ```

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "return\\s+(fmt\\.Errorf\\([^%]*\\)|err\\s*$)"
    assert: "Errors are wrapped with fmt.Errorf and %w — use wrapcheck or errorlint linter"
    scope: "**/*.go"
    fix: "Replace bare return err with return fmt.Errorf(\"doing X: %w\", err)"
  ```

  > **Gap:** Whether the context message in `fmt.Errorf` is meaningful is a judgment call not covered by this check. If context quality matters, create a separate T3 rule for it.

- Error messages start with lowercase and do not end with punctuation.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(fmt\\.Errorf|errors\\.New)\\(\"[A-Z]|(fmt\\.Errorf|errors\\.New)\\(\".*[.!?]\"\\)"
    assert: "Error strings start lowercase and have no trailing punctuation — use staticcheck ST1005 or revive"
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
