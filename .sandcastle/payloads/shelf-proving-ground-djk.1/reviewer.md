# T3 Rules

## values-from-tokens
**Source:** Values
**Rule:** Every visual value uses a role-matched token (bgColor for backgrounds, fgColor for text, borderColor for borders). No raw hex/px/rem/%/keywords. Create tokens in tokens.css.

Check that each design token is used for its intended semantic role. A violation is using a token outside its role — e.g., a spacing token for font-size, a danger color for non-error content, or a shadow token for a non-elevated element. Also check elevation hierarchy: elements inside cards, dialogs, or drawers sit on a raised surface (--*-bgColor-raised), not on the page surface (--*-bgColor-default). A badge or inner element on a card must NOT use bgColor-default — that is page-level only. Correct: each token maps to the role described in ui-project.md's token tables, and elevation tier matches the visual context.

**Triage hint:** Flag when: token variable referenced, color/spacing/size property changed

---

## elevation-hierarchy
**Source:** Values
**Rule:** Background tokens follow the elevation hierarchy. Page surface is `bgColor-default`. Cards, dialogs, and drawers are `bgColor-raised`. Elements inset within a raised surface (badges, inner panels) are `bgColor-inset`. When defining component-tier tokens in tokens.css, alias from the correct elevation tier.

Check the elevation hierarchy of every bgColor usage. Three tiers exist: bgColor-default (page surface), bgColor-raised (cards, dialogs, drawers), bgColor-inset (elements inside raised surfaces like badges, inner panels). A violation is: (1) a component-tier token aliasing bgColor-default when the component sits on a raised surface, (2) a component CSS file using bgColor-default directly instead of inheriting or using bgColor-raised/bgColor-inset. Correct: every bgColor alias and usage matches the element's position in the visual elevation stack.

**Triage hint:** Flag when: bgColor token alias defined, background-color property set, new component token in tokens.css

---

## no-outer-margin
**Source:** Values
**Rule:** No margin in component CSS. Resets (margin: 0, padding: 0) go in @layer base. Parent owns centering — no margin-inline: auto. Exception: flex auto-margin for distribution.

Scan all selectors in the diff for margin properties. A violation is any element setting margin to own space outside itself — the parent layout owns spacing and positioning. Two exceptions are NOT violations: (1) flex/grid auto-margin for internal space distribution (e.g., margin-block-start: auto to push a badge to the bottom of a flex column — this is a layout mechanism within the parent's context, not external spacing), (2) margin declarations inside @layer base (element resets). Everything else is a violation: margin for spacing between siblings, margin-inline: auto for self-centering, margin-block: 0 for list resets outside the base layer. Correct: parents use gap and padding for spacing; containers use max-width + centering for width constraints; children set zero margin.

**Triage hint:** Flag when: margin property appears in any CSS, new selector with margin, max-width + margin-inline: auto on a child

---

## anchored-overlay-positioning
**Source:** Anchored overlays
**Rule:** An anchored overlay is any element visually pinned to a specific position on its parent surface (badge in a card corner, close button on a dialog, notification dot on an icon). The spec description determines the positioning method.

When a component has an overlay element (badge, indicator, dot, close button, tag pinned to a surface), check that the positioning method matches the spec's intent. If the spec names a corner (top-right, top-left, bottom-right, bottom-left), the surface must be position: relative and the overlay must be position: absolute with inset-block-start/end and inset-inline-start/end. A violation is: (1) spec says a corner but the overlay uses flex alignment, (2) overlay is position: absolute but the surface lacks position: relative, (3) spec describes a content-relative position but the overlay is absolute.

**Triage hint:** Flag when: position: absolute, position: relative on container, badge/indicator/dot/tag/overlay element, inset properties, align-self on a non-flow element

---

## motion-tokens
**Source:** Motion
**Rule:** Durations and easing come from motion tokens.

Check that motion tokens match the use case: --shelf-motion-duration-fast for hover/focus/small state changes, --shelf-motion-duration-base for dialogs/drawers/panels entering, --shelf-motion-duration-slow for large layout changes (rare). A violation is using the wrong duration tier for the interaction type. Correct: each animation uses the motion token that matches its semantic category.

**Triage hint:** Flag when: motion/transition/animation token referenced, duration or easing value changes

---

## reduced-motion-no-movement
**Source:** Motion
**Rule:** Reduced motion means no movement: instant or fade only.

Inside @media (prefers-reduced-motion: reduce) blocks, check that no transform-based animations remain (translate, scale, rotate). Only opacity transitions (fades) or instant state changes (duration: 0ms) are allowed. A violation is any transform animation inside a reduced-motion context. Correct: reduced-motion blocks either remove the animation entirely or replace it with an opacity-only fade.

**Triage hint:** Flag when: prefers-reduced-motion, @media reduced, motion token, transition, animation, keyframes, transform

---

## exit-not-slower-than-enter
**Source:** Motion
**Rule:** Exit is never slower than enter.

For each component with enter and exit animations (e.g., drawer slide-in/out, dialog appear/disappear, toast enter/leave), compare the duration tokens. A violation is an exit animation using a slower duration token than its corresponding enter animation (e.g., exit uses --shelf-motion-duration-base while enter uses --shelf-motion-duration-fast). Correct: exit duration is equal to or faster than enter duration for the same element.

**Triage hint:** Flag when: exit/enter animation, transition duration, leave/enter class, animation paired definitions

---

## a11y-css-pattern-completeness
**Source:** Accessibility floor (WCAG 2.2 AA)
**Rule:** Accessibility CSS patterns have well-known complete forms. A partial implementation creates a silent failure — the element looks correct in code but breaks the accessibility contract at runtime. Always implement the full pattern; when tokens exist for the pattern, use them.

Check every CSS rule block that implements an accessibility pattern (sr-only, visually-hidden, skip-link). The selector name or component context identifies these — look for class names containing live, sr-only, visually-hidden. For sr-only: all six properties are required — position: absolute, overflow: hidden, width/inline-size: 1px, height/block-size: 1px, clip-path: inset(50%), white-space: nowrap. A violation is any a11y CSS pattern missing required properties — incomplete patterns compile and pass tests but silently break the accessibility contract. Correct: every property the pattern requires is present, using tokens where they exist.

**Triage hint:** Flag when: position: absolute paired with overflow: hidden, class name contains live or sr-only or visually-hidden, element serves aria-live

---

### Monitoring Report (REQUIRED)

After evaluating all rules above, you MUST emit a structured report block at the end of your output. This block is parsed by the monitoring system to track rule effectiveness.

```
<!-- MONITOR_REPORT_START -->
{
  "evaluations": [
    { "ruleId": "<rule-id>", "outcome": "passed|violation_found", "file": "<file-or-null>", "details": { "description": "<brief>" } }
  ]
}
<!-- MONITOR_REPORT_END -->
```

Include one entry per rule you evaluated. Use "passed" if the rule was satisfied, "violation_found" if you detected a violation. The "file" field is the path of the violating file (or null for visual checks). The "details.description" is a brief explanation.
