---
paths: src/**/*
---

# UI Rules (Budget Pressure Scenario)

This file simulates a project that already has many T3 enforcement blocks, approaching the budget limit.

## Layout

- Cards maintain consistent aspect ratios across breakpoints.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "CardGrid"
    instruction: "Verify cards maintain consistent aspect ratios at mobile, tablet, and desktop widths."
    group: layout
    priority: 2
    critical: false
  ```

- Navigation is always reachable without scrolling.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Navigation"
    instruction: "Verify nav is visible and reachable without scrolling at all viewport sizes."
    group: layout
    priority: 1
    critical: false
  ```

## Typography

- Headings follow a clear visual hierarchy (h1 > h2 > h3 in size and weight).

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Verify heading sizes decrease monotonically from h1 to h3."
    group: typography
    priority: 3
    critical: false
  ```

- Body text is readable at default zoom (no text smaller than 14px equivalent).

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Verify no body text appears smaller than 14px."
    group: typography
    priority: 2
    critical: false
  ```

- Line length does not exceed 80 characters on wide screens.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "ContentArea"
    instruction: "Verify text containers constrain line length to roughly 80 characters on desktop."
    group: typography
    priority: 3
    critical: false
  ```

## Color and Theming

- Dark mode has no white-on-white or black-on-black text.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "In dark mode, verify no text is invisible due to matching foreground/background colors."
    group: theming
    priority: 1
    critical: true
  ```

- Accent colors are used sparingly — no more than 2 accent-colored elements visible at once.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Count accent-colored elements in viewport. Flag if more than 2 are visible simultaneously."
    group: theming
    priority: 3
    critical: false
  ```

## Interaction

- Hover effects are visible and consistent across all interactive elements.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Hover each interactive element and verify a visible state change occurs."
    group: interaction
    priority: 2
    critical: false
  ```

- Disabled elements look visually distinct from enabled ones.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Verify disabled buttons/inputs are visually distinguishable from their enabled state."
    group: interaction
    priority: 2
    critical: false
  ```

- Loading states show a skeleton or spinner, never a blank screen.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "During data loading, verify a skeleton or spinner is shown, not an empty white area."
    group: interaction
    priority: 1
    critical: true
  ```

## Spacing

- No two elements touch or overlap unintentionally.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "*"
    instruction: "Verify no elements overlap or touch without intentional design (e.g. overlapping avatars)."
    group: spacing
    priority: 2
    critical: false
  ```

## States and Feedback

- Empty states show a helpful message and a call-to-action, not just blank space.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "EmptyState"
    instruction: "Verify empty states display a descriptive message explaining why there is no content and include a visible call-to-action (button or link) that guides the user to add content. A blank or whitespace-only area is a violation."
    group: states
    priority: 1
    critical: false
  ```

- Error states include a retry mechanism and a human-readable explanation.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "ErrorState"
    instruction: "Verify error states show a human-readable explanation of what went wrong (not a raw error code or stack trace) and include a retry button or link. An error screen with no retry mechanism or with only a technical message is a violation."
    group: states
    priority: 1
    critical: false
  ```

- Modal dialogs are centered and never extend beyond the viewport.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Dialog"
    instruction: "Verify modal dialogs are visually centered in the viewport (both horizontally and vertically) and that no part of the dialog extends beyond the viewport edges at any supported breakpoint. Overflow, clipping, or off-center positioning is a violation."
    group: layout
    priority: 1
    critical: false
  ```
