# NOM-02 — Card grid with list reset — must not put margin/padding reset in component CSS

**Result:** ✗ FAIL
**Rule:** no-outer-margin
**Duration:** 11.6s
**Model:** sonnet
**Source:** latest run

## Task

Write a ProjectGrid component CSS file. It styles a <ul role="list"> of project cards as <li> elements. Each card has a <p> for the project name and a <p> for the description. The grid uses CSS grid with auto-fill columns. Use @layer components. Use tokens for all styling (assume --shelf-* tokens exist). Element resets (margin: 0, padding: 0, list-style: none) belong in @layer base, not in component CSS. Output the complete CSS file content directly.

## Output

```tsx
```css
@layer components {
  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--shelf-projectGrid-column-min-size), 1fr));
    gap: var(--shelf-projectGrid-gap);
  }

  .project-card {
    background-color: var(--shelf-projectGrid-card-bgColor-default);
    color: var(--shelf-projectGrid-card-fgColor-default);
    border: var(--shelf-projectGrid-card-borderWidth) solid var(--shelf-projectGrid-card-borderColor-default);
    border-radius: var(--shelf-projectGrid-card-borderRadius);
    padding: var(--shelf-projectGrid-card-padding);
  }

  .project-card-name {
    color: var(--shelf-projectGrid-cardName-fgColor);
    font-size: var(--shelf-projectGrid-cardName-fontSize);
    font-weight: var(--shelf-projectGrid-cardName-fontWeight);
  }

  .project-card-description {
    color: var(--shelf-projectGrid-cardDescription-fgColor);
    font-size: var(--shelf-projectGrid-cardDescription-fontSize);
  }
}
```

**Key decisions:**

- `auto-fill` + `minmax` gives responsive columns without breakpoints or raw `px` values — the min size comes from a token.
- No `margin`, `padding: 0`, or `list-style: none` — those resets belong in `@layer base`.
- Every visual value is a `--shelf-projectGrid-*` component-tier token. You'd need to define all of them in `tokens.css` (including dark-mode blocks) before this compiles cleanly.
- `gap` uses a token instead of a raw length.
- Class names are kebab-case throughout.
```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | No margin: 0 in component CSS — list/paragraph resets belong in @layer base | ✓ PASS |
| constraint_adherence | No padding: 0 list reset in component CSS — belongs in @layer base | ✗ FAIL — Found at offset 1117: padding: 0 |
| constraint_adherence | No margin-block resets in component CSS | ✓ PASS |
| output_compliance | CSS must be wrapped in @layer components | ✓ PASS |
| task_accuracy | Must use CSS grid for the layout | ✓ PASS |
