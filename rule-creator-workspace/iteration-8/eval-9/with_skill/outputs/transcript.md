# Transcript: Edit/Reclassify Two Rules in frontend-standards.md

## Discovery

Scanned the fixture directory for rules files. Found one:
- `.claude/rules/frontend-standards.md`

No other rules files or top-level CODING_STANDARDS.md found.

### Existing enforcement block inventory (before changes)

| Rule | Current tier |
|------|-------------|
| Never set a raw z-index value | (none) |
| All values come from design tokens | (none) |
| Color alone does not convey meaning | T3 visual-qa |
| No `as any` type assertions | (none) |

Current counts: T1=0, T2=0, T3=1, Human=0.

---

## Change 1: Add T1 enforcement to z-index rule

### Rule text
"Never set a raw `z-index` value. Use the layer token system."

### Sorting test

**Step 1: Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

Yes. A raw `z-index` value has a clear syntactic signature: `z-index:` followed by a digit. The user confirms a custom stylelint plugin already exists that catches this. The violation is purely syntactic -- any `z-index` declaration with a raw number instead of a `var(--z-*)` token is always wrong in component CSS, regardless of context.

Classification: **T1** (deterministic, pre-commit).

### Generated enforcement block

```yaml
enforcement:
  tier: T1
  pattern: "z-index:\\s*\\d"
  assert: never
  scope: "src/**/*.css"
  fix: "Replace raw z-index with a layer token from tokens.css (e.g., var(--z-dropdown))."
```

Field rationale:
- **pattern**: Matches `z-index:` followed by any digit. This catches raw numeric values. The existing stylelint plugin enforces this same check.
- **assert**: `never` -- this pattern should never appear.
- **scope**: `src/**/*.css` -- all CSS files under src. The rule applies to all component stylesheets.
- **fix**: Directs the developer to use the token system with a concrete example.

### Rule ID
`frontend-standards:css:t1`

---

## Change 2: Reclassify color-meaning rule from T3 to Human

### Rule text
"Color alone does not convey meaning. Use icons, patterns, or text labels as well."

### Previous enforcement block (T3 visual-qa)

```yaml
enforcement:
  tier: T3
  agent: visual-qa
  scope: "*"
  instruction: "Check that color is not the sole indicator of state or meaning. Every colored badge, status indicator, or highlighted element must also have a non-color cue (icon, pattern, text label)."
  group: accessibility
  priority: 1
  critical: false
```

### Re-running the sorting test

The user reports that the visual-qa agent produces too many false positives on this check. Re-evaluating:

**Step 1: Can a tool catch it?** No. Whether color alone conveys meaning depends on the semantic context of the UI element. A regex cannot determine whether a colored element also has a text label or icon.

**Step 2: Can a test catch it?** No. There is no deterministic runtime assertion that can distinguish "color is the only cue" from "color plus icon/text."

**Step 3: Does it need LLM judgment?** Yes, but the question is whether reviewers converge. The user reports that the visual-qa agent (an LLM) fails to reliably judge this -- too many false positives. The rule requires understanding whether a secondary cue is "sufficient" in context, which involves judgment about user perception. Different reviewers may disagree on edge cases (e.g., is a slightly different shape enough of a secondary cue? Does a tooltip count?). The visual-qa agent's false-positive rate confirms the standard is not stable enough for automated LLM judgment.

**Step 4: Human.** The rule's enforcement requires a person reviewing the UI in context, understanding the full interaction model, and judging whether non-color cues are adequate.

Classification: **Human**

### Generated enforcement block

```yaml
enforcement:
  tier: Human
  review: "Manual accessibility review during PR"
  reason: "visual-qa agent produces too many false positives on color-only checks; human judgment required."
```

Field rationale:
- **review**: Accessibility review during PR is the right checkpoint -- the reviewer can see the actual UI and judge whether color is the sole conveyor of meaning.
- **reason**: Documents why this was downgraded from T3 -- the visual-qa agent's false-positive rate. This helps future audits decide whether improved tooling could re-promote it.

### Rule ID
`frontend-standards:accessibility:human`

---

## Budget check (after changes)

Aggregated across all discovered rules files (frontend-standards.md only):

| Tier | Count |
|------|-------|
| T1 | 1 |
| T2 | 0 |
| T3 | 0 |
| Human | 1 |

- **Total T3 rules**: 0 (well under 150 warn threshold)
- **Scopeless T3**: 0 (under limit of 10)
- **Critical T3**: 0 (under limit of 10)

The T3-to-Human reclassification freed one T3 slot and one scopeless T3 slot. All budgets are clear.

---

## Summary of changes

1. **z-index rule**: Added T1 enforcement block. The custom stylelint plugin provides deterministic, pre-commit enforcement.
2. **Color-meaning rule**: Replaced T3 visual-qa block with Human block. The visual-qa agent's false-positive rate makes automated LLM evaluation unreliable for this rule.
