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
    reason: "Whether a variable name is 'descriptive' enough depends on domain context, scope, and convention — no automated check can reliably judge naming quality. Three reviewers would disagree on whether 'x' or 'tmp' is acceptable in a given context."
  ```

- Functions should do one thing well and have a name that describes that thing.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Judging whether a function 'does one thing' is the single-responsibility principle — inherently subjective. Function boundaries depend on abstraction level and domain context, which vary by reviewer."
  ```

## Imports

- No unused imports.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint no-unused-imports/no-unused-imports or TypeScript compiler --noUnusedLocals"
    assert: "No import statement imports a binding that is never referenced in the file"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the unused import statement or binding"
  ```

- Group imports by source: external packages first, then internal modules.

  ```yaml
  enforcement:
    tier: T1
    pattern: "eslint import/order with groups: ['builtin', 'external', 'internal', 'parent', 'sibling']"
    assert: "External package imports appear before relative/internal imports with no interleaving"
    scope: "src/**/*.{ts,tsx}"
    fix: "Reorder imports so external packages come first, then internal modules — eslint --fix can auto-sort"
  ```

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "What constitutes 'sufficient context' depends on the error type, service architecture, and debugging workflow. Stripping the adjective leaves 'log errors', which is trivially satisfied by any log call — the qualifier IS the rule. No stable standard across reviewers."
  ```
