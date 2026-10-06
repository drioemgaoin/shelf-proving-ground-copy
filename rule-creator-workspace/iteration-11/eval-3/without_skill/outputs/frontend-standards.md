---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn 'as any' src/ --include='*.ts' --include='*.tsx'
  # Autofix: none — requires manual type narrowing
  ```

- No `export default`. Use named exports exclusively.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn 'export default' src/ --include='*.ts' --include='*.tsx'
  # Autofix: replace `export default <name>` with `export { <name> }` or inline `export const/function`
  ```

- No nested ternary expressions. Extract to variables or use if/else.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn '?\s*.*\s*?.*:' src/ --include='*.ts' --include='*.tsx' (heuristic for nested ternaries)
  # Autofix: none — requires manual extraction to variables or if/else
  ```

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn -E ':\s*[0-9]+px|:\s*[0-9]+rem|:\s*#[0-9a-fA-F]{3,8}|rgb\(' src/ --include='*.css' --include='*.scss' --exclude='tokens.css'
  # Autofix: none — requires mapping hardcoded values to the correct design token
  ```

- Animations use only `transform` and `opacity` properties.

  **Enforcement:** review-gate
  ```
  When reviewing animation or transition CSS, verify that only `transform` and `opacity`
  are animated. Flag any `transition` or `@keyframes` that animates other properties
  (e.g., `width`, `height`, `margin`, `top`, `left`, `background-color`).
  ```

- Never set a raw `z-index` value. Use the layer token system.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn 'z-index:\s*[0-9]' src/ --include='*.css' --include='*.scss' --exclude='tokens.css'
  # Autofix: replace raw integer with the appropriate layer token variable (e.g., `var(--layer-overlay)`)
  ```

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn '<img ' src/ --include='*.tsx' | grep -v 'alt='
  # Autofix: none — requires contextual alt text authored by a human
  ```

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  **Enforcement:** review-gate
  ```
  When reviewing any UI that uses color to signal status, errors, warnings, or categories,
  verify a secondary visual indicator (icon, pattern, text label, or border style) is also
  present. Flag components where removing color would make the meaning ambiguous.
  ```

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  **Enforcement:** review-gate
  ```
  When reviewing layout changes or new components, verify that DOM order matches visual
  reading order. Flag any use of `tabindex` > 0, CSS `order` that reorders focusable
  elements, or `flex-direction: row-reverse` / `column-reverse` on containers with
  interactive children.
  ```

## Performance

- No synchronous `localStorage` reads in render paths.

  **Enforcement:** grep-barrier
  ```bash
  # Detect: grep -rn 'localStorage\.\(getItem\|setItem\|removeItem\)' src/ --include='*.tsx' --include='*.ts'
  # Then manually verify flagged usages are not inside render functions or component bodies.
  # Autofix: none — move reads to useEffect or a lazy initializer
  ```

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  **Enforcement:** review-gate
  ```
  When reviewing components that render <img> tags, verify the `loading` attribute is set.
  Images in hero sections, headers, or initial viewport content must use `loading="eager"`.
  Images in scrollable lists, footers, or below-fold sections must use `loading="lazy"`.
  Flag any <img> missing the `loading` attribute entirely.
  ```

- Bundle size for any single route does not exceed 200kb gzipped.

  **Enforcement:** ci-gate
  ```
  Add a build step or CI check that measures per-route gzipped bundle size.
  Fail the build if any route chunk exceeds 200kb gzipped.
  Tool: use `source-map-explorer` or `bundlesize` with per-route thresholds.
  ```

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  **Enforcement:** review-gate
  ```
  When reviewing components, flag business logic (data transformations, calculations,
  conditional branching beyond simple rendering, API calls) that lives directly in the
  component body or JSX. Logic should be extracted to custom hooks or utility functions
  and imported.
  ```

- Components follow the single responsibility principle.

  **Enforcement:** review-gate
  ```
  When reviewing new or modified components, flag any component that handles more than
  one concern (e.g., fetching data AND rendering a form AND managing navigation state).
  Each component should own one clearly stated responsibility. Suggest splitting if
  multiple concerns are interleaved.
  ```

- Side effects are isolated in custom hooks, never inline in event handlers.

  **Enforcement:** review-gate
  ```
  When reviewing event handlers in components, flag any side effect (API calls, analytics
  tracking, localStorage writes, navigation, dispatching to external stores) that is
  performed directly inside an onClick/onChange/onSubmit handler. Side effects should be
  dispatched through a custom hook that encapsulates the effect.
  ```
