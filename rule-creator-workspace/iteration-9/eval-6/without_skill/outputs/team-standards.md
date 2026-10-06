---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.
- Do not commit `console.log`, `console.debug`, `console.info`, or `console.warn` statements used for debugging. Remove all temporary console logging before committing code. If a console call is intentional (e.g., inside a logger utility or error boundary), add a comment `// eslint-disable-next-line no-console -- <reason>` to document why it must stay.

<!-- ENFORCEMENT
- detection: grep for `console\.(log|debug|info|warn)` in staged or changed files under `src/`
- scope: all files matching `src/**/*`
- exceptions: lines with an explicit `eslint-disable` comment that includes a reason
- fix: remove the console statement or replace it with the project's logger utility
-->

## Testing

- Every component has at least one test file.
