# Transcript: Edit-Reclassify Two Rules in frontend-standards.md

## Task

Two changes requested in `.claude/rules/frontend-standards.md`:
1. Classify the "Never set a raw z-index value" rule as T1 — a custom stylelint plugin now catches raw z-index values.
2. Reclassify the "Color alone does not convey meaning" rule from T3 visual-qa to Human — the visual-qa agent produces too many false positives.

## Discovery

Discovered one rules file: `.claude/rules/frontend-standards.md` (scoped to `src/**/*`).

Existing enforcement blocks before edits:
- T1: 0
- T2: 0
- T3: 1 (color rule, visual-qa)
- Human: 0
- No block: 2 (z-index rule, `as any` rule)

## Change 1: z-index Rule — Add T1 Enforcement Block

### Sorting test

**Step 1: Can a tool catch it?** Yes. The rule "never set a raw z-index value" has a clear syntactic signature: any `z-index` declaration with a numeric literal (e.g., `z-index: 10`) is a violation. The user confirmed a custom stylelint plugin exists that catches this. Pattern: `z-index:\s*\d`. This is T1.

### Block generated

```yaml
enforcement:
  tier: T1
  pattern: "z-index:\\s*\\d"
  assert: never
  scope: "src/**/*.css"
  fix: "Replace raw z-index with a layer token from tokens.css (e.g., var(--z-dropdown))."
```

Rule ID: `frontend-standards:css:T1` (z-index rule under CSS heading).

## Change 2: Color Rule — Reclassify T3 → Human

### Re-running sorting test

The user reports that the visual-qa agent produces too many false positives when checking whether color alone conveys meaning. This changes the answer at Step 3 of the sorting test.

**Step 1: Can a tool catch it?** No. "Color alone does not convey meaning" requires understanding semantic intent — no regex or AST walker can determine whether color is the sole information channel.

**Step 2: Can a test catch it?** No. There is no deterministic runtime assertion for this — it requires judging whether meaning is conveyed through color alone vs. through additional channels (icons, text, patterns).

**Step 3: Does it need LLM judgment?** Yes, but the visual-qa agent cannot reliably make this judgment. The user reports excessive false positives, meaning reviewers would not converge on what constitutes a violation. The standard is too subjective for automated LLM evaluation.

**Step 4: Human.** The rule is reclassified to Human. The `reason` field documents why automation failed, which helps future audits.

### Previous block (T3)

```yaml
enforcement:
  tier: T3
  agent: visual-qa
  scope: "*"
  instruction: "Check whether any UI element uses color as the sole means of conveying information."
  critical: false
```

### Replacement block (Human)

```yaml
enforcement:
  tier: Human
  review: "Manual accessibility review during PR"
  reason: "visual-qa agent produces too many false positives on color-only checks; human judgment required."
```

Rule ID: `frontend-standards:accessibility:Human` (color rule under Accessibility heading).

## Budget Check (Post-Edit)

Counts across all discovered rules files after changes:

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 1 | 0 | 150 warn / 200 soft / 300 hard | Well within limits |
| Scopeless T3 | 1 | 0 | 10 | OK |
| Critical T3 | 0 | 0 | 10 | OK |

The T3 → Human reclassification freed one T3 slot and one scopeless T3 slot. No budget concerns.

## Summary of Changes

1. **z-index rule**: Added T1 enforcement block with `pattern: "z-index:\\s*\\d"`, scoped to `src/**/*.css`, backed by the custom stylelint plugin.
2. **Color rule**: Replaced T3 visual-qa block with Human block, documenting the false-positive issue as the reason automation cannot handle this check.
