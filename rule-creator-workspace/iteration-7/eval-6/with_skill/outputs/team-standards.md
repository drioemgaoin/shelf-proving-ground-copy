---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- Do not commit `console.log` statements; remove all debugging console calls before committing.

  ```yaml
  enforcement:
    tier: T1
    pattern: "console\\.log\\("
    assert: "No console.log calls exist in committed source files"
    scope: "src/**/*.{ts,tsx,js,jsx}"
    fix: "Remove the console.log call. If persistent logging is needed, use the project's logger utility instead."
  ```

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.

## Testing

- Every component has at least one test file.
