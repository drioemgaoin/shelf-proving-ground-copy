---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.

  <enforcement>
  When writing or modifying TypeScript code, grep changed files for `as any`.
  If found, rewrite using type narrowing (type guards, `instanceof`, discriminated unions) or generics.
  Do not merge or consider the task complete while any `as any` remains in changed files.
  </enforcement>

- No `export default`. Use named exports exclusively.

  <enforcement>
  When writing or modifying module exports, grep changed files for `export default`.
  If found, convert to a named export (`export const`, `export function`, `export class`, etc.).
  Do not merge or consider the task complete while any `export default` remains in changed files.
  </enforcement>

- No nested ternary expressions. Extract to variables or use if/else.

  <enforcement>
  When writing or modifying conditional expressions, grep changed files for nested ternaries (a ternary `?` whose branch contains another `?`).
  If found, refactor to extracted variables, if/else blocks, or a lookup object.
  Do not merge or consider the task complete while any nested ternary remains in changed files.
  </enforcement>

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  <enforcement>
  When writing or modifying component stylesheets, grep changed CSS/SCSS files for raw `px`, `rem`, hex color codes (`#`), and `rgb()`/`rgba()` values.
  If found, replace with the corresponding design token (`var(--...)`). The only exception is `tokens.css` itself.
  Do not merge or consider the task complete while any hardcoded value remains in component stylesheets.
  </enforcement>

- Animations use only `transform` and `opacity` properties.

  <enforcement>
  When writing or modifying CSS animations or transitions, inspect the `animation`, `transition`, `@keyframes`, and individual property changes in changed stylesheets.
  If any animated/transitioned property is not `transform` or `opacity`, rewrite to use only those two properties.
  Do not merge or consider the task complete while any non-compliant animation property remains.
  </enforcement>

- Never set a raw `z-index` value. Use the layer token system.

  <enforcement>
  When writing or modifying CSS, grep changed stylesheets for `z-index:` followed by a numeric literal.
  If found, replace with the appropriate layer token (`var(--layer-...)`).
  Do not merge or consider the task complete while any raw `z-index` numeric value remains in changed files.
  </enforcement>

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  <enforcement>
  When writing or modifying JSX/TSX that includes `<img>` elements, verify every `<img>` has an `alt` attribute.
  If an `alt` attribute is missing, add descriptive alt text or `alt=""` for decorative images.
  Do not merge or consider the task complete while any `<img>` lacks an `alt` attribute.
  </enforcement>

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  <enforcement>
  When writing or modifying UI that uses color to indicate state (e.g., status badges, error highlights, success indicators), verify that a non-color cue (icon, pattern, or text label) is also present.
  If color is the sole differentiator, add a secondary indicator (icon, text, or pattern).
  Do not merge or consider the task complete while any status or state relies on color alone.
  </enforcement>

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  <enforcement>
  When writing or modifying interactive elements, verify that the DOM order matches the visual layout (left-to-right, top-to-bottom). Grep for positive `tabindex` values (e.g., `tabindex="1"`, `tabindex={2}`).
  If found, remove the positive `tabindex` and reorder elements in the DOM instead. `tabindex="0"` and `tabindex="-1"` are acceptable.
  Do not merge or consider the task complete while any positive `tabindex` or DOM-order/visual-order mismatch remains.
  </enforcement>

## Performance

- No synchronous `localStorage` reads in render paths.

  <enforcement>
  When writing or modifying component render functions or code called during render, grep for `localStorage.getItem` and `localStorage.setItem`.
  If found in a render path (component body, useMemo, derived state), move the call into a `useEffect`, event handler, or initialization outside the render cycle.
  Do not merge or consider the task complete while any synchronous `localStorage` access exists in a render path.
  </enforcement>

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  <enforcement>
  When writing or modifying `<img>` elements, verify the `loading` attribute is set correctly: `loading="eager"` for above-the-fold images, `loading="lazy"` for below-the-fold images.
  If the attribute is missing or incorrect, add or fix it based on the image's viewport position.
  Do not merge or consider the task complete while any `<img>` is missing a correct `loading` attribute.
  </enforcement>

- Bundle size for any single route does not exceed 200kb gzipped.

  <enforcement>
  When adding new dependencies or significant code to a route, run the build and check the gzipped output size for affected route chunks.
  If any single route chunk exceeds 200kb gzipped, split the route via code-splitting (`React.lazy`, dynamic `import()`) or remove/replace heavy dependencies.
  Do not merge or consider the task complete while any route chunk exceeds the 200kb gzipped limit.
  </enforcement>

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  <enforcement>
  When writing or modifying components, check whether the render function body contains business logic (data transformation, validation, complex conditionals beyond simple display branching).
  If found, extract into a custom hook (`use*`) or a utility function in a separate module.
  Do not merge or consider the task complete while business logic remains inline in a component render function.
  </enforcement>

- Components follow the single responsibility principle.

  <enforcement>
  When writing or modifying components, verify each component has one clearly defined responsibility.
  If a component manages multiple concerns (e.g., data fetching + form handling + list rendering), split it into focused child components or extract concerns into hooks.
  Do not merge or consider the task complete while any component handles multiple unrelated responsibilities.
  </enforcement>

- Side effects are isolated in custom hooks, never inline in event handlers.

  <enforcement>
  When writing or modifying event handlers, grep for side effects (API calls, analytics, navigation, DOM mutations) directly inside event handler functions.
  If found, extract the side effect into a custom hook that exposes a trigger function, and call that function from the handler.
  Do not merge or consider the task complete while any side effect is inlined in an event handler.
  </enforcement>
