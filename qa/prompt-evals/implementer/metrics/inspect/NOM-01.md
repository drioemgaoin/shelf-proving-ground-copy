# NOM-01 — Centered page wrapper with list and paragraphs — must not use margin-inline: auto or margin: 0 in component CSS

**Result:** ✓ PASS
**Rule:** no-outer-margin
**Duration:** 15.9s
**Model:** sonnet
**Source:** latest run

## Task

Write a FeedPage component and its CSS. It renders a centered content wrapper (max-width 960px) containing a heading, a <ul role="list"> of <li> FeedItem cards, and each card has a <p> for title and a <p> for description. The wrapper is centered on the page. Use @layer components for the CSS. Use tokens for all styling (assume --shelf-* tokens exist). Include the CSS file.

## Output

```tsx
@layer components {
  .feed-page {
    display: flex;
    justify-content: center;
    padding: var(--shelf-space-md);
  }

  .feed-page-wrapper {
    width: 100%;
    max-width: 960px;
  }

  .feed-page-heading {
    font-size: var(--shelf-font-size-xl);
    font-weight: var(--shelf-font-weight-bold);
    color: var(--shelf-color-text-primary);
    margin-block-end: var(--shelf-space-lg);
  }

  .feed-list {
    display: flex;
    flex-direction: column;
    gap: var(--shelf-space-md);
    list-style: none;
    padding: 0;
  }

  .feed-item {
    background-color: var(--shelf-color-surface);
    border-radius: var(--shelf-radius-md);
    padding: var(--shelf-space-md);
    box-shadow: var(--shelf-shadow-sm);
  }

  .feed-item-title {
    font-size: var(--shelf-font-size-md);
    font-weight: var(--shelf-font-weight-semibold);
    color: var(--shelf-color-text-primary);
    margin-block-end: var(--shelf-space-xs);
  }

  .feed-item-description {
    font-size: var(--shelf-font-size-sm);
    color: var(--shelf-color-text-secondary);
  }
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | No margin-inline: auto — centering is the parent's job, not the child's | ✓ PASS |
| constraint_adherence | No margin: 0 resets in component CSS — element resets belong in @layer base | ✓ PASS |
| constraint_adherence | No margin-block: 0 resets in component CSS — element resets belong in @layer base | ✓ PASS |
| output_compliance | CSS must be wrapped in @layer components | ✓ PASS |
| task_accuracy | Must set a max-width on the content wrapper | ✓ PASS |
