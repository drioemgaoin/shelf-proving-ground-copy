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
    fix: "Replace 'as any' with a proper type assertion, type guard, or generic"
  ```

- No `export default`. Use named exports exclusively.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\bexport\\s+default\\b"
    assert: "No default exports — use named exports exclusively"
    scope: "src/**/*.{ts,tsx}"
    fix: "Replace 'export default' with a named export"
  ```

- No nested ternary expressions. Extract to variables or use if/else.

  ```yaml
  enforcement:
    tier: T1
    pattern: "\\?[^:]*\\?[^:]*:"
    assert: "No nested ternary expressions"
    scope: "src/**/*.{ts,tsx}"
    fix: "Extract nested ternary to variables or refactor to if/else"
  ```

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  ```yaml
  enforcement:
    tier: T1
    pattern: "(#[0-9a-fA-F]{3,8}|\\b\\d+px\\b|\\b\\d+rem\\b|rgb\\(|hsl\\()"
    assert: "No raw color/size values in component stylesheets — use token variables"
    scope: "src/components/**/*.css"
    fix: "Replace raw value with the corresponding design token variable"
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
    pattern: "z-index:\\s*(?!var\\(--)"
    assert: "No raw z-index values — use layer token variables"
    scope: "src/**/*.css"
    fix: "Replace raw z-index value with the corresponding layer token variable (e.g., var(--shelf-z-*))"
  ```

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  ```yaml
  enforcement:
    tier: T1
    pattern: "<img(?![^>]*\\balt\\b)[^>]*>"
    assert: "All <img> elements have an alt attribute"
    scope: "src/**/*.tsx"
    fix: "Add alt attribute — use descriptive text for informative images or alt=\"\" for decorative images"
  ```

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf, BookCard, Drawer"
    instruction: "Check all UI elements where color is used to convey status or meaning (e.g., status badges, alerts, form validation). A violation is any element where removing color would make the meaning ambiguous — there must be a redundant cue such as an icon, pattern, or text label. Correct: every color-coded element also has a non-color indicator of its meaning."
    group: accessibility
    priority: 1
    critical: false
  ```

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Tab sequence through interactive elements matches visual layout order (left-to-right, top-to-bottom) — verified by Playwright focus-order assertion on each page"
  ```

## Performance

- No synchronous `localStorage` reads in render paths.

  ```yaml
  enforcement:
    tier: T1
    pattern: "localStorage\\.(getItem|key|length)"
    assert: "No synchronous localStorage reads in component files — move reads to hooks or utilities"
    scope: "src/components/**/*.{ts,tsx}"
    fix: "Move localStorage reads to a custom hook or utility function outside the render path"
  ```

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    instruction: "Check all <img> elements on the page. Identify which images are above the fold (visible without scrolling) and which are below. A violation is an above-the-fold image with loading='lazy' or a below-the-fold image with loading='eager' or no loading attribute. Correct: above-fold images have loading='eager', below-fold images have loading='lazy'."
    group: performance
    priority: 2
    critical: false
  ```

- Bundle size for any single route does not exceed 200kb gzipped.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Build output analysis confirms no single route bundle exceeds 200kb gzipped"
  ```

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check whether component render functions contain business logic — data transformations, conditional branching based on domain rules, or calculations beyond simple display formatting. A violation is business logic (filtering, sorting, validation, state derivation) directly in the render body or JSX expressions rather than extracted to a custom hook or utility. Correct: components only call hooks/utilities and render the results."
    triage_hint: "Component render function contains data transformations or domain logic"
    group: architecture
    priority: 2
    critical: false
  ```

- Components follow the single responsibility principle.

  ```yaml
  enforcement:
    tier: Human
    review: "code reviewer"
    reason: "Whether a component has 'single responsibility' is inherently subjective — reviewers will disagree on where to draw the boundary. No automated system can reliably judge whether a component does 'too much' without understanding the domain context and team conventions."
  ```

- Side effects are isolated in custom hooks, never inline in event handlers.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.{ts,tsx}"
    instruction: "Check event handler functions in components for inline side effects — API calls (fetch, axios), direct DOM manipulation, localStorage writes, analytics events, or navigation. A violation is a side effect performed directly inside an onClick/onChange/onSubmit handler rather than delegated to a custom hook. Correct: event handlers call hook-returned functions that encapsulate the side effect."
    triage_hint: "Event handler contains inline side effects (fetch, DOM manipulation, storage writes)"
    group: architecture
    priority: 2
    critical: false
  ```
