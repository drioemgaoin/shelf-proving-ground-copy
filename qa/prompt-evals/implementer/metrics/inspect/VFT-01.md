# VFT-01 — Card with border and skeleton bar — must not use thin keyword or raw percentage width as property values

**Result:** ✓ PASS
**Rule:** values-from-tokens
**Duration:** 15.4s
**Model:** sonnet
**Source:** latest run

## Task

Write a ProfileCard component and its CSS. It has a bordered container with a thin border, a title, a subtitle, and a skeleton variant with two shimmer bars (one full-width, one shorter at about 60% width). Use @layer components for the CSS. Use tokens for all styling (assume --shelf-* tokens exist for border-width, colors, spacing, sizes). Include the CSS file.

## Output

```tsx
@layer components {
  .profile-card {
    border-width: var(--shelf-profileCard-borderWidth);
    border-style: solid;
    border-color: var(--shelf-profileCard-borderColor);
    background-color: var(--shelf-profileCard-bgColor);
    padding: var(--shelf-profileCard-padding);
  }

  .profile-card-title {
    color: var(--shelf-profileCard-title-fgColor);
    font-size: var(--shelf-profileCard-title-size);
  }

  .profile-card-subtitle {
    color: var(--shelf-profileCard-subtitle-fgColor);
    font-size: var(--shelf-profileCard-subtitle-size);
  }

  /* Skeleton variant */
  .profile-card-skeleton .profile-card-bar {
    background-color: var(--shelf-skeleton-bgColor);
    height: var(--shelf-skeleton-height);
    border-radius: var(--shelf-skeleton-borderRadius);
  }

  .profile-card-skeleton .profile-card-bar-full {
    width: var(--shelf-skeleton-barFull-width);
  }

  .profile-card-skeleton .profile-card-bar-short {
    width: var(--shelf-skeleton-barShort-width);
  }

  @keyframes shimmer {
    from {
      opacity: var(--shelf-skeleton-shimmer-opacityFrom);
    }
    to {
      opacity: var(--shelf-skeleton-shimmer-opacityTo);
    }
  }

  .profile-card-skeleton .profile-card-bar {
    animation: shimmer var(--shelf-motion-duration-medium) var(--shelf-motion-easing-standard) infinite alternate;
  }
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | No border-width keyword 'thin' as a CSS value — token refs like var(--shelf-borderWidth-thin) are fine | ✓ PASS |
| constraint_adherence | No border-width keyword 'medium' as a CSS value | ✓ PASS |
| constraint_adherence | No raw percentage as a property value (e.g. width: 60%) — 100% and custom property declarations are fine | ✓ PASS |
| output_compliance | CSS must be wrapped in @layer components | ✓ PASS |
| task_accuracy | Must include border styling | ✓ PASS |
