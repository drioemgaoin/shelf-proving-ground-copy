---
paths: "src/**/*"
---

# Code Quality Standards

## Naming

- Use descriptive variable names that convey purpose and meaning.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Whether a variable name is 'descriptive' enough depends on domain context, scope, and reviewer judgment. No regex or LLM can reliably distinguish an insufficiently descriptive name from one that is appropriate in context — reviewers would disagree on borderline cases like single-letter loop variables or domain abbreviations."
  ```

- Functions should do one thing well and have a name that describes that thing.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "What constitutes 'one thing' is inherently subjective — it depends on the abstraction level and domain. This is the single-responsibility principle, which requires human judgment about cohesion and naming appropriateness that varies between reviewers."
  ```

## Imports

- No unused imports.

  ```yaml
  enforcement:
    tier: T1
    pattern: "unused import detected by eslint no-unused-imports or TypeScript compiler"
    assert: "No import statement references an identifier that is never used in the file"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the unused import statement or identifier"
  ```

- Group imports by source: external packages first, then internal modules.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint-plugin-import/order or simple-import-sort detects out-of-order groups"
    assert: "Imports are grouped with external packages before internal modules, with a blank line separating groups"
    scope: "src/**/*.{ts,tsx}"
    fix: "Reorder imports so external packages come first, then a blank line, then internal modules — auto-fixable via eslint --fix"
  ```

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  ```yaml
  enforcement:
    tier: T1
    pattern: "console\\.error\\(\\s*(err|error|e)\\s*\\)"
    assert: "Error logging calls include a descriptive string argument, not just the error object alone"
    scope: "src/**/*.{ts,tsx}"
    fix: "Add a context string describing the operation that failed, e.g. console.error('Failed to load books:', error)"
  ```

  Note: T1 catches the structural violation (bare error logging with no context string). Whether the context message is *sufficient* for production diagnosis is a judgment call that requires human review — teams that need that enforced should add a separate Human-tier rule.
