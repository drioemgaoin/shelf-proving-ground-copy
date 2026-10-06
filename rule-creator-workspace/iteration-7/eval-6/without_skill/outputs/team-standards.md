---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.
- **No `console.log` in committed code.** Do not leave `console.log`, `console.debug`, `console.info`, or `console.warn` statements in source files. These calls are acceptable only during local debugging and must be removed before committing. If you need runtime logging that ships to production, use the project's logger utility instead.

<!-- ENFORCEMENT
trigger: pre-commit
check: grep -rn "console\.\(log\|debug\|info\|warn\)" --include="*.ts" --include="*.tsx" src/
expect: no_match
message: "Found console.log/debug/info/warn statement(s) in src/. Remove debugging statements before committing or replace them with the logger utility."
-->

## Testing

- Every component has at least one test file.
