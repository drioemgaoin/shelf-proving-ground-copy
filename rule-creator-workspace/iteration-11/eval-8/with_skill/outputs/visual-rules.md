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
    instruction: "Check the empty state screen (use ?fixture=empty). Verify that the empty state includes a visual illustration or graphic element alongside text — not text alone. A violation is an empty state that displays only a text message (e.g., 'No books yet') with no accompanying illustration, icon, or graphic. Correct: the empty state shows a meaningful illustration (SVG graphic, decorative image, or styled icon) that visually communicates the empty condition, paired with explanatory text."
    group: empty-state
    priority: 2
    critical: false
  ```

## Transitions

- Page transitions are smooth and do not flash white between routes.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    instruction: "Navigate between routes and observe the transition. A violation is any momentary white flash, blank frame, or abrupt jump between page states — the old content disappears before the new content is painted, exposing the bare background. Correct: the outgoing content is replaced by incoming content without an intermediate blank or white frame; the transition feels continuous, with no visible flicker or jarring cut."
    group: motion
    priority: 2
    critical: false
  ```

## Spacing

- Cards in a grid maintain equal gutters on all sides at every breakpoint.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "Shelf"
    instruction: "View the book grid at multiple viewport widths (320px, 768px, 1024px, 1440px). Measure the spacing between adjacent cards horizontally and vertically, and between outermost cards and the container edge. A violation is any breakpoint where horizontal gutters differ from vertical gutters, or where the gap between cards is visibly uneven (e.g., wider spacing on one side than another, or edge cards having different insets than inter-card gaps). Correct: at every breakpoint, the gap between all adjacent cards is visually uniform in both axes, and the overall grid spacing looks balanced and consistent."
    group: layout
    priority: 2
    critical: false
  ```
