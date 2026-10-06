---
paths: "**/*.go"
---

# Go Standards

## Types

- Use `any` instead of `interface{}`.

<!-- ENFORCEMENT: grep
     pattern: "interface\\{\\}"
     glob: "**/*.go"
     fix: Replace `interface{}` with `any` (available since Go 1.18). -->

- Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

<!-- ENFORCEMENT: review
     reason: Whether named returns "clarify" the signature requires semantic judgment.
     shortcut: grep for bare `return$` inside functions with named returns to catch naked-return abuse. -->

## Error handling

- Always check returned errors. Never discard with `_`.

<!-- ENFORCEMENT: lint
     linter: errcheck (golangci-lint)
     shortcut_grep: ", _ :=|, _ ="
     glob: "**/*.go"
     fix: Handle every returned error explicitly; never assign to `_`. -->

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.

<!-- ENFORCEMENT: lint
     linter: wrapcheck (golangci-lint)
     shortcut_grep: "return err$"
     glob: "**/*.go"
     fix: Replace bare `return err` with `return fmt.Errorf("<context>: %w", err)`. -->

- Error messages start with lowercase and do not end with punctuation.

<!-- ENFORCEMENT: grep
     pattern: "fmt\\.Errorf\\(\"[A-Z]|errors\\.New\\(\"[A-Z]"
     glob: "**/*.go"
     fix: Start error strings with a lowercase letter and remove trailing punctuation. -->

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
