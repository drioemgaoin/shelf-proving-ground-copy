---
paths: src/**/*
---

# UI rules: base (universal)

These apply to every project. Project values and names are in `ui-project.md`. Styling structure follows the `css-patterns` skill.

## Values

- Every color, size, spacing, radius, shadow, duration and easing comes from a token. No raw values in components.
- Components own no space outside themselves. Spacing between components is the parent's job.

## States

- Every interactive element has: default, hover, focus-visible, active, disabled.
- Every data view has: loading, empty, error, populated.
- A state with no acceptance test is unfinished.

## Layout

- No horizontal overflow at any width from 320 to 1440 px.
- Late-loading content (images, async data) has reserved space.
- Layer order is fixed by tokens. Never invent a z-index.

## Motion

- Animate only `transform` and `opacity`.
- Durations and easing come from motion tokens.
- Reduced motion means no movement: instant or fade only.
- Exit is never slower than enter.

## Accessibility floor (WCAG 2.2 AA)

- No axe violations.
- Contrast: 4.5:1 body text, 3:1 large text and UI parts.
- Pointer targets at least 24 × 24 CSS px.
- Focus is always visible, never hidden under sticky elements. It moves into dialogs, is trapped while open, and returns to the trigger on close.
- Every control has an accessible name.
- Works at 200% zoom.

## Budgets

- Layout shift: total below 0.01 for any single interaction.
- Motion smoothness: at most 2 long frames (over 50 ms) per animation.

## Content

- Truncated text always has a way to see the full value.
- Use `GLOSSARY.md` terms in UI text.

## Process (builder)

- Tickets list the acceptance tests to turn green. Make exactly those pass: `npx playwright test -g "<test name>"`.
- Never edit `e2e/acceptance/`, screenshot baselines, `e2e/support/`, `playwright.config.ts`, or these rule files. If a check looks wrong, say so on the ticket and stop.
- Extra tests you want go in `e2e/agent/`.
- Mark content that changes every run (times, avatars, random data) with `data-dynamic` so screenshots mask it.
- Before finishing any UI change, delegate to the `visual-qa` agent. Don't run the QA yourself and don't open its images.
