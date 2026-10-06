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
    instruction: "Check that functions in utility modules perform no side effects. A violation is any function that calls fetch, console.*, fs.*, setTimeout, or mutates external state (assignments to variables outside function scope, this.* mutations, store/global writes). Correct: every function is a pure transformation — takes inputs, returns outputs, touches nothing else."
    triage_hint: "Utility function performs side effects or I/O"
    group: architecture
    priority: 2
    critical: false
  ```

- Test files must not import from other test files.

  ```yaml
  enforcement:
    tier: T1
    pattern: "import .+\\.(?:test|spec)\\."
    assert: "No import statement in a test file resolves to another test or spec file"
    scope: "src/**/*.{test,spec}.{ts,tsx}"
    fix: "Extract shared test helpers into a dedicated src/test-utils/ module and import from there instead."
  ```

- Components must not exceed 200 lines including template/JSX.

  ```yaml
  enforcement:
    tier: T1
    pattern: "file line count > 200"
    assert: "Component file does not exceed 200 lines"
    scope: "src/components/**/*.tsx"
    fix: "Extract sub-components, hooks, or utility functions into separate files to bring the component under 200 lines."
  ```
