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
    assert: "No 'as any' type assertions in TypeScript files"
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace with proper type narrowing (type guards, generics, or unknown with validation)"
  ```

- No `export default`. Use named exports exclusively.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\bexport\\s+default\\b"
    assert: "No default exports — use named exports only"
    scope: "src/**/*.{ts,tsx}"
    fix: "Convert to named export: export const/function Name = ..."
  ```

- No nested ternary expressions. Extract to variables or use if/else.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\?[^?]*\\?[^:]*:"
    assert: "No nested ternary expressions (ESLint no-nested-ternary)"
    scope: "src/**/*.{ts,tsx}"
    fix: "Extract inner ternary to a variable or use if/else"
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
    pattern: "z-index:\\s*\\d+"
    assert: "No raw z-index values — use var(--shelf-z-*) token variables"
    scope: "src/**/*.css"
    fix: "Replace raw z-index number with the corresponding --shelf-z-* layer token"
  ```

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  ```yaml
  enforcement:
    tier: T1
    pattern: "<img(?![^>]*\\balt\\b)[^>]*>"
    assert: "All <img> elements have an alt attribute (ESLint jsx-a11y/alt-text)"
    scope: "src/**/*.tsx"
    fix: "Add alt=\"description\" for informative images or alt=\"\" for decorative images"
  ```

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf, BookCard, Drawer"
    instruction: "Check all UI elements that use color to convey status, state, or category. A violation is any element where removing color would make the information indistinguishable — meaning there is no accompanying icon, pattern, or text label. Correct: every color-coded element also has a non-color indicator (icon, text label, or pattern) that conveys the same meaning."
    group: accessibility
    priority: 1
    critical: false
  ```

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Tab sequence matches visual layout order — Playwright tabs through all focusable elements and asserts their positions follow left-to-right, top-to-bottom order"
  ```

## Performance

- No synchronous `localStorage` reads in render paths.

  ```yaml
  enforcement:
    tier: T1
    pattern: "localStorage\\.(getItem|key|length)"
    assert: "No synchronous localStorage access in component render paths"
    scope: "src/components/**/*.{ts,tsx}"
    fix: "Move localStorage reads to a useEffect or custom hook that caches the value in state"
  ```

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/**/*.tsx"
    instruction: "Check all <img> elements for a loading attribute. A violation is any image missing the loading attribute entirely, or using loading=\"lazy\" on an above-the-fold image (hero images, first visible content), or using loading=\"eager\" on images that only appear after scrolling. Correct: every image has an explicit loading attribute matching its viewport position."
    triage_hint: "Image element missing loading attribute or with incorrect eager/lazy value"
    group: performance
    priority: 2
    critical: false
  ```

- Bundle size for any single route does not exceed 200kb gzipped.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Build output analysis asserts every route chunk is under 200kb gzipped"
  ```

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check component render functions for business logic — data transformations, conditional branching based on domain rules, calculations, or complex state derivations. A violation is any non-trivial logic (more than simple boolean checks for rendering) inside the component body or JSX. Correct: business logic is extracted into custom hooks (use* functions) or utility modules, and the component only handles rendering and event wiring."
    triage_hint: "Component render function contains business logic instead of delegating to hooks/utilities"
    group: architecture
    priority: 2
    critical: false
  ```

- Components follow the single responsibility principle.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Whether a component has a 'single responsibility' is inherently subjective — reviewers disagree on where boundaries should fall. No syntactic proxy, runtime assertion, or LLM judgment can reliably evaluate this without deep domain context."
  ```

- Side effects are isolated in custom hooks, never inline in event handlers.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check event handler functions (onClick, onChange, onSubmit, etc.) for inline side effects — fetch calls, localStorage writes, analytics tracking, or any I/O operation directly in the handler body. A violation is any side effect performed directly inside an event handler rather than delegated to a custom hook. Correct: event handlers call hook-provided functions (e.g., from useMutation, useBookActions) that encapsulate the side effect."
    triage_hint: "Event handler contains inline side effects (fetch, localStorage, analytics) instead of delegating to a custom hook"
    group: architecture
    priority: 2
    critical: false
  ```
