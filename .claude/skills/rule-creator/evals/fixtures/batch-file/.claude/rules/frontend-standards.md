---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.
- No `export default`. Use named exports exclusively.
- No nested ternary expressions. Extract to variables or use if/else.

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.
- Animations use only `transform` and `opacity` properties.
- Never set a raw `z-index` value. Use the layer token system.

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).
- Color alone does not convey meaning. Use icons, patterns, or text labels as well.
- Tab order follows visual reading order (left-to-right, top-to-bottom).

## Performance

- No synchronous `localStorage` reads in render paths.
- Images above the fold use `loading="eager"`, below use `loading="lazy"`.
- Bundle size for any single route does not exceed 200kb gzipped.

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.
- Components follow the single responsibility principle.
- Side effects are isolated in custom hooks, never inline in event handlers.
