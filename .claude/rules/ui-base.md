---
paths: src/**/*
---

# UI rules: base (universal)

These apply to every project. Project values and names are in `ui-project.md`. Styling structure follows the `css-patterns` skill.

## Values

- Every color, size, spacing, radius, shadow, duration and easing comes from a token. No raw values in components.

  ```enforcement
  id: "values-from-tokens"
  tier: T1
  - pattern: "#[0-9a-fA-F]{3,8}"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  - pattern: "[0-9]+(px|rem|em|ms|s|%)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Replace with the appropriate --shelf-* token from src/styles/tokens.css"
  - pattern: "rgb(a?)\\("
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  - pattern: "hsl(a?)\\("
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  ---
  id: "values-from-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  triage_hint: "Flag when: token variable referenced, color/spacing/size property changed"
  instruction: "Check that each design token is used for its intended semantic role. A violation is using a token outside its role — e.g., a spacing token for font-size, a danger color for non-error content, or a shadow token for a non-elevated element. Correct: each token maps to the role described in ui-project.md's token tables."
  ```


- Every project must include a `@layer base` that applies design tokens to bare HTML elements. This is the layer where the design system takes control from the browser UA stylesheet. At minimum, `body` receives the page-surface background and default text color tokens. Without a base layer, bare elements render with UA defaults and the design system is not in control of the page surface, text color, or any element that lives outside a component.

  ```enforcement
  id: "base-layer-exists"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  triage_hint: "Flag when: new project setup, tokens file created, @layer declaration added, body/html selector added or missing"
  instruction: "Check that a @layer base block exists and applies the project's design tokens to bare HTML elements. At minimum body must receive the page-surface background token and default foreground color token. A violation is a project where semantic tokens are defined but no base layer applies them to the document root — bare elements render with browser UA defaults instead of the design system's values. Correct: a @layer base block styles body (background-color + color from tokens) and any other globally used bare elements."
  ```

- Components own no space outside themselves. Spacing between components is the parent's job.

  ```enforcement
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.css"
  group: layout
  triage_hint: "Flag when: margin property appears in component CSS, new component root selector added"
  instruction: "Scan component root selectors in the diff for margin properties. A violation is a component setting margin on its own root element — the parent layout owns spacing via gap or padding. Correct: components have zero margin on their root; parents use gap, padding, or wrapper margin to space children."
  ```

## States

- Every interactive element has: default, hover, focus-visible, active, disabled.

  ```enforcement
  id: "interactive-states"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  instruction: "For each interactive element (button, link, input, select, checkbox, radio, toggle), verify all five states are visually distinct: default, hover, focus-visible, active, disabled. A violation is any interactive element missing a visible treatment for one or more states. Correct: each state is visually distinguishable from the others — hover shows a color or elevation change, focus-visible shows a focus ring, active shows a pressed effect, disabled is dimmed with pointer-events off."
  ```

  > **Agent:** `visual-qa` — the states are visible in rendered output; code review alone cannot verify that each state is visually distinct and correct.

- Every data view has: loading, empty, error, populated.

  ```enforcement
  id: "data-view-states"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: states
  instruction: "For each data-driven view (lists, grids, detail panels), verify all four states render correctly: loading (skeleton or spinner), empty (empty-state message or CTA), error (error message with retry), populated (real content). A violation is any data view missing one or more states or showing a blank/broken screen for that state. Correct: each state is a designed, intentional screen — no raw fallbacks, no missing states."
  ```

  > **Agent:** `visual-qa` — the states are visible in screenshots via fixture switching; code review cannot verify that each state renders a designed screen.

- A state with no acceptance test is unfinished.

  ```enforcement
  id: "state-needs-acceptance-test"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.{ts,tsx}"
  group: states
  triage_hint: "Flag when: new component state added, conditional render branch, loading/empty/error/disabled handling"
  instruction: "For each component state visible in the source (loading, empty, error, populated, hover, focus, active, disabled), check that a corresponding acceptance test exists in e2e/acceptance/. A violation is a state implemented in code with no matching test assertion. Correct: every state rendered by the component has at least one acceptance test that navigates to that state and asserts on it."
  ```

  > **Agent:** `reviewer` — the violation is a missing test file/assertion, which is in code structure; it is not visible in a screenshot.

## Layout

- No horizontal overflow at any width from 320 to 1440 px.

  ```enforcement
  id: "no-horizontal-overflow"
  tier: T2
  scope: global
  assert: "expectNoHorizontalOverflow(page) — sweep viewports 320–1440px via widthSweep, assert no element exceeds clientWidth on every fixture page"
  ```

- Late-loading content (images, async data) has reserved space.

  ```enforcement
  id: "reserved-space-late-loading"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: layout
  instruction: "During loading states (use ?fixture=slow), check that every image container, async data region, and skeleton placeholder has explicit dimensions or aspect-ratio so content does not shift when it loads. A violation is any late-loading area that causes visible layout jump or has no placeholder/skeleton reserving its space. Correct: every async content area shows a skeleton or placeholder of the same dimensions as the final content."
  ```

  > **Agent:** `visual-qa` — the violation is visible in screenshots during loading states (content jumping, missing placeholders); code review cannot verify rendered dimensions.

- Layer order is fixed by tokens. Never invent a z-index.

  ```enforcement
  id: "z-index-from-tokens"
  tier: T1
  - pattern: "z-index:\\s*[0-9]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use a --shelf-z-* token (e.g., var(--shelf-z-sticky), var(--shelf-z-drawer)) instead of a raw z-index value"
  ```

## Motion

- Animate only `transform` and `opacity`.

  ```enforcement
  id: "animate-only-transform-opacity"
  tier: T1
  - pattern: "transition:\\s*(?!.*\\b(transform|opacity|none|all)\\b).*[a-z]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Only animate transform and opacity. Move layout-triggering properties (width, height, margin, top, left, background-color, color, box-shadow, border) out of transitions."
  - pattern: "@keyframes[\\s\\S]*?\\b(width|height|top|left|right|bottom|margin|padding|background-color|color|border|box-shadow|font-size)\\b"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Keyframes must only animate transform and opacity. Rewrite the animation to use transform (translate, scale, rotate) instead of layout properties."
  ```

- Durations and easing come from motion tokens.

  ```enforcement
  id: "motion-tokens"
  tier: T1
  - pattern: "transition:.*[0-9]+ms"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-duration-*) instead of raw duration"
  - pattern: "transition:.*[0-9]+s[^a-z]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-duration-*) instead of raw duration"
  - pattern: "animation-duration:\\s*[0-9]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-duration-*) instead of raw duration"
  - pattern: "transition-timing-function:\\s*(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-easing-*) instead of raw easing"
  ---
  id: "motion-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: motion
  triage_hint: "Flag when: motion/transition/animation token referenced, duration or easing value changes"
  instruction: "Check that motion tokens match the use case: --shelf-motion-duration-fast for hover/focus/small state changes, --shelf-motion-duration-base for dialogs/drawers/panels entering, --shelf-motion-duration-slow for large layout changes (rare). A violation is using the wrong duration tier for the interaction type. Correct: each animation uses the motion token that matches its semantic category."
  ```

- Reduced motion means no movement: instant or fade only.

  ```enforcement
  id: "reduced-motion-no-movement"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: motion
  triage_hint: "Flag when: prefers-reduced-motion, @media reduced, motion token, transition, animation, keyframes, transform"
  instruction: "Inside @media (prefers-reduced-motion: reduce) blocks, check that no transform-based animations remain (translate, scale, rotate). Only opacity transitions (fades) or instant state changes (duration: 0ms) are allowed. A violation is any transform animation inside a reduced-motion context. Correct: reduced-motion blocks either remove the animation entirely or replace it with an opacity-only fade."
  ```

  > **Agent:** `reviewer` — the violation is in CSS code structure (transform inside reduced-motion media queries); screenshots with reduced-motion emulation could also catch this, but the rule's specificity ("instant or fade only") maps directly to code patterns.

- Exit is never slower than enter.

  ```enforcement
  id: "exit-not-slower-than-enter"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: motion
  triage_hint: "Flag when: exit/enter animation, transition duration, leave/enter class, animation paired definitions"
  instruction: "For each component with enter and exit animations (e.g., drawer slide-in/out, dialog appear/disappear, toast enter/leave), compare the duration tokens. A violation is an exit animation using a slower duration token than its corresponding enter animation (e.g., exit uses --shelf-motion-duration-base while enter uses --shelf-motion-duration-fast). Correct: exit duration is equal to or faster than enter duration for the same element."
  ```

  > **Agent:** `reviewer` — the violation is a comparison between duration values in code; it is not reliably visible in a screenshot without timing measurement.

## Accessibility floor (WCAG 2.2 AA)

- No axe violations.

  ```enforcement
  id: "no-axe-violations"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — run axe-core against every fixture page (default, empty, error, slow, long, many)"
  ```

- Contrast: 4.5:1 body text, 3:1 large text and UI parts.

  ```enforcement
  id: "contrast-ratios"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — axe-core includes color-contrast in wcag2aa tags; assert zero violations on every fixture page"
  ```

- Pointer targets at least 24 × 24 CSS px.

  ```enforcement
  id: "pointer-target-size"
  tier: T2
  scope: global
  assert: "expectMinTargetSize(page, 24) — query all interactive elements, assert getBoundingClientRect() width >= 24 && height >= 24 on every fixture page"
  ```

- Focus is always visible, never hidden under sticky elements. It moves into dialogs, is trapped while open, and returns to the trigger on close.

  ```enforcement
  id: "focus-management"
  tier: T2
  scope: per-component
  assert: "For dialogs/drawers: open → assert document.activeElement is inside the dialog; Tab cycles within (does not escape); Escape closes → assert focus returns to the trigger element"
  coverage:
    - "Focus moves into dialog on open"
    - "Tab is trapped within dialog"
    - "Escape closes and returns focus to trigger"
  ---
  id: "focus-management"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: accessibility
  instruction: "Tab through all interactive elements on the page. For each focused element, check that the focus ring is fully visible — not clipped, obscured by sticky headers/footers, or hidden behind overlapping elements. A violation is any focused element whose focus indicator is partially or fully hidden. Correct: every focus ring is fully visible with no occlusion from any layer."
  ```

  > **Agent:** `visual-qa` — focus ring visibility and occlusion by sticky elements is only verifiable in rendered screenshots; the T2 facet covers the programmatic trap/return behavior.

- Every control has an accessible name.

  ```enforcement
  id: "accessible-name"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — axe-core wcag2aa tags include button-name, image-alt, label, select-name, link-name; assert zero violations on every fixture page"
  ```

- Works at 200% zoom.

  ```enforcement
  id: "works-at-200-zoom"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: accessibility
  instruction: "Capture screenshots at 200% browser zoom (viewport scaled to half dimensions: 160×406 for mobile, 384×512 for tablet, 640×400 for desktop). Check that all content is readable, no text is clipped or overlapping, no interactive elements are unreachable or off-screen, and no horizontal scrollbar appears. A violation is any content that is truncated, overlapping, or inaccessible at 200% zoom. Correct: the page remains fully functional and readable with all content accessible."
  ```

  > **Agent:** `visual-qa` — verifying usability at 200% zoom requires visual judgment across the full rendered page; automated overflow checks alone miss clipping, overlapping text, and unreachable controls.

## Budgets

- Layout shift: total below 0.01 for any single interaction.

  ```enforcement
  id: "cls-budget"
  tier: T2
  scope: global
  assert: "recordLayoutShifts(page) — resetLayoutShifts → interaction → layoutShift → assert total < 0.01 per interaction on every fixture page"
  ```

- Motion smoothness: at most 2 long frames (over 50 ms) per animation.

  ```enforcement
  id: "motion-smoothness"
  tier: T2
  scope: global
  assert: "measureFrames(page, trigger, durationMs) — assert longFrames <= 2 per animation on every fixture page"
  ```

## Content

- Truncated text always has a way to see the full value.

  ```enforcement
  id: "truncated-text-full-value"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: truncation
  instruction: "For each element with text-overflow: ellipsis or -webkit-line-clamp, check that hovering or tapping reveals the full text (tooltip, expanded view, or drawer). Use ?fixture=long to stress-test truncation. A violation is any truncated text with no disclosure mechanism — the user has no way to read the full value. Correct: every truncated element has a hover tooltip, tap-to-expand, or navigates to a detail view showing the full text."
  ```

  > **Agent:** `visual-qa` — truncation and its disclosure mechanism are visible in rendered output; code review cannot verify that the tooltip or expand actually appears.

- Use `GLOSSARY.md` terms in UI text.

  ```enforcement
  id: "glossary-terms-in-ui"
  tier: Human
  review: morning-review
  reason: "Semantic intent — requires understanding whether the glossary term fits the UI context naturally; reasonable reviewers would disagree on edge cases where a synonym reads better"
  ```

## Process (builder)

- Tickets list the acceptance tests to turn green. Make exactly those pass: `npx playwright test -g "<test name>"`.

  ```enforcement
  id: "make-exactly-ticket-tests-pass"
  tier: Human
  review: morning-review
  reason: "Meta-process — whether the agent ran exactly the ticket's listed tests (no more, no fewer) requires reviewing the PR against the ticket; no automated check can verify intent alignment"
  ```

- Never edit `e2e/acceptance/`, screenshot baselines, `e2e/support/`, `playwright.config.ts`, or these rule files. If a check looks wrong, say so on the ticket and stop.

  ```enforcement
  id: "never-edit-locked-files"
  tier: T1
  - pattern: ".*"
    assert: absent
    scope: "e2e/acceptance/**/*"
    fix: "Do not edit acceptance tests. If a check looks wrong, comment on the ticket and stop."
  - pattern: ".*"
    assert: absent
    scope: "e2e/support/**/*"
    fix: "Do not edit test support files. If a check looks wrong, comment on the ticket and stop."
  - pattern: ".*"
    assert: absent
    scope: "e2e/__screenshots__/**/*"
    fix: "Do not edit screenshot baselines. They are updated by the merge process."
  - pattern: ".*"
    assert: absent
    scope: "playwright.config.ts"
    fix: "Do not edit the Playwright config. If a check looks wrong, comment on the ticket and stop."
  - pattern: ".*"
    assert: absent
    scope: ".claude/rules/**/*"
    fix: "Do not edit rule files. If a rule looks wrong, comment on the ticket and stop."
  ```

- Extra tests you want go in `e2e/agent/`.

  ```enforcement
  id: "agent-tests-in-e2e-agent"
  tier: T1
  - pattern: ".*"
    assert: absent
    scope: "e2e/*.spec.ts"
    fix: "Agent-written tests must go in e2e/agent/, not in the e2e root"
  ```

- Mark content that changes every run (times, avatars, random data) with `data-dynamic` so screenshots mask it.

  ```enforcement
  id: "data-dynamic-on-changing-content"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.{ts,tsx}"
  group: testing
  triage_hint: "Flag when: Date, time, timestamp, random, uuid, avatar, relative time, moment, dayjs, new Date"
  instruction: "Check that any element rendering dynamic content (timestamps, relative times, random data, generated avatars, UUIDs) has the data-dynamic attribute so screenshot tests can mask it. A violation is a rendered value that changes between runs without data-dynamic on its element. Correct: every element with non-deterministic content has data-dynamic attribute."
  ```

  > **Agent:** `reviewer` — the violation is a missing attribute in JSX/TSX source code; it is not visible in a screenshot (the screenshot just shows the value, not whether it's masked).

- Before finishing any UI change, delegate to the `visual-qa` agent. Don't run the QA yourself and don't open its images.

  ```enforcement
  id: "delegate-to-visual-qa"
  tier: Human
  review: morning-review
  reason: "Meta-process — whether the builder agent delegated to visual-qa before finishing is a workflow step visible only in the agent's execution log, not in code"
  ```
