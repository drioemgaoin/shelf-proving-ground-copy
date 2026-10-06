---
paths: src/components/**/*
---

# UI Rules

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

- Sidebar does not overlap content on tablet widths.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Sidebar"
    instruction: "Verify sidebar does not overlap main content area between 768px and 1024px."
    group: layout
    priority: 2
    critical: false
  ```

## Typography

- Headings follow a clear visual hierarchy.

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

- Body text is readable at default zoom.

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

## Theming

- Dark mode has no invisible text.

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

- Accent colors are used sparingly.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Dashboard"
    instruction: "Count accent-colored elements. Flag if more than 2 visible simultaneously."
    group: theming
    priority: 3
    critical: false
  ```

## Interaction

- Loading states show a skeleton or spinner.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "DataTable, CardGrid"
    instruction: "During data loading, verify a skeleton or spinner is shown, not an empty white area."
    group: interaction
    priority: 1
    critical: true
  ```
