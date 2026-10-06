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
    reason: "Whether a variable name is 'descriptive' enough depends on domain context, scope, and reviewer judgment. No regex or LLM can reliably determine if a name conveys sufficient purpose — reviewers would disagree on edge cases like single-letter loop variables or abbreviated domain terms."
  ```

- Functions should do one thing well and have a name that describes that thing.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Both 'one thing' (single responsibility) and 'describes that thing' are judgment calls that shift based on abstraction level and team conventions. Three experienced reviewers would draw the boundary differently, making automated enforcement unreliable."
  ```

## Imports

- No unused imports.

  ```yaml
  enforcement:
    tier: T1
    pattern: "unused import detected by ESLint no-unused-imports or TypeScript compiler"
    assert: "No import statement references a binding that is never used in the file"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the unused import statement or binding"
  ```

- Group imports by source: external packages first, then internal modules.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint-plugin-import order rule (external group before internal group)"
    assert: "Imports are ordered: external packages first, then internal modules, with no interleaving"
    scope: "src/**/*.{ts,tsx}"
    fix: "Reorder import statements so all external packages precede internal modules"
  ```

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "The adjective 'sufficient' is the rule's core criterion. Removing it yields 'log errors with context,' which is trivially satisfied by any log call that includes a string. What constitutes sufficient diagnostic context varies by call site, domain, and operational experience — reviewers would disagree on whether a given log statement includes enough information."
  ```
