# Rules patches to apply manually

## 1. `.claude/rules/ui-project.md` — restore `## Syntax` section (before `## Vocabulary`, line 144)

The `## Syntax` section with `no-bem-separators` and `media-range-notation` was removed as collateral in commit `ea5e342` (Revert sandcastle reset). Without it the sandcastle agent writes BEM classes, then wastes a cycle renaming after stylelint catches it.

**Insert before** `## Vocabulary`:

```markdown
## Syntax

- Class selectors use kebab-case: `.chip-bar`, `.card-title`, `.skeleton-pill`. The linter enforces `selector-class-pattern` (kebab-case only).

  CORRECT: `.card-title { }`
  WRONG: `.card__title { }` — BEM `__` and `--` separators are not used

  ```enforcement
  id: "no-bem-separators"
  tier: T1
  tool: selector-class-pattern
  - pattern: "\\.[a-z][a-z0-9]*__"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use kebab-case: .card-title not .card__title"
  - pattern: "\\.[a-z][a-z0-9]*--"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use kebab-case: .card-title not .card__title"
  ```

- Media queries use range notation: `@media (width >= 768px)`. The linter enforces `media-feature-range-notation` (modern range syntax).

  CORRECT: `@media (width >= 768px) { }`
  WRONG: `@media (min-width: 768px) { }`

  ```enforcement
  id: "media-range-notation"
  tier: T1
  tool: media-feature-range-notation
  - pattern: "\\((min|max)-(width|height)\\s*:"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use range notation: @media (width >= 768px) not @media (min-width: 768px)"
  ```
```

---

## 2. `.claude/rules/ui-base.md` — restore `base-layer-exists` rule (before `no-outer-margin`, line 47)

The `base-layer-exists` T1 rule was removed as collateral in commit `ea5e342` (Revert sandcastle reset). Without it the agent never writes `@layer base { body { ... } }` in `tokens.css`, so the page surface falls back to the browser's white UA background — visible as white margins around the dark-mode content.

**Insert before** `- Components own no space outside themselves.`:

```markdown
- Every project must include a `@layer base` that applies design tokens to bare HTML elements. This is the layer where the design system takes control from the browser UA stylesheet. At minimum, `body` receives the page-surface background, default text color, base font family, and `margin: 0`. Without a base layer, bare elements render with UA defaults (white background, black text, 8px margin) and the design system is not in control of the page surface.

  ```enforcement
  id: "base-layer-exists"
  tier: T1
  - pattern: "@layer base"
    assert: present
    scope: "src/styles/tokens.css"
    fix: "Add a @layer base block after @layer tokens that sets body { margin: 0; background-color: var(--<ns>-bgColor-default); color: var(--<ns>-fgColor-default); font-family: var(--<ns>-font-family-base); }"
  ```
```
