---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.

- Do not commit `console.log`, `console.debug`, `console.info`, or `console.warn` calls.

  ```yaml
  enforcement:
    tier: T1
    pattern: "console\\.(log|debug|info|warn)\\s*\\("
    assert: "No console.log/debug/info/warn calls in committed source files"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the console call. If logging is needed, use the project logger utility."
  ```

## Testing

- Every component has at least one test file.
