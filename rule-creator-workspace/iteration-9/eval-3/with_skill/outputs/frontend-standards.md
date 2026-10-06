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
    assert: "No 'as any' type assertions — use type narrowing or generics"
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace 'as any' with a proper type assertion, generic parameter, or type narrowing (instanceof, typeof, in)"
  ```

- No `export default`. Use named exports exclusively.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\bexport\\s+default\\b"
    assert: "No default exports — use named exports exclusively"
    scope: "src/**/*.{ts,tsx}"
    fix: "Convert to named export: 'export const Foo = ...' or 'export function foo(...)'"
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
    assert: "No raw z-index values — use --shelf-z-* layer tokens"
    scope: "src/**/*.css"
    fix: "Replace raw z-index value with the appropriate var(--shelf-z-*) token"
  ```

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  ```yaml
  enforcement:
    tier: T1
    pattern: "<img(?![^>]*\\balt\\b)"
    assert: "Every <img> element has an alt attribute (empty alt='' for decorative images)"
    scope: "src/**/*.tsx"
    fix: "Add alt attribute: alt='description' for informative images, alt='' for decorative"
  ```

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf, BookCard, Drawer"
    instruction: "Verify that no information is conveyed by color alone. Check status badges, filters, and any color-coded elements. A violation is any element where removing color would make it impossible to distinguish states or categories. Correct: every color-coded element also has an icon, pattern, or text label as a secondary indicator."
    group: accessibility
    priority: 1
    critical: false
  ```

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Tab order matches visual layout order — programmatically tab through elements and verify each focused element's bounding rect follows left-to-right, top-to-bottom reading order"
  ```

## Performance

- No synchronous `localStorage` reads in render paths.

  ```yaml
  enforcement:
    tier: T1
    pattern: "localStorage\\.(getItem|get|\\[)"
    assert: "No synchronous localStorage reads in component files — move to hooks or utilities"
    scope: "src/components/**/*.{ts,tsx}"
    fix: "Move localStorage read into a custom hook with useEffect or into a utility module"
  ```

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    instruction: "Check images on initial page load. Verify that images visible in the viewport on first render have loading='eager' (or no loading attribute, which defaults to eager). Verify that images below the fold have loading='lazy'. A violation is an above-fold image with loading='lazy' or a below-fold image with loading='eager'. Correct: fold-appropriate loading strategy for every image."
    group: performance
    priority: 2
    critical: false
  ```

- Bundle size for any single route does not exceed 200kb gzipped.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Build output gzipped size per route chunk does not exceed 200kb — measured by build tooling or CI size check"
  ```

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check whether component render functions contain business logic (data transformations, validation, conditional workflows, calculations beyond simple display formatting). A violation is business logic computed directly in the render body or return statement. Correct: business logic is extracted into custom hooks or utility functions, and the component only orchestrates rendering."
    triage_hint: "Component file contains data transformation, validation, or conditional business logic inline"
    group: architecture
    priority: 2
    critical: false
  ```

- Components follow the single responsibility principle.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Single responsibility is inherently subjective — what constitutes 'one responsibility' depends on team context, domain boundaries, and the abstraction level. Reviewers would disagree on where to draw the line."
  ```

- Side effects are isolated in custom hooks, never inline in event handlers.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check whether event handler callbacks in JSX contain inline side effects (fetch calls, API requests, localStorage writes, analytics tracking, setTimeout/setInterval, direct DOM manipulation). A violation is a side effect performed directly inside an onClick, onChange, onSubmit, or similar handler callback. Correct: event handlers call a function from a custom hook that encapsulates the side effect."
    triage_hint: "Event handler contains inline side effect (fetch, API call, localStorage, analytics)"
    group: architecture
    priority: 2
    critical: false
  ```
