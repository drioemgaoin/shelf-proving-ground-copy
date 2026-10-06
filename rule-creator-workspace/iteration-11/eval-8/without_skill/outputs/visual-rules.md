---
paths: "src/**/*"
---

# Visual Rules

## Empty States

- Empty states show a helpful illustration, not just text.

<!-- ENFORCEMENT: T3 visual-qa
- **Tier:** T3 — verified by visual-qa screenshot review
- **What to check:** When the app is in an empty state (e.g. `?fixture=empty`), the empty-state area must include an illustration or icon, not only a text message.
- **Pass criteria:** The screenshot shows a visible illustration or graphic element accompanying the empty-state text.
- **Fail criteria:** The empty state displays only text with no illustration, icon, or graphic element.
-->

## Transitions

- Page transitions are smooth and do not flash white between routes.

<!-- ENFORCEMENT: T3 visual-qa
- **Tier:** T3 — verified by visual-qa screenshot review
- **What to check:** During route changes, capture before and after screenshots. The transition between pages must not produce a blank white flash frame.
- **Pass criteria:** Screenshots taken mid-transition show content or a smooth fade/slide; no frame is fully white or empty.
- **Fail criteria:** A screenshot captured during the transition shows a blank white or empty frame between the outgoing and incoming page content.
-->

## Spacing

- Cards in a grid maintain equal gutters on all sides at every breakpoint.

<!-- ENFORCEMENT: T3 visual-qa
- **Tier:** T3 — verified by visual-qa screenshot review
- **What to check:** At each responsive breakpoint (mobile, tablet, desktop), screenshot the card grid and verify that horizontal and vertical gaps between cards are visually equal.
- **Pass criteria:** Gutters between cards are consistent on all sides (top, bottom, left, right) at every breakpoint tested.
- **Fail criteria:** Any breakpoint shows unequal spacing — e.g. vertical gaps differ from horizontal gaps, or edge cards have different margins than inner cards.
-->
