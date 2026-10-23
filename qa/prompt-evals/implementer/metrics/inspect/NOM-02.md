# NOM-02 — Card grid with list reset — must not put margin/padding reset in component CSS

**Result:** ✗ FAIL
**Rule:** no-outer-margin
**Duration:** 11.4s
**Model:** sonnet
**Source:** latest run

## Task

Write a ProjectGrid component and its CSS. It renders a <ul role="list"> of project cards as <li> elements. Each card has a <p> for the project name and a <p> for the description. The grid uses CSS grid with auto-fill columns. Use @layer components. Use tokens for all styling (assume --shelf-* tokens exist). Include the CSS file.

## Output

```tsx
@layer components {
  .project-grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--shelf-grid-col-min, 16rem), 1fr));
    gap: var(--shelf-grid-gap, var(--shelf-spacing-md));
    padding: 0;
  }

  .project-card {
    background-color: var(--shelf-card-bg);
    border: var(--shelf-card-border-width) solid var(--shelf-card-border-color);
    border-radius: var(--shelf-card-radius);
    padding: var(--shelf-card-padding);
    display: flex;
    flex-direction: column;
    gap: var(--shelf-card-gap, var(--shelf-spacing-xs));
  }

  .project-card-name {
    color: var(--shelf-card-title-color);
    font-size: var(--shelf-card-title-size);
    font-weight: var(--shelf-card-title-weight);
  }

  .project-card-description {
    color: var(--shelf-card-description-color);
    font-size: var(--shelf-card-description-size);
  }
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | No margin: 0 in component CSS — list/paragraph resets belong in @layer base | ✓ PASS |
| constraint_adherence | No padding: 0 list reset in component CSS — belongs in @layer base | ✗ FAIL — Found at offset 233: padding: 0 |
| constraint_adherence | No margin-block resets in component CSS | ✓ PASS |
| output_compliance | CSS must be wrapped in @layer components | ✓ PASS |
| task_accuracy | Must use CSS grid for the layout | ✓ PASS |
