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
    reason: "'Descriptive' is a qualifying adjective with no objective referent — what counts as descriptive enough varies by reviewer, domain, and context. No regex or LLM can reliably judge whether a variable name conveys sufficient purpose."
  ```

- Functions should do one thing well and have a name that describes that thing.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "'One thing well' is the single-responsibility principle — inherently subjective. Reviewers consistently disagree on where to draw the boundary. No automated check can evaluate whether a function's scope is appropriately singular."
  ```

## Imports

- No unused imports.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint no-unused-imports/no-unused-imports or TypeScript --noUnusedLocals"
    assert: "Every import symbol is referenced in the file"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the unused import statement or symbol"
  ```

- Group imports by source: external packages first, then internal modules.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint-plugin-import import/order with groups: ['builtin', 'external', 'internal']"
    assert: "Imports are grouped with external packages before internal modules, separated by a blank line"
    scope: "src/**/*.{ts,tsx}"
    fix: "Reorder imports: external packages first, then a blank line, then internal modules"
  ```

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "'Sufficient context' is a qualifying adjective whose threshold depends on the error scenario, the production environment, and the reviewer's operational experience. Removing 'sufficient' leaves 'log errors' which is trivially satisfied by any log call — the adjective is the rule's core criterion and resists automation."
  ```
