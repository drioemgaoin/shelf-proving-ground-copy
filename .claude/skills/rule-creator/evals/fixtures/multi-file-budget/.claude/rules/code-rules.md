---
paths: src/**/*
---

# Code Rules

## Structure

- Components own no space outside themselves.

  ```enforcement
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

  ```enforcement
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

  ```enforcement
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

  ```enforcement
  tier: T3
  agent: reviewer
  scope: "src/api/**/*.ts"
  instruction: "Check that TypeScript response types match the fields and types defined in the OpenAPI spec."
  triage_hint: "API type diverges from OpenAPI schema"
  group: contracts
  priority: 1
  critical: false
  ```

## NEW RULES TO ADD (no enforcement yet)

- Utility functions must be pure — no side effects, no I/O, no state mutation.

- Test files must not import from other test files.

- Components must not exceed 200 lines including template/JSX.
