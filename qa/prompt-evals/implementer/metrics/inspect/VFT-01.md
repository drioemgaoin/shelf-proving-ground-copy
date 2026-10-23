# VFT-01 — Card with border and skeleton bar — must not use thin keyword or raw percentage width

**Result:** ✗ FAIL
**Rule:** values-from-tokens
**Duration:** 19.1s
**Model:** sonnet
**Source:** latest run

## Task

Write a ProfileCard component and its CSS. It has a bordered container with a thin border, a title, a subtitle, and a skeleton variant with two shimmer bars (one full-width, one shorter at about 60% width). Use @layer components for the CSS. Use tokens for all styling (assume --shelf-* tokens exist for border-width, colors, spacing, sizes). Include the CSS file.

## Output

```tsx
@layer components {
  /* Component-scoped tokens */
  .profile-card {
    --shelf-profile-card-border: var(--shelf-borderWidth-thin) solid var(--shelf-borderColor-default);
    --shelf-profile-card-padding: var(--shelf-space-md);
    --shelf-profile-card-radius: var(--shelf-radius-md);
    --shelf-profile-card-gap: var(--shelf-space-sm);
    --shelf-profile-card-skeleton-short-width: 60%;

    background-color: var(--shelf-bgColor-raised);
    border: var(--shelf-profile-card-border);
    border-radius: var(--shelf-profile-card-radius);
    padding: var(--shelf-profile-card-padding);
    display: flex;
    flex-direction: column;
    gap: var(--shelf-profile-card-gap);
  }

  .profile-card-title {
    font-size: var(--shelf-font-size-lg);
    font-weight: var(--shelf-font-weight-semibold);
    color: var(--shelf-fgColor-default);
    line-height: var(--shelf-space-lg);
  }

  .profile-card-subtitle {
    font-size: var(--shelf-font-size-sm);
    font-weight: var(--shelf-font-weight-regular);
    color: var(--shelf-fgColor-muted);
    line-height: var(--shelf-space-lg);
  }

  /* Skeleton shimmer bars */
  .profile-card-skeleton-bar {
    height: var(--shelf-space-md);
    border-radius: var(--shelf-radius-sm);
    background-color: var(--shelf-borderColor-subtle);
    animation: profile-card-shimmer var(--shelf-motion-duration-slow) var(--shelf-motion-easing-enter) infinite alternate;
  }

  .profile-card-skeleton-bar--short {
    width: var(--shelf-profile-card-skeleton-short-width);
  }

  @keyframes profile-card-shimmer {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | No border-width keyword 'thin' — use a --shelf-borderWidth-* token | ✗ FAIL — Found at offset 127: thin |
| constraint_adherence | No border-width keyword 'medium' — use a --shelf-borderWidth-* token | ✓ PASS |
| constraint_adherence | No raw percentage values — use a component token (e.g. --shelf-skeleton-bar-short-width) | ✗ FAIL — Found at offset 387: 60% |
| output_compliance | CSS must be wrapped in @layer components | ✓ PASS |
| task_accuracy | Must include border styling | ✓ PASS |
