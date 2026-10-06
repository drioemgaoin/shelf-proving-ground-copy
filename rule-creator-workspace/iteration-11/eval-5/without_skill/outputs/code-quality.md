---
paths: "src/**/*"
---

# Code Quality Standards

## Naming

- Use descriptive variable names that convey purpose and meaning.

<!-- ENFORCEMENT: review-time — Subjective guideline; reviewers check that variable names clearly communicate intent and purpose. Flag single-letter names outside of short loop iterators or well-known conventions (e.g., `i`, `x`, `y`). -->

- Functions should do one thing well and have a name that describes that thing.

<!-- ENFORCEMENT: review-time — Subjective design principle; reviewers verify each function has a single clear responsibility and its name accurately describes that responsibility. Flag functions that perform multiple unrelated operations or have vague names like `process` or `handle`. -->

## Imports

- No unused imports.

<!-- ENFORCEMENT: lint — ESLint `no-unused-imports` (via `eslint-plugin-unused-imports`) or the built-in `@typescript-eslint/no-unused-vars` rule with `varsIgnorePattern`. Configured in the project ESLint config. CI fails on violation. -->

- Group imports by source: external packages first, then internal modules.

<!-- ENFORCEMENT: lint — ESLint `import/order` rule (via `eslint-plugin-import`) configured with groups `["builtin", "external", "internal", "parent", "sibling", "index"]` and `newlines-between: "always"`. CI fails on violation. Auto-fixable with `--fix`. -->

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

<!-- ENFORCEMENT: review-time — Reviewers verify that error-logging calls include relevant context: the operation being performed, relevant identifiers or parameters, and the original error object/message. Flag bare `console.error(err)` or `catch` blocks that swallow errors silently. -->
