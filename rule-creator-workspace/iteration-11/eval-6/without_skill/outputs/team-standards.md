---
paths: "src/**/*"
---

# Team Standards

## Code Style

- Use `const` by default. Only use `let` when reassignment is necessary.
- Prefer template literals over string concatenation.

## Debugging

- If persistent logging is genuinely needed (e.g., error reporting), use a dedicated logger utility instead of raw `console.*` calls.
- Do not commit `console.log`, `console.debug`, `console.info`, or `console.warn` statements used for debugging. Remove all temporary console output before committing code. If you need runtime logging, use the project's logger utility instead.

### Enforcement

- **When**: Before every commit and during code review.
- **How**: Search all staged or changed files under `src/` for calls matching `console.log`, `console.debug`, `console.info`, or `console.warn`. Treat each occurrence as a violation unless the file is an approved logger utility module.
- **Fix**: Remove the console statement, or replace it with a call to the project's logger utility if the log is intentional.
- **Escalation**: If a console statement is intentional and does not belong in the logger utility, add a `// eslint-disable-next-line no-console` comment with a justification, and flag it for review.

## Testing

- Every component has at least one test file.
