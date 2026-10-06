---
paths: "**/*.go"
---

# Go Standards

## Types

- Use `any` instead of `interface{}`.

<!-- ENFORCEMENT
classification: syntactic
strategy: grep
pattern: "interface\\{\\}"
file_glob: "**/*.go"
fix: Replace `interface{}` with `any`.
-->

- Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

<!-- ENFORCEMENT
classification: hybrid
strategy: grep+review
pattern: "^\\treturn$"
file_glob: "**/*.go"
note: >
  Naked returns (bare `return` in a function with named return values) are
  syntactically detectable. However, deciding whether a named return value
  "clarifies the signature" requires human or LLM judgment. Grep finds the
  syntactic signal; a reviewer decides intent.
fix: Remove the named return values and use explicit return values, or justify the naming with a comment.
-->

## Error handling

- Always check returned errors. Never discard with `_`.

<!-- ENFORCEMENT
classification: hybrid
strategy: grep+review
pattern: ",\\s*_\\s*[:=]"
file_glob: "**/*.go"
note: >
  The `_, _ :=` or `_ =` discard pattern is syntactically detectable via grep.
  However, confirming that the discarded value is specifically an error (and not
  an intentionally unused non-error return) requires type awareness beyond pure
  syntax. Grep catches the common case; a reviewer or linter (like `errcheck`)
  covers the rest.
fix: Handle the error explicitly -- at minimum log it or return it wrapped.
-->

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

<!-- ENFORCEMENT
classification: hybrid
strategy: grep+review
pattern: "return\\s+(err|fmt\\.Errorf\\([^%]*\\))"
file_glob: "**/*.go"
note: >
  Bare `return err` (unwrapped) is syntactically detectable. Detecting
  `fmt.Errorf` calls that lack the `%w` verb is also syntactic. However,
  judging whether the wrapping message provides meaningful context requires
  review. Grep catches missing wraps; a reviewer checks quality.
fix: Replace bare `return err` with `return fmt.Errorf("doing X: %w", err)` adding relevant context.
-->

- Error messages start with lowercase and do not end with punctuation.

<!-- ENFORCEMENT
classification: syntactic
strategy: grep
pattern: "(fmt\\.Errorf|errors\\.New)\\(\"[A-Z]"
file_glob: "**/*.go"
secondary_pattern: "(fmt\\.Errorf|errors\\.New)\\(\"[^\"]*[.!?]\"" 
fix: >
  Start the error string with a lowercase letter and remove trailing
  punctuation. Example: `fmt.Errorf("failed to open file: %w", err)`.
-->

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
