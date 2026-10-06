---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.

  **Enforcement:**
  Before completing any code change, grep for `as any` in all modified and new files under `src/`. If any match is found, replace it with proper type narrowing (type guards, generics, or explicit types). Do not suggest `as any` as a workaround. Fail the review if `as any` remains.

- No `export default`. Use named exports exclusively.

  **Enforcement:**
  Before completing any code change, grep for `export default` in all modified and new files under `src/`. If any match is found, convert to a named export. Do not introduce `export default` in new code. Fail the review if any `export default` remains.

- No nested ternary expressions. Extract to variables or use if/else.

  **Enforcement:**
  Before completing any code change, scan all modified and new files under `src/` for nested ternary expressions (a ternary inside another ternary's branch). If found, refactor to extracted variables or if/else blocks. Fail the review if any nested ternary remains.

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  **Enforcement:**
  Before completing any code change, scan all modified and new `.css`, `.scss`, and style blocks in `src/` for hardcoded `px`, `rem`, hex color values (e.g., `#fff`, `#a1b2c3`), or `rgb()`/`rgba()` calls. Exception: `0px` and values inside `tokens.css` itself. If any hardcoded value is found, replace it with the corresponding design token variable. Fail the review if hardcoded values remain.

- Animations use only `transform` and `opacity` properties.

  **Enforcement:**
  Before completing any code change, scan all `@keyframes` blocks, `transition` properties, and `animation` declarations in modified and new files under `src/`. If any animated property other than `transform` or `opacity` is used (e.g., `width`, `height`, `top`, `left`, `background-color`, `margin`), refactor to use only `transform` and `opacity`. Fail the review if non-compositable animation properties remain.

- Never set a raw `z-index` value. Use the layer token system.

  **Enforcement:**
  Before completing any code change, grep for `z-index:` in all modified and new stylesheets under `src/`. If any `z-index` is set to a raw numeric literal (e.g., `z-index: 10`) instead of a layer token variable (e.g., `var(--layer-...)`), replace it with the appropriate layer token. Fail the review if any raw `z-index` value remains.

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  **Enforcement:**
  Before completing any code change, scan all modified and new files under `src/` for `<img` tags and image components. Every image must have an `alt` attribute. Decorative images must use `alt=""`. If any image is missing the `alt` attribute entirely, add appropriate alt text or `alt=""` for decorative images. Fail the review if any image lacks an `alt` attribute.

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  **Enforcement:**
  Before completing any code change, review all modified and new UI elements that use color to communicate state (e.g., status indicators, error states, success messages, badges). Each must have a secondary indicator — an icon, pattern, or text label — so that meaning is not lost without color. Fail the review if any element relies solely on color to convey meaning.

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  **Enforcement:**
  Before completing any code change, verify that modified and new interactive elements in `src/` do not use positive `tabindex` values (e.g., `tabindex="2"`). Only `tabindex="0"` and `tabindex="-1"` are permitted. Ensure DOM order matches the intended visual reading order (left-to-right, top-to-bottom). If CSS reorders elements visually, verify that either DOM order is adjusted or `tabindex` is used correctly. Fail the review if tab order diverges from visual order.

## Performance

- No synchronous `localStorage` reads in render paths.

  **Enforcement:**
  Before completing any code change, grep for `localStorage.getItem` and `localStorage.setItem` in all modified and new files under `src/`. If any call appears inside a component render function body (outside of `useEffect`, event handlers, or initialization logic), move it into a `useEffect`, a custom hook, or an event handler. Fail the review if synchronous `localStorage` access remains in a render path.

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  **Enforcement:**
  Before completing any code change, scan all modified and new `<img` tags and image components in `src/`. Images known to appear above the fold must have `loading="eager"` (or omit the attribute, as eager is the default). Images below the fold must have `loading="lazy"`. If a new image is added without an explicit `loading` attribute and it is below the fold, add `loading="lazy"`. Fail the review if below-fold images lack `loading="lazy"`.

- Bundle size for any single route does not exceed 200kb gzipped.

  **Enforcement:**
  Before completing any code change that adds a new dependency or significant code to a route, run the build and check gzipped bundle sizes per route. If any single route chunk exceeds 200kb gzipped, refactor by code-splitting, lazy-loading, or removing unnecessary dependencies. Fail the review if a route exceeds the 200kb gzipped limit.

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  **Enforcement:**
  Before completing any code change, review all modified and new component files in `src/`. If any component render function contains business logic (data transformation, validation, complex conditional logic, calculations beyond simple display mapping), extract it into a custom hook or utility function. Render functions should only contain JSX composition and simple display logic. Fail the review if business logic remains in a render function.

- Components follow the single responsibility principle.

  **Enforcement:**
  Before completing any code change, review all modified and new components in `src/`. If a component handles more than one concern (e.g., data fetching and presentation, or multiple unrelated UI sections), split it into focused sub-components or extract logic into hooks. A component should have one reason to change. Fail the review if a component clearly violates single responsibility.

- Side effects are isolated in custom hooks, never inline in event handlers.

  **Enforcement:**
  Before completing any code change, scan all modified and new components in `src/` for side effects (API calls, localStorage writes, analytics events, logging, DOM manipulation) placed directly inside event handler functions. If found, extract the side effect into a custom hook that exposes a trigger function. Event handlers should call hook-provided functions, not perform side effects directly. Fail the review if inline side effects remain in event handlers.
