---
paths: src/**/*
---

# Frontend Standards

## CSS

- Never set a raw `z-index` value. Use the layer token system.

  ```enforcement
  tier: T1
  tool: "Stylelint shelf/no-raw-z-index"
  - pattern: "z-index:\\s*[0-9]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use a var(--shelf-layer-*) token from src/styles/tokens.css instead of a raw z-index value"
  ```

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

## Accessibility

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```enforcement
  tier: Human
  review: morning-review
  reason: "Visual-qa produces too many false positives — requires human judgment to determine whether color is the sole information channel"
  ```

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.
