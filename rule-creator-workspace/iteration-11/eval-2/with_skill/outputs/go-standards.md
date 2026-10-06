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
    pattern: "^\\s*return\\s*$"
    assert: "No naked returns — functions with named return values use explicit return values"
    scope: "**/*.go"
    fix: "Replace naked return with explicit return values"
  ```

  > **Gap:** The linter catches naked returns (the structural violation), but cannot judge whether a named return value "clarifies" the signature. If your team wants the clarity aspect enforced, write a separate T3/Human rule for it.

## Error handling

- Always check returned errors. Never discard with `_`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(\\b\\w+,\\s*_\\s*:?=|^\\s*_\\s*:?=).*\\(.*\\)"
    assert: "Returned errors are never assigned to _ — use errcheck linter"
    scope: "**/*.go"
    fix: "Handle the error: check it, wrap and return it, or log it"
  ```

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "return\\s+(err|fmt\\.Errorf\\([^%]*\\))"
    assert: "Errors are wrapped with context using %w — not returned bare"
    scope: "**/*.go"
    fix: "Replace bare return err with return fmt.Errorf(\"<context>: %w\", err)"
  ```

  > **Gap:** The linter catches bare `return err` and missing `%w`, but cannot judge whether the wrapping message provides *meaningful* context. If context quality matters to your team, write a separate T3 reviewer rule for it.

- Error messages start with lowercase and do not end with punctuation.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(errors\\.New|fmt\\.Errorf)\\(\"[A-Z]|(errors\\.New|fmt\\.Errorf)\\(\"[^\"]*[.!?]\"\\)"
    assert: "Error strings start lowercase and do not end with punctuation"
    scope: "**/*.go"
    fix: "Lowercase the first letter and remove trailing punctuation from the error string"
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
