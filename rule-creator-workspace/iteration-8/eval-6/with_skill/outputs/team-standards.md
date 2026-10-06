---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.

- Do not commit `console.log`, `console.debug`, or `console.info` calls.

  ```yaml
  enforcement:
    tier: T1
    pattern: "console\\.(log|debug|info)\\s*\\("
    assert: "No console.log/debug/info calls in committed source files"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the console statement, or replace with the project's logger utility if the log is intentional"
  ```

## Testing

- Every component has at least one test file.
