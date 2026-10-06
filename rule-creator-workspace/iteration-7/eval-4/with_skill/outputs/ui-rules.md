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
    scope: "EmptyState"
    instruction: "Navigate to each empty state (e.g. via ?fixture=empty or by clearing data). Verify a descriptive message is displayed explaining why there is no content, and a visible call-to-action button or link is present. A violation is a blank or near-blank area with no guidance text or no actionable element. Correct: a centered message explaining the empty condition plus a CTA such as 'Add your first book'."
    group: states
    priority: 2
    critical: false
  ```

- Error states include a retry mechanism and a human-readable explanation.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "ErrorState"
    instruction: "Trigger each error state (e.g. via ?fixture=error or by simulating a network failure). Verify the screen shows a human-readable error message explaining what went wrong, and a retry button or link is present and visually prominent. A violation is a raw error code, stack trace, or missing retry mechanism. Correct: a plain-language explanation (e.g. 'Something went wrong — please try again') alongside a clearly labeled retry button."
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
    instruction: "Open each modal dialog at mobile, tablet, and desktop widths. Verify the dialog is visually centered in the viewport (or bottom-anchored on mobile as a bottom sheet) and that no part of the dialog extends beyond the visible viewport edges. A violation is a dialog that is off-center, clipped, or requires scrolling the page to see the dialog controls. Correct: the dialog is centered with all content and controls visible within the viewport."
    group: layout
    priority: 1
    critical: false
  ```
