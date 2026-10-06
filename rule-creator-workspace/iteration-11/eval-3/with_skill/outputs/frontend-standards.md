---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\bas\\s+any\\b"
    assert: "No 'as any' type assertions — use type narrowing or generics instead"
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace 'as any' with a proper type assertion, type guard, or generic parameter"
  ```

- No `export default`. Use named exports exclusively.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\bexport\\s+default\\b"
    assert: "No default exports — use named exports exclusively"
    scope: "src/**/*.{ts,tsx}"
    fix: "Convert to a named export: 'export const Foo' or 'export function foo'"
  ```

- No nested ternary expressions. Extract to variables or use if/else.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\?[^:]*\\?[^:]*:"
    assert: "No nested ternary expressions — extract to variables or use if/else"
    scope: "src/**/*.{ts,tsx}"
    fix: "Extract inner ternary to a named variable or rewrite as if/else"
  ```

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(#[0-9a-fA-F]{3,8}|\\b\\d+px\\b|\\b\\d+rem\\b|rgb\\(|hsl\\()"
    assert: "No raw color/size values in component stylesheets — use token variables"
    scope: "src/components/**/*.css"
    fix: "Replace raw value with the corresponding --shelf-* token variable"
  ```

- Animations use only `transform` and `opacity` properties.

  ```yaml
  enforcement:
    tier: T1
    pattern: "transition:\\s*(?!.*(transform|opacity|none|all))|(animation|@keyframes)[^}]*(?!transform|opacity)"
    assert: "Transitions and keyframes only animate transform and opacity"
    scope: "src/**/*.css"
    fix: "Refactor animation to use transform/opacity only, or use will-change to hint the compositor"
  ```

- Never set a raw `z-index` value. Use the layer token system.

  ```yaml
  enforcement:
    tier: T1
    pattern: "z-index:\\s*(?!var\\(--shelf-z-)"
    assert: "No raw z-index values — use --shelf-z-* token variables"
    scope: "src/**/*.css"
    fix: "Replace raw z-index with the appropriate var(--shelf-z-*) token"
  ```

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  ```yaml
  enforcement:
    tier: T1
    pattern: "<img(?![^>]*\\balt\\s*=)"
    assert: "Every <img> element has an alt attribute (empty alt=\"\" for decorative images)"
    scope: "src/**/*.tsx"
    fix: "Add alt=\"descriptive text\" or alt=\"\" for decorative images"
  ```

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf, BookCard, Drawer"
    instruction: "Check all UI elements that use color to convey status, state, or category (e.g., status badges, highlights, alerts). A violation is any element where color is the sole differentiator between states — no accompanying icon, pattern, or text label distinguishes them. Correct: every color-coded element also has a non-color indicator (icon, text label, or pattern) so the information is accessible without color vision."
    group: accessibility
    priority: 1
    critical: true
  ```

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf, Drawer"
    instruction: "Tab through all interactive elements on the page and verify the focus sequence. A violation is any case where pressing Tab moves focus to an element that is visually below or to the right of a not-yet-focused element, or skips a visible interactive element entirely. Correct: focus moves left-to-right, top-to-bottom through all interactive elements matching the visual layout order."
    group: accessibility
    priority: 1
    critical: false
  ```

## Performance

- No synchronous `localStorage` reads in render paths.

  ```yaml
  enforcement:
    tier: T1
    pattern: "localStorage\\.(getItem|key|length)"
    assert: "No synchronous localStorage reads in component files — move to hooks or utilities"
    scope: "src/components/**/*.{ts,tsx}"
    fix: "Move localStorage access to a custom hook or utility function outside the render path"
  ```

  Note: This pattern catches direct localStorage reads in component files. Indirect calls through helper functions invoked during render are not covered; consider a separate T3 reviewer rule if that gap matters.

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.tsx"
    instruction: "Check all <img> elements for a loading attribute. A violation is: (1) an image rendered in the initial viewport (above the fold — e.g., hero images, header logos, first visible content) that is missing loading=\"eager\" or has loading=\"lazy\", or (2) an image rendered below the initial viewport that is missing loading=\"lazy\" or has loading=\"eager\". Correct: above-fold images have loading=\"eager\" and below-fold images have loading=\"lazy\"."
    triage_hint: "Image element with missing or incorrect loading attribute"
    group: performance
    priority: 2
    critical: false
  ```

- Bundle size for any single route does not exceed 200kb gzipped.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Build output analysis asserts that each route's gzipped JS bundle is under 200kb"
  ```

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check component render functions (the function body that returns JSX) for business logic — data transformations, conditional branching based on domain rules, calculations, or state machine transitions. A violation is business logic inline in the render function body rather than extracted to a custom hook or utility. Correct: render functions contain only UI concerns (mapping data to JSX, event handler wiring, conditional rendering), with business logic imported from hooks or utility modules."
    triage_hint: "Component render function contains business logic (transformations, domain conditionals, calculations)"
    group: architecture
    priority: 2
    critical: false
  ```

- Components follow the single responsibility principle.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Whether a component has 'single responsibility' is inherently subjective — what constitutes one responsibility depends on the abstraction level, team conventions, and feature context. No automated system can reliably judge component responsibility boundaries."
  ```

- Side effects are isolated in custom hooks, never inline in event handlers.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check event handler functions (onClick, onSubmit, onChange, etc.) in components for inline side effects — fetch calls, localStorage writes, API calls, setTimeout/setInterval, DOM manipulation, or analytics calls directly in the handler body. A violation is any side effect executed directly inside an event handler rather than delegated to a custom hook. Correct: event handlers call hook-provided functions (e.g., 'addBook()' from 'useBooks()'), and all side effects are encapsulated in custom hooks."
    triage_hint: "Event handler contains inline side effects (fetch, localStorage, API calls)"
    group: architecture
    priority: 2
    critical: false
  ```
