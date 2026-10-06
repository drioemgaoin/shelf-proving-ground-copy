---
paths: src/**/*
---

# Code Rules

## Structure

- Components own no space outside themselves.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.css"
    instruction: "Check whether components apply margin to their own root element. Internal margins are fine. External margins on the outermost wrapper violate this rule."
    triage_hint: "Component CSS uses margin on root element"
    group: layout
    priority: 2
    critical: false
  ```

- Hooks do not call other hooks conditionally.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/hooks/**/*.ts"
    instruction: "Check that hook calls are not wrapped in if/else, switch, or early-return branches."
    triage_hint: "Hook called inside conditional"
    group: hooks
    priority: 1
    critical: false
  ```

- Event handlers do not contain business logic — delegate to hooks or utils.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.tsx"
    instruction: "Check that onClick/onChange/onSubmit handlers call a hook or utility function rather than containing logic inline."
    triage_hint: "Inline business logic in event handler"
    group: architecture
    priority: 2
    critical: false
  ```

- API response types match the OpenAPI schema.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/api/**/*.ts"
    instruction: "Check that TypeScript response types match the fields and types defined in the OpenAPI spec."
    triage_hint: "API type diverges from OpenAPI schema"
    group: contracts
    priority: 1
    critical: false
  ```

## Purity and Isolation

- Utility functions must be pure — no side effects, no I/O, no state mutation.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/utils/**/*.ts"
    instruction: "Check that utility functions do not perform side effects (console.log, fetch, DOM manipulation), I/O operations, or mutate arguments or external state."
    triage_hint: "Utility function has side effects"
    group: architecture
    priority: 1
    critical: false
  ```

- Test files must not import from other test files.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/**/*.test.{ts,tsx}"
    instruction: "Check that test files do not import from other .test.ts or .test.tsx files. Shared test helpers belong in dedicated fixture or helper modules, not in other test files."
    triage_hint: "Test file imports from another test file"
    group: testing
    priority: 2
    critical: false
  ```

- Components must not exceed 200 lines including template/JSX.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.tsx"
    instruction: "Check that component files do not exceed 200 lines total. If a file is over 200 lines, flag it for decomposition into smaller components or extraction of logic into hooks/utils."
    triage_hint: "Component file exceeds 200 lines"
    group: architecture
    priority: 3
    critical: false
  ```
