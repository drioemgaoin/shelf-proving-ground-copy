---
paths: "**/*.go"
---

# Go Standards

## Types

- Use `any` instead of `interface{}`.
- Prefer named return values only when they clarify the function signature. Do not use them just for naked returns.

## Error handling

- Always check returned errors. Never discard with `_`.
- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.
- Error messages start with lowercase and do not end with punctuation.

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
