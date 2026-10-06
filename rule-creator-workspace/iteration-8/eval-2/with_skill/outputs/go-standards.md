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
    assert: "No naked returns in functions with named return values (nakedret linter)"
    scope: "**/*.go"
    fix: "Replace naked return with explicit return values, or remove named return values from the signature"
  ```

  > **Gap:** Whether named returns "clarify" the signature is a judgment call that no linter can evaluate. If the team wants that enforced separately, write a dedicated T3 rule for it.

## Error handling

- Always check returned errors. Never discard with `_`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(_\\s*,\\s*err\\s*:?=|_\\s*=\\s*\\w+\\()"
    assert: "No discarded errors — errcheck linter flags unchecked error returns"
    scope: "**/*.go"
    fix: "Handle the error: check and return/log it, or explicitly document why it is safe to ignore"
  ```

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "return\\s+(err|fmt\\.Errorf\\([^%]*\\))"
    assert: "Errors are wrapped with %w via fmt.Errorf — wrapcheck linter catches bare error returns"
    scope: "**/*.go"
    fix: "Wrap with fmt.Errorf(\"doing X: %w\", err) instead of returning the bare error"
  ```

  > **Gap:** Whether the wrapping context message is meaningful requires judgment. The T1 check only enforces that wrapping happens structurally (using `%w`). If context quality matters, write a separate T3 reviewer rule.

- Error messages start with lowercase and do not end with punctuation.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(fmt\\.Errorf|errors\\.New)\\(\"[A-Z]|[.!?]\"\\)"
    assert: "Error strings start lowercase and have no trailing punctuation (revive/error-strings linter)"
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
