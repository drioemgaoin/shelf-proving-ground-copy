---
paths: src/**/*
---

# Frontend Standards

## CSS

- Never set a raw `z-index` value. Use the layer token system.

  ```yaml
  enforcement:
    tier: T1
    tool: stylelint
    rule: "plugin/no-raw-z-index"
    fix: "Replace raw z-index with a layer token from tokens.css (e.g., var(--z-dropdown))."
  ```

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

## Accessibility

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  ```yaml
  enforcement:
    tier: Human
    review: "Manual accessibility review during PR"
    reason: "visual-qa agent produces too many false positives on color-only checks; human judgment required."
  ```

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.
