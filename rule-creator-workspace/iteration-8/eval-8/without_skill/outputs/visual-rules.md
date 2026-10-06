---
paths: "src/**/*"
---

# Visual Rules

## Empty States

- Empty states show a helpful illustration, not just text.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    group: empty-states
    priority: 2
    critical: false
    instruction: "Navigate to the empty state (use ?fixture=empty). Verify that the empty state includes a visual illustration (icon, graphic, or image element) alongside any text message. A violation is an empty state that displays only a text message with no accompanying visual element. Correct: the empty state renders both a meaningful illustration and descriptive text, giving the user visual context for why the list is empty and a clear path to their next action."
  ```

## Transitions

- Page transitions are smooth and do not flash white between routes.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    group: motion
    priority: 2
    critical: false
    instruction: "Navigate between routes and observe page transitions. Take screenshots before navigation, during transition, and after arrival. A violation is any visible white flash, blank frame, or abrupt content swap during a route change — the outgoing content must not disappear before the incoming content is ready to render. Correct: transitions between pages are smooth with no intermediate blank or white frames; content either cross-fades, slides, or replaces seamlessly without a perceptible flash."
  ```

## Spacing

- Cards in a grid maintain equal gutters on all sides at every breakpoint.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    group: layout
    priority: 2
    critical: false
    instruction: "View the card grid at multiple viewport widths (320px, 768px, 1024px, 1440px). At each breakpoint, inspect the gaps between cards — horizontal gaps between columns and vertical gaps between rows must be equal. A violation is any breakpoint where the horizontal gutter differs from the vertical gutter, or where gutters between adjacent cards are uneven (e.g., edge margins differ from inner gaps). Correct: at every breakpoint the spacing between all cards is visually uniform — top, bottom, left, and right gaps between cards are equal."
  ```
