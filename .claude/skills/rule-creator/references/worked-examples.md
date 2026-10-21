# Worked Examples

Real-world examples showing the full workflow from rule text to enforcement block. Read these when you need to calibrate your tier classification or see how to handle tricky cases.

## Table of contents

1. [T1: Raw color values in CSS](#t1-raw-color-values-in-css)
2. [T2: Axe accessibility violations](#t2-axe-accessibility-violations)
3. [T3 visual-qa: Truncation with full-value access](#t3-visual-qa-truncation-with-full-value-access)
4. [T3 reviewer: Component spacing ownership](#t3-reviewer-component-spacing-ownership)
5. [Human: Glossary term usage](#human-glossary-term-usage)
6. [Tricky: Animation properties (looks T3, is T1)](#tricky-animation-properties)
7. [Batch example: Three rules classified together](#batch-example)

---

## T1: Raw color values in CSS {#t1-raw-color-values-in-css}

**Rule:** "Every color, size, spacing, radius, shadow, duration and easing comes from a token. No raw values in components."

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? Yes — a regex can match hex values (`#[0-9a-fA-F]{3,8}`), raw `px`/`rem`/`em` values, and `rgb()`/`hsl()` calls in component CSS files. The pattern is syntactic, not semantic.
- Classification: **T1**

**Result:**

```enforcement
id: "raw-color-values-in-css"
tier: T1
- pattern: "#[0-9a-fA-F]{3,8}"
  assert: absent
  scope: "src/components/**/*.css"
  exclude: "src/styles/tokens.css"
  fix: "Replace with the project's color token variable"
- pattern: "[0-9]+px"
  assert: absent
  scope: "src/components/**/*.css"
  exclude: "src/styles/tokens.css"
  fix: "Replace with a spacing or size token variable"
```

**Why this works as T1:** The violation is purely syntactic. A raw hex value is always wrong in a component file, regardless of context. Separate `- pattern:` entries give per-entry match info in the rejection output — the agent sees exactly which pattern triggered and what to fix. The `exclude` field exempts the token definition file where raw values are expected.

---

## T2: Axe accessibility violations {#t2-axe-accessibility-violations}

**Rule:** "No axe violations."

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? Not statically — axe needs a rendered DOM to evaluate.
- Step 2: Can a test catch it? Yes — `@axe-core/playwright` or `jest-axe` runs against the rendered page and returns deterministic pass/fail.
- Classification: **T2**

**Result:**

```enforcement
id: "axe-accessibility-violations"
tier: T2
scope: global
assert: "expectNoA11yViolations(page) — run against every fixture"
```

**Why not T1:** Axe checks the rendered DOM — contrast ratios depend on computed styles, ARIA roles depend on the element tree. A static regex can't evaluate these.

---

## T3 visual-qa: Truncation with full-value access {#t3-visual-qa-truncation-with-full-value-access}

**Rule:** "Truncated text always has a way to see the full value."

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? No — a regex can find `text-overflow: ellipsis`, but can't verify there's a tooltip/expand mechanism.
- Step 2: Can a test catch it? Partially — you could test specific components, but "always has a way" requires visual judgment about whether the mechanism is discoverable.
- Step 3: Does it need LLM judgment? Yes — an agent needs to see truncated text in a screenshot and verify the full value is accessible via hover/tap/expand.
- Classification: **T3** (visual-qa, because it's about what the user sees)

**Result:**

```enforcement
id: "truncation-full-value-access"
tier: T3
agent: visual-qa
scope: "*"
group: content
priority: 2
instruction: "Verify that any text truncated with ellipsis has a discoverable way to see the full value — tooltip on hover, expand on tap, or visible in a detail view. Check long titles and author names specifically."
```

---

## T3 reviewer: Component spacing ownership {#t3-reviewer-component-spacing-ownership}

**Rule:** "Components own no space outside themselves. Spacing between components is the parent's job."

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? Partially — you could regex for `margin` in component CSS, but `margin` on internal elements is valid. The rule is about *external* margin, which requires understanding component boundaries.
- Step 2: Can a test catch it? No — there's no runtime assertion for "this margin is internal vs external."
- Step 3: Does it need LLM judgment? Yes — a reviewer needs to read the CSS and understand which margins are external.
- Classification: **T3** (reviewer, because it's about code structure)

**Result:**

```enforcement
id: "component-spacing-ownership"
tier: T3
agent: reviewer
scope: "src/components/**/*.css"
group: layout
priority: 2
triage_hint: "Component CSS uses margin on root element"
instruction: "Check whether components apply margin to their own root element. Internal margins (between child elements) are fine. External margins on the component's outermost wrapper violate this rule — spacing between siblings should be handled by the parent layout."
```

---

## Human: Glossary term usage {#human-glossary-term-usage}

**Rule:** "Use GLOSSARY.md terms in UI text."

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? No — a regex can check for banned terms, but "use glossary terms naturally" requires understanding context.
- Step 2: Can a test catch it? No.
- Step 3: Does it need LLM judgment? An LLM could flag obviously wrong terms, but the judgment of whether a term fits *naturally* in a sentence is subjective.
- Step 4: Human — this is about writing quality and tone.
- Classification: **Human**

**Result:**

```enforcement
id: "glossary-term-usage"
tier: Human
review: morning-review
reason: "Whether a glossary term is used naturally in context requires judgment about tone and user understanding that automation cannot reliably evaluate."
```

---

## Tricky: Animation properties (looks T3, is T1) {#tricky-animation-properties}

**Rule:** "Animate only `transform` and `opacity`."

At first glance this might seem like it needs visual verification. But the rule is about which *CSS properties* appear in animations — that's purely syntactic.

**Sorting test walkthrough:**
- Step 1: Can a tool catch it? Yes — match `transition:` or `@keyframes` declarations and check if they animate properties other than `transform` and `opacity`. A regex or stylelint rule can do this.
- Classification: **T1**

**Result:**

```enforcement
id: "animate-only-transform-opacity"
tier: T1
- pattern: "transition:\\s*(?!.*(transform|opacity|none|all))"
  assert: absent
  scope: "src/**/*.css"
  fix: "Refactor to animate only transform and opacity"
- pattern: "@keyframes[^}]*(?!transform|opacity)"
  assert: absent
  scope: "src/**/*.css"
  fix: "Keyframes must only animate transform and opacity"
```

**The lesson:** Always start at Step 1 and ask the concrete question. "Can a tool catch the specific violation?" — not "is this rule about visual things?" Many visual rules have syntactic proxies.

---

## Batch example {#batch-example}

When classifying multiple rules at once, present them in groups of 3-5 with your recommendation:

**Group 1 of 2:**

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 1 | No horizontal overflow at any width from 320 to 1440 px | T2 | Overflow detection requires rendering at multiple widths — a Playwright test can assert `scrollWidth <= clientWidth` |
| 2 | Layer order is fixed by tokens. Never invent a z-index | T1 | Regex can match raw `z-index:` values not using `var(--shelf-z-*)` |
| 3 | Focus is always visible, never hidden under sticky elements | T3 (visual-qa) | Whether focus is *visible* (not occluded) requires a screenshot check |

"Do these classifications look right? I'll generate the blocks once you confirm or adjust."
