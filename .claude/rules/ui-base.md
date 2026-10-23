---
paths: src/**/*
---

# UI rules: base (universal)

These apply to every project. Project values and names are in `ui-project.md`. Styling structure follows the `css-patterns` skill.

## Values

- Every visual value comes from a token. No raw hex, px/rem/em/%, border-width keywords (thin/medium/thick), or bare numerics in component CSS. Create missing tokens in tokens.css.

  CORRECT: `color: var(--shelf-fgColor-default);`
  WRONG: `color: #333;`

  ```enforcement
  id: "values-from-tokens"
  tier: T1
  - pattern: "#[0-9a-fA-F]{3,8}"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  - pattern: "[0-9]+(px|rem|em|ms|s|%|vw|vh|vmin|vmax|dvh|svh|lvh)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments+at-rule-params
    fix: "Replace with the appropriate --shelf-* token from src/styles/tokens.css"
  - pattern: "\\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color(-\\w+)?|light-dark)\\s*\\("
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  - pattern: "\\b(color|background-color|border-color|outline-color|text-decoration-color|caret-color|accent-color|fill|stroke|column-rule-color|border-top-color|border-right-color|border-bottom-color|border-left-color)\\s*:\\s*(?=\\S)(?!var\\(|inherit\\b|initial\\b|unset\\b|revert\\b|currentColor\\b|transparent\\b|none\\b|auto\\b)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Color properties must use a --shelf-*Color-* token from src/styles/tokens.css, not a raw value"
  - pattern: "\\b(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?|outline)\\s*:[^;]*\\b(?!(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset|inherit|initial|unset|revert|currentColor|transparent|auto|var|important)\\b)[a-z]{2,}"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments+paren-contents
    fix: "Use a --shelf-*Color-* token instead of a raw color name in border/outline shorthand declarations"
  - pattern: "\\b(border(-(width|top|right|bottom|left))?|border-(block|inline)(-(start|end))?)\\s*:[^;]*(\\b(thin|medium|thick)\\b)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Replace thin/medium/thick with a --shelf-border-width-* token from src/styles/tokens.css"
  - pattern: ":\\s*(?!var\\(|inherit|initial|unset|revert|none|auto|normal|0\\s*[;}])\\d*\\.?\\d+\\s*;"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    skip-lines: "flex(-grow|-shrink|-basis)?\\s*:|order\\s*:|column-count\\s*:|orphans\\s*:|widows\\s*:|tab-size\\s*:|counter-|animation-iteration-count\\s*:|will-change"
    fix: "Replace bare numeric value with the appropriate --shelf-* token from src/styles/tokens.css"
  ---
  id: "values-from-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  triage_hint: "Flag when: token variable referenced, color/spacing/size property changed"
  instruction: "Check that each design token is used for its intended semantic role. A violation is using a token outside its role — e.g., a spacing token for font-size, a danger color for non-error content, or a shadow token for a non-elevated element. Correct: each token maps to the role described in ui-project.md's token tables."
  ```

- `@layer base` required: box-sizing: border-box on *, body gets background/color/font/margin: 0 from tokens. Without it, UA defaults leak through.

  ```enforcement
  id: "base-layer-exists"
  tier: T1
  - pattern: "@layer\s+base"
    assert: present
    strip: comments
    scope: "src/**/*.{css,ts,tsx}"
    cross-check: "src/styles/tokens.css"
    fix: "Add a @layer base block after @layer tokens that sets *, *::before, *::after { box-sizing: border-box; } and body { margin: 0; background-color: var(--<ns>-bgColor-default); color: var(--<ns>-fgColor-default); font-family: var(--<ns>-font-family-base); }"
  - pattern: "box-sizing:\\s*border-box"
    assert: present
    strip: comments
    scope: "src/styles/tokens.css"
    fix: "Add *, *::before, *::after { box-sizing: border-box; } inside @layer base. Without this, elements with height: 100% and padding overflow their containers and cover grid/flex gaps."
  ```

- No margin in component CSS. Resets (margin: 0, padding: 0) go in @layer base. Parent owns centering — no margin-inline: auto. Exception: flex auto-margin for distribution.

  CORRECT: Container owns centering — all children align:

  ```css
  .page {
    max-width: 80rem;
    margin-inline: auto;
  }
  .toolbar {
    /* inherits constraint from .page */
  }
  .grid {
    /* inherits constraint from .page */
  }
  ```

  WRONG: One child centered, sibling unconstrained — left edges diverge at wide viewports:

  ```css
  .grid {
    max-width: 80rem;
    margin-inline: auto;
  }
  .toolbar {
    /* no constraint — stretches full parent width */
  }
  ```

  CORRECT: Flex auto-margin for internal space distribution (not external spacing):

  ```css
  .badge {
    margin-block-start: auto;
  } /* pushes to bottom of flex column — this is layout within the parent */
  ```

  WRONG: List/element reset in component CSS (all resets belong in @layer base, not here):

  ```css
  .my-list {
    margin-block: 0;
    padding: 0;
  }
  ```

  ```enforcement
  id: "no-outer-margin"
  tier: T1
  - pattern: "margin(-inline|-block|-top|-right|-bottom|-left)?\\s*:"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Children must not set margin. The parent layout owns spacing (gap, padding) and positioning (max-width + centering on a container). Move margin to the parent or a shared wrapper. For list/element resets (margin: 0), move to @layer base in tokens.css."
  ---
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: layout
  triage_hint: "Flag when: margin property appears in any CSS, new selector with margin, max-width + margin-inline: auto on a child"
  instruction: "Scan all selectors in the diff for margin properties. A violation is any element setting margin to own space outside itself — the parent layout owns spacing and positioning. Two exceptions are NOT violations: (1) flex/grid auto-margin for internal space distribution (e.g., margin-block-start: auto to push a badge to the bottom of a flex column — this is a layout mechanism within the parent's context, not external spacing), (2) margin declarations inside @layer base (element resets). Everything else is a violation: margin for spacing between siblings, margin-inline: auto for self-centering, margin-block: 0 for list resets outside the base layer. Correct: parents use gap and padding for spacing; containers use max-width + centering for width constraints; children set zero margin."
  ```

  > **Agent:** `reviewer` — catches margin patterns beyond the T1 regex set (e.g., margin via shorthand, inherited margin, or margin in utility classes) and distinguishes legitimate flex auto-margin from external spacing.

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

- Grid and list gaps produce visible spacing between items. Child elements do not overflow their grid/flex cells.

  ```enforcement
  id: "visible-container-spacing"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: layout
  instruction: "For each grid or list layout, verify that gaps between items are visually perceptible in both light and dark modes. Check that no child element overflows its container cell to cover the gap — look for cards, panels, or list items that appear to touch when the CSS specifies a gap. Compare row spacing to column spacing: if columns have visible gaps but rows do not, a child is likely overflowing vertically (common cause: height: 100% with padding and no box-sizing: border-box). A violation is any layout where declared gaps are visually absent or uneven between axes. Correct: gaps are uniformly visible between all adjacent items in both directions."
  ```

  > **Agent:** `visual-qa` — gap visibility is a rendered behavior; the overflow may not be obvious from code review alone since the CSS gap property is correct but a child sizing interaction hides it visually.

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

## Comments

- Comments explain WHY, not WHAT. One line max. No multi-line `//` blocks, no JSDoc (`/** */`). Never describe what code doesn't do ("is not wired").

  CORRECT: `// null = loading; array = loaded`
  WRONG:

  ```
  // Invariant: books is null while the initial fetch is in-flight
  // (loading state). Once the fetch resolves it becomes an array
  // (possibly empty).
  ```

  ```enforcement
  id: "comment-brevity"
  tier: T1
  - pattern: "^\\s*//.*\\n\\s*//.*\\n\\s*//"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: strings
    fix: "Condense to one // line. If it takes more than one line, the comment is explaining WHAT not WHY — shorten to the essential reason."
  ```

- Comments describe what code does, never what it doesn't or what ships later. No hedging ("is not wired", "not yet implemented"). No ticket references.

  ```enforcement
  id: "no-ticket-references"
  tier: T1
  - pattern: "(in this ticket|later ticket|next ticket|future ticket|ships in.*ticket|lands in.*ticket|in a future|in a later)"
    assert: absent
    scope: "src/**/*.{ts,tsx,css}"
    fix: "Describe current behavior and its boundary, not the delivery plan. e.g. 'Grid filtering is wired by its consumer' not 'ships in a later ticket'."
  - pattern: "shelf-proving-ground-[a-z0-9]+"
    assert: absent
    scope: "src/**/*.{ts,tsx,css}"
    fix: "Remove the beads ticket ID. Describe current behavior, not the delivery plan."
  - pattern: "\\b[a-z]{2,}[a-z0-9]*\\.\\d+\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx,css}"
    strip: strings
    fix: "Remove the ticket ID reference (e.g. djk.2). Describe current behavior, not the delivery plan."
  - pattern: "\\b[A-Z]{2,}-\\d{2,}\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx,css}"
    strip: strings
    fix: "Remove the Jira/Linear ticket ID (e.g. SHELF-456). Describe current behavior, not the delivery plan."
  - pattern: "#\\d{2,}\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx,css}"
    strip: strings
    fix: "Remove the issue reference (e.g. #234). Describe current behavior, not the delivery plan."
  ```

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

- Comments explain WHY, never WHAT. One short line maximum. If the name already says it, write no comment. No multi-line JSDoc blocks.

  CORRECT: `// null = loading; array (possibly empty) = loaded`
  CORRECT: `// Owns only visual pressed state; grid filtering is not wired.`
  CORRECT: (no comment — the name `SKELETON_COUNT` already explains itself)

  WRONG:

  ```ts
  /** Fixed number of skeleton placeholders shown while the shelf loads. */
  const SKELETON_COUNT = 6;
  ```

  — restates the name

  WRONG:

  ```ts
  // null while the first load is in flight; an array once data (or an empty
  // shelf) has arrived. Skeletons render during the null phase.
  ```

  — two lines when one suffices: `// null = loading; array = loaded`

  ```enforcement
  id: "comment-style"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx,css}"
  group: clarity
  triage_hint: "Flag when: JSDoc block, multi-line comment, comment restating name or type signature, comment explaining WHAT not WHY"
  instruction: "Every comment MUST explain WHY, never WHAT. One short line maximum. No multi-line JSDoc blocks. If the function/variable name already communicates the meaning, the comment is a violation."
  ```
