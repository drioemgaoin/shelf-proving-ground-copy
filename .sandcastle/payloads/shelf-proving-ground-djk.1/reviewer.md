# T3 Rules

## values-from-tokens
**Source:** .claude/rules/ui-base.md > Values

Check that each design token is used for its intended semantic role. A violation is using a token outside its role — e.g., a spacing token for font-size, a danger color for non-error content, or a shadow token for a non-elevated element. Correct: each token maps to the role described in ui-project.md's token tables.

**Triage hint:** Flag when: token variable referenced, color/spacing/size property changed

---

## motion-tokens
**Source:** .claude/rules/ui-base.md > Motion
**Rule:** Durations and easing come from motion tokens.

Check that motion tokens match the use case: --shelf-motion-duration-fast for hover/focus/small state changes, --shelf-motion-duration-base for dialogs/drawers/panels entering, --shelf-motion-duration-slow for large layout changes (rare). A violation is using the wrong duration tier for the interaction type. Correct: each animation uses the motion token that matches its semantic category.

**Triage hint:** Flag when: motion/transition/animation token referenced, duration or easing value changes

---

## reduced-motion-no-movement
**Source:** .claude/rules/ui-base.md > Motion
**Rule:** Reduced motion means no movement: instant or fade only.

Inside @media (prefers-reduced-motion: reduce) blocks, check that no transform-based animations remain (translate, scale, rotate). Only opacity transitions (fades) or instant state changes (duration: 0ms) are allowed. A violation is any transform animation inside a reduced-motion context. Correct: reduced-motion blocks either remove the animation entirely or replace it with an opacity-only fade.

**Triage hint:** Flag when: prefers-reduced-motion, @media reduced, motion token, transition, animation, keyframes, transform

---

## exit-not-slower-than-enter
**Source:** .claude/rules/ui-base.md > Motion
**Rule:** Exit is never slower than enter.

For each component with enter and exit animations (e.g., drawer slide-in/out, dialog appear/disappear, toast enter/leave), compare the duration tokens. A violation is an exit animation using a slower duration token than its corresponding enter animation (e.g., exit uses --shelf-motion-duration-base while enter uses --shelf-motion-duration-fast). Correct: exit duration is equal to or faster than enter duration for the same element.

**Triage hint:** Flag when: exit/enter animation, transition duration, leave/enter class, animation paired definitions

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
