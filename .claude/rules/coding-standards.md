---
paths: src/**/*
---

# Coding standards

## Style

- Use camelCase for variables and functions, PascalCase for components and types.

  ```enforcement
  id: "style-naming-convention"
  tier: T1
  tool: "ESLint @typescript-eslint/naming-convention"
  - pattern: "export default class "
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use a named export with PascalCase for classes/components and camelCase for functions"
  ```

- Prefer named exports over default exports.

  ```enforcement
  id: "style-named-exports"
  tier: T1
  tool: "ESLint import/no-default-export"
  - pattern: "export default "
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use a named export instead of export default"
  ```

- No nested ternary operators; use switch statements or if/else chains.

  ```enforcement
  id: "style-no-nested-ternary"
  tier: T1
  tool: "ESLint no-nested-ternary"
  - pattern: "(?<![?.])\\?[^?:.]*(?<![?.])\\?[^:]*:"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: strings
    fix: "Replace nested ternary with if/else chain or switch statement"
  ```

- Explicit over clever: clarity beats brevity.

  ```enforcement
  id: "style-explicit-over-clever"
  tier: Human
  review: morning-review
  reason: "Subjective judgment — what counts as 'clever' vs 'explicit' depends on reviewer experience and context; no stable standard across reviewers"
  ```

## TypeScript

- No `any` types; use `unknown` and narrow.

  ```enforcement
  id: "typescript-no-any"
  tier: T1
  tool: "ESLint @typescript-eslint/no-explicit-any"
  - pattern: ":\\s*any\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace `any` with `unknown` and add a type guard to narrow"
  - pattern: "\\bas\\s+any\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace `as any` with a proper type guard or `unknown` + narrowing"
  ```

- No unsafe casts (`as`); use type guards.

  ```enforcement
  id: "typescript-no-unsafe-cast"
  tier: T1
  tool: "ESLint @typescript-eslint/consistent-type-assertions"
  - pattern: "\\bas\\s+[A-Z]"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: comments
    fix: "Replace `as Type` with a type guard, `satisfies`, or `as const`"
  ```

- Derive types from data with `satisfies` and `as const`, never `as`. When stdlib widens keys (`Object.fromEntries`, `Object.keys`), use an explicit literal with a `// sync with <source>` comment.

  > No separate enforcement block — this is the design rationale for `typescript-no-unsafe-cast` above. The `as` ban covers the enforceable part.

- All public function parameters and return types must be typed.

  ```enforcement
  id: "typescript-explicit-signatures"
  tier: T1
  tool: "ESLint @typescript-eslint/explicit-function-return-type"
  - pattern: "export (async )?function \\w+\\([^)]*\\)\\s*\\{"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    exclude: "src/**/*.test.{ts,tsx}"
    strip: comments
    fix: "Add explicit return type annotation to exported function (e.g., export function getBooks(): Promise<Book[]> {)"
  ```

## Testing

- Unit tests co-located with source in `__tests__/` or `.test.ts` files.

  ```enforcement
  id: "testing-colocated-unit-tests"
  tier: T3
  agent: reviewer
  scope: "src/**/*.test.{ts,tsx}"
  group: testing
  triage_hint: "Flag when: new test file added, test file moved, test import path changed"
  instruction: "Check that every .test.ts or .test.tsx file is co-located with its source — either in the same directory or in an adjacent __tests__/ directory. A violation is a test file in src/ whose source file is in a different subtree (e.g., src/utils/__tests__/api.test.ts testing src/api.ts across directory boundaries). Correct: test file is a sibling of its source or in the source's __tests__/ subdirectory."
  ```

  > **Agent:** `reviewer` — the violation is a file placement issue visible in the directory structure; it is not visible in rendered output.

- Acceptance tests in `e2e/acceptance/` are locked; do not edit.

  > No separate enforcement block — already enforced by `never-edit-locked-files` in ui-base.md.

- Agent-written integration tests go in `e2e/agent/`.

  > No separate enforcement block — already enforced by `agent-tests-in-e2e-agent` in ui-base.md.

- Use `data-dynamic` on content that changes between runs (dates, relative times).

  > No separate enforcement block — already enforced by `data-dynamic-on-changing-content` in ui-base.md.

- Find elements by role and accessible name, never by CSS selector.

  ```enforcement
  id: "testing-no-css-selectors"
  tier: T1
  - pattern: "querySelector|querySelectorAll"
    assert: absent
    scope: "src/**/*.test.{ts,tsx}"
    fix: "Use getByRole, getByLabelText, or getByText instead of querySelector"
  - pattern: "data-testid"
    assert: absent
    scope: "src/**/*.test.{ts,tsx}"
    fix: "Use getByRole or getByLabelText instead of data-testid"
  ```

- `getByRole` and `getByLabelText` throw on miss — `.toBeTruthy()` on their result is a tautology. Use `.toBeInTheDocument()` for DOM presence assertions.

  CORRECT: `expect(screen.getByRole('main')).toBeInTheDocument();`
  WRONG: `expect(screen.getByRole('main')).toBeTruthy();` — always passes, never catches a real regression

  ```enforcement
  id: "testing-no-tautology-assertions"
  tier: T1
  - pattern: "getBy(Role|LabelText|Text|AltText|Title|DisplayValue|PlaceholderText|TestId).*toBeTruthy"
    assert: absent
    scope: "src/**/*.test.{ts,tsx}"
    strip: comments
    fix: "getByRole (and all getBy* queries) throw if no match — .toBeTruthy() is always true. Use .toBeInTheDocument() instead."
  - pattern: "getBy(Role|LabelText|Text|AltText|Title|DisplayValue|PlaceholderText|TestId).*toBeDefined"
    assert: absent
    scope: "src/**/*.test.{ts,tsx}"
    strip: comments
    fix: "getByRole (and all getBy* queries) throw if no match — .toBeDefined() is always true. Use .toBeInTheDocument() instead."
  ```

## Components

- Placeholders (skeletons, spinners) use the same element and role as real content. No `aria-hidden` inside role-queryable containers (list, grid, table).

  CORRECT: `<li className="skeleton-card">` — skeleton is a listitem, same as real cards, visible to `getByRole('listitem')`
  WRONG: `<li className="skeleton-card" aria-hidden="true">` — skeleton is invisible to role queries; tests that use `getByRole('listitem')` will skip it and silently match real content instead

  ```enforcement
  id: "components-no-aria-hidden-on-placeholders"
  tier: T1
  - pattern: "aria-hidden"
    assert: absent
    scope: "src/components/**/*.tsx"
    strip: comments
    fix: "Do not use aria-hidden on placeholder elements. Skeletons and loading states inside role-queryable containers (role='list', etc.) must participate in the accessible tree so tests can find them via getByRole. Remove aria-hidden — use visually-hidden text or aria-label to communicate loading state instead."
  ```

- Every interactive control must have an accessible name.

  > No separate enforcement block — already enforced by `accessible-name` (T2 axe-core) in ui-base.md.

- Token values live only in `src/styles/tokens.css`; no raw color/spacing/size values in components.

  > No separate enforcement block — already enforced by `values-from-tokens` in ui-base.md.

- All `@keyframes` declarations must be inside their parent `@layer` block.

  ```enforcement
  id: "components-keyframes-in-layer"
  tier: T1
  tool: "stylelint shelf-rules/keyframes-in-layer"
  - pattern: "^@keyframes"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Move @keyframes inside its parent @layer block. Bare top-level @keyframes is the violation; @layer components { @keyframes shimmer { } } is correct."
  ```

- Follow the rules in `.claude/rules/ui-base.md` and `.claude/rules/ui-project.md`.

  > Meta-pointer — no enforcement block. The referenced rules have their own enforcement.

## Architecture

- Data access through the async API module, never direct state mutation.

  ```enforcement
  id: "architecture-data-via-api"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: useState with array/object, direct mutation, state setter outside API call, fetch, XMLHttpRequest"
  instruction: "Check that components access and mutate book data exclusively through the async API module (src/api.ts — getBooks, addBook, updateStatus, deleteBook). A violation is a component that directly mutates shared state (e.g., setting books via useState without going through the API), bypasses the API to fetch data (e.g., raw fetch calls), or stores canonical data outside the API's in-memory store. Correct: all data flows through the API module; components call API functions and update local state from the API response."
  ```

  > **Agent:** `reviewer` — the violation is in code structure (import paths, function calls); it is not visible in rendered output.

- Keep modules focused on a single responsibility.

  ```enforcement
  id: "architecture-single-responsibility"
  tier: Human
  review: morning-review
  reason: "Subjective judgment — where to draw module boundaries depends on team conventions and domain context; reasonable reviewers disagree on what constitutes a 'single' responsibility"
  ```

- Prefer composition over inheritance.

  ```enforcement
  id: "architecture-composition-over-inherit"
  tier: T1
  - pattern: "class\\s+\\w+\\s+extends\\s+[A-Z]"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: comments
    fix: "Use composition (hooks, higher-order functions, render props) instead of class inheritance"
  ```
