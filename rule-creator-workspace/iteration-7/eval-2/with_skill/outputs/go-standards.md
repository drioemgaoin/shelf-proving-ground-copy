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
    assert: "No naked returns (return without values in functions with named return parameters)"
    scope: "**/*.go"
    fix: "Replace naked return with explicit return values, or remove named return parameters if they do not aid readability"
  ```

  > **Gap:** Whether named returns "clarify the signature" is a judgment call that no linter can evaluate. The enforceable part is the ban on naked returns, which tools like `nakedret` detect. If the team wants the clarification aspect enforced independently, create a separate T3/Human rule for it.

## Error handling

- Always check returned errors. Never discard with `_`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\b_\\s*=\\s*\\w+\\(|,\\s*_\\s*(?::=|=)\\s*"
    assert: "Returned errors are never assigned to _ — every error must be checked"
    scope: "**/*.go"
    fix: "Assign the error to a named variable and handle it (check, wrap, or propagate)"
  ```

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

  ```yaml
  enforcement:
    tier: T1
    pattern: "return\\s+(err|fmt\\.Errorf\\([^%]*\\))"
    assert: "Errors are wrapped with fmt.Errorf and %w — no bare return err"
    scope: "**/*.go"
    fix: "Replace bare return err with return fmt.Errorf(\"<context>: %w\", err)"
  ```

  > **Gap:** Whether the wrapping context message is meaningful (e.g., "doing X" vs "error") requires judgment and is not covered by this pattern. If context-message quality matters, create a separate T3 reviewer rule.

- Error messages start with lowercase and do not end with punctuation.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(errors\\.New|fmt\\.Errorf)\\(\"[A-Z]|(errors\\.New|fmt\\.Errorf)\\(\"[^\"]*[.!?]\""
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
