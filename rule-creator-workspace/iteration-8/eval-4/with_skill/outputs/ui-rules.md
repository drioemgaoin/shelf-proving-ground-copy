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

## NEW RULES TO ADD (no enforcement yet)

- Empty states show a helpful message and a call-to-action, not just blank space.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "EmptyState, Shelf"
    instruction: "Navigate to views with no data (empty shelf, empty search results, empty filter). Verify each empty state displays a descriptive message explaining why the view is empty and includes a visible call-to-action button or link (e.g., 'Add a book'). A violation is blank white space, a generic 'no results' with no CTA, or a missing empty state altogether. Correct: a centered message with context-appropriate text and a prominent CTA."
    group: interaction
    priority: 1
    critical: false
  ```

- Error states include a retry mechanism and a human-readable explanation.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "ErrorState, Shelf"
    instruction: "Trigger error states (network failure, load failure). Verify each error state shows a human-readable explanation of what went wrong (not a raw error code or stack trace) and includes a visible retry button or link. A violation is a blank screen, a raw error message, or an error with no retry mechanism. Correct: a friendly error message explaining the problem and a 'Retry' or 'Try again' button."
    group: interaction
    priority: 1
    critical: false
  ```

- Modal dialogs are centered and never extend beyond the viewport.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Drawer, Dialog"
    instruction: "Open every modal dialog at mobile, tablet, and desktop widths. Verify each dialog is visually centered (horizontally and vertically, or horizontally with consistent top margin) and that no part of the dialog extends beyond the viewport edges — no clipped content, no horizontal scrollbar triggered by the dialog. A violation is an off-center dialog or one whose edges overflow the viewport. Correct: dialog is centered with all content visible within the viewport."
    group: layout
    priority: 1
    critical: false
  ```
