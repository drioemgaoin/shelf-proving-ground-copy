---
paths: "**/*.go"
---

# Go Standards

## Types

- Use `any` instead of `interface{}`.

<!-- enforcement:
  type: syntactic
  search:
    pattern: "interface\\{\\}"
    glob: "**/*.go"
  message: "Use `any` instead of `interface{}` (Go 1.18+)."
-->

- Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

<!-- enforcement:
  type: semantic
  rationale: >
    Whether a named return "clarifies" a signature is a judgment call requiring
    contextual understanding. However, naked returns (a bare `return` in a
    function with named return values) are syntactically detectable — use the
    search below as a heuristic that catches the most common violation.
  search:
    pattern: "^\\treturn$"
    glob: "**/*.go"
  message: "Naked return detected. Named return values should clarify the signature, not enable bare returns."
-->

## Error handling

- Always check returned errors. Never discard with `_`.

<!-- enforcement:
  type: syntactic
  search:
    pattern: ",\\s*_\\s*(:?=)"
    glob: "**/*.go"
  message: "Do not discard errors with `_`. Always check returned errors."
  caveat: >
    This catches the `_, _ :=` and `, _ =` discard patterns. It may flag
    non-error discards (e.g. discarding an index). Full "always check errors"
    enforcement requires semantic analysis or a linter like `errcheck`.
-->

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

<!-- enforcement:
  type: syntactic
  search:
    pattern: "return\\s+(err|fmt\\.Errorf\\([^:]*\\))"
    glob: "**/*.go"
  message: "Wrap errors with context: use `fmt.Errorf(\"doing X: %%w\", err)` instead of returning bare `err` or `fmt.Errorf` without a colon-separated context prefix."
  caveat: >
    The first alternative catches `return err` (bare unwrapped errors).
    The second catches `fmt.Errorf` calls whose format string has no colon,
    suggesting missing context. False positives are possible at package
    boundaries where wrapping is intentionally omitted.
-->

- Error messages start with lowercase and do not end with punctuation.

<!-- enforcement:
  type: syntactic
  search:
    - pattern: "fmt\\.Errorf\\(\"[A-Z]"
      glob: "**/*.go"
      message: "Error messages must start with lowercase."
    - pattern: "fmt\\.Errorf\\(\"[^\"]*[.!?]\"" 
      glob: "**/*.go"
      message: "Error messages must not end with punctuation."
    - pattern: "errors\\.New\\(\"[A-Z]"
      glob: "**/*.go"
      message: "Error messages must start with lowercase."
    - pattern: "errors\\.New\\(\"[^\"]*[.!?]\"" 
      glob: "**/*.go"
      message: "Error messages must not end with punctuation."
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
