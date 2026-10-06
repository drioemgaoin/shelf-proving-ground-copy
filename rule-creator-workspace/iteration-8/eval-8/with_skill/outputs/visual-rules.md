---
paths: "src/**/*"
---

# Visual Rules

## Empty States

- Empty states show a helpful illustration, not just text.

  ```yaml
  enforcement:
    tier: T3
    agent: "visual-qa"
    scope: "src/components/*EmptyState*"
    instruction: "On every zero-data screen (no books, no search results, fixture=empty), verify that an illustrative graphic (SVG, image, or icon larger than 48x48) appears alongside the message text. Violation: the empty state contains only a text string or heading with no accompanying illustration element. Correct: a visible illustration or graphic is rendered next to or above the explanatory text, giving the screen visual weight beyond plain copy."
    group: "empty-states"
    priority: 2
    critical: false
  ```

## Transitions

- Page transitions are smooth and do not flash white between routes.

  ```yaml
  enforcement:
    tier: T3
    agent: "visual-qa"
    scope: "src/**/*"
    instruction: "During every route navigation (clicking links, browser back/forward, programmatic pushes), watch for intermediate visual states between the outgoing and incoming page. Violation: a fully white or blank frame is visible for any perceptible duration (one or more frames) between the two pages, or the transition appears as an abrupt hard cut with no easing. Correct: the outgoing page fades, slides, or cross-fades into the incoming page with no intermediate blank frame, producing a visually continuous transition."
    group: "transitions"
    priority: 2
    critical: false
  ```

## Spacing

- Cards in a grid maintain equal gutters on all sides at every breakpoint.

  ```yaml
  enforcement:
    tier: T3
    agent: "visual-qa"
    scope: "src/components/*Grid*"
    instruction: "At each responsive breakpoint (mobile 320px, tablet 768px, desktop 1024px, wide 1440px), measure the gaps between adjacent grid cards -- both horizontal (column gaps) and vertical (row gaps) -- as well as the outer padding between the outermost cards and the grid container edge. Violation: any gap between cards differs from the others by more than 1px, or outer padding is inconsistent with the inter-card gap value defined in the design tokens. Correct: all horizontal gaps are identical, all vertical gaps are identical, and outer padding matches the grid's gutter token at every measured breakpoint."
    group: "spacing"
    priority: 2
    critical: false
  ```
