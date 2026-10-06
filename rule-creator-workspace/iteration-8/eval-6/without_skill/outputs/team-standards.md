---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.
- Do not commit `console.log`, `console.debug`, `console.info`, or `console.warn` statements used for debugging. Remove all debugging console calls before committing code. If a console statement is intentional and permanent (e.g., `console.error` in an error handler), add a comment explaining why it must stay (e.g., `// intentional: logs unrecoverable startup failure`). Reviewers should treat any uncommented `console.*` call in a diff as a blocking issue.

## Testing

- Every component has at least one test file.
