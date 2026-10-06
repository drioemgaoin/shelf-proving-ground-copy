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
    reason: "Whether a variable name is 'descriptive' enough depends on context, domain, and reviewer judgment. No regex or LLM can reliably distinguish 'x' as a bad name (loop counter in math) from 'x' as a bad name (unclear business logic variable). Reviewers do not converge on a stable standard."
  ```

- Functions should do one thing well and have a name that describes that thing.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Both 'one thing' (single responsibility) and 'describes that thing' (naming quality) are judgment calls with no syntactic proxy. What constitutes a single responsibility varies by abstraction level and reviewer perspective."
  ```

## Imports

- No unused imports.

  ```yaml
  enforcement:
    tier: T1
    pattern: "unused import detected by linter (e.g., eslint no-unused-imports or TypeScript noUnusedLocals)"
    assert: "Every import symbol is referenced in the file"
    scope: "src/**/*.{ts,tsx}"
    fix: "Remove the unused import statement or symbol"
  ```

- Group imports by source: external packages first, then internal modules.

  ```yaml
  enforcement:
    tier: T1
    pattern: "import order enforced by eslint-plugin-import/order or equivalent (groups: [builtin, external, internal, parent, sibling, index])"
    assert: "External package imports appear before internal module imports with no interleaving"
    scope: "src/**/*.{ts,tsx}"
    fix: "Reorder imports so external packages come first, then internal modules — auto-fixable by eslint --fix"
  ```

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "The adjective 'sufficient' is the core criterion — removing it reduces the rule to 'log errors', which is trivially satisfied by any log call. What constitutes sufficient diagnostic context (request IDs, user context, stack traces, input values) varies by domain, error type, and reviewer judgment. No stable standard exists for automation."
  ```
