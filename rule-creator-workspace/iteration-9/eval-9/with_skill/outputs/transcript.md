# Transcript: Edit-Reclassify Eval

## Task

Two changes to `frontend-standards.md`:
1. Add T1 enforcement block to the "Never set a raw z-index value" rule (custom stylelint plugin now exists).
2. Reclassify "Color alone does not convey meaning" from T3 visual-qa to Human (too many false positives).

## Discovery

Rules file found: `frontend-standards.md` (working copy from fixture `edit-reclassify`).

### Initial enforcement block inventory

| Tier | Count | Rules |
|------|-------|-------|
| T1 | 0 | — |
| T2 | 0 | — |
| T3 | 1 | Color alone does not convey meaning (visual-qa, scope: "*") |
| Human | 0 | — |
| No block | 2 | z-index, design tokens, `as any` |

## Change 1: z-index rule — Add T1 enforcement block

### Sorting test

- **Step 1: Can a tool catch it?** Yes. The user confirms a custom stylelint plugin catches raw z-index values. The pattern `z-index:\s*\d` is syntactic — any raw z-index number in CSS is a violation regardless of context.
- **Classification: T1** (deterministic, pre-commit via stylelint plugin).

### Block generated

```yaml
enforcement:
  tier: T1
  pattern: "z-index:\\s*\\d"
  assert: "No raw z-index values — all z-index must use layer tokens"
  scope: "src/**/*.css"
  fix: "Replace raw z-index with a layer token from tokens.css (e.g., var(--z-dropdown))."
```

**Rule ID:** `frontend-standards:css:T1`

## Change 2: Color rule — Reclassify T3 visual-qa to Human

### Current block

T3, agent: visual-qa, scope: "*" (scopeless — counted against the 10-slot budget).

### Re-running sorting test

The user reports the visual-qa agent produces too many false positives on color-only checks. This means the LLM agent does not converge reliably on violations — the judgment is not stable enough for T3. Whether color is the "sole means" of conveying information depends on context, surrounding UI patterns, and user expectations that vary per screen.

- **Step 3: Does it need LLM judgment?** Yes, but reviewers (and the LLM agent) would disagree — too many false positives reported.
- **Step 4: Human only.** The rule requires contextual judgment about whether non-color indicators are sufficient. This is inherently subjective in edge cases.
- **Classification: Human.**

### Block generated

```yaml
enforcement:
  tier: Human
  review: "Manual accessibility review during PR"
  reason: "visual-qa agent produces too many false positives on color-only checks; human judgment required."
```

**Rule ID:** `frontend-standards:accessibility:Human`

## Budget checks (post-edit)

### Per-file breakdown

| File | T1 | T2 | T3 | Human | No block |
|------|----|----|----|----- -|----------|
| frontend-standards.md | 1 | 0 | 0 | 1 | 2 |

### Aggregated totals

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 rules | 1 | 0 | 150 warn / 200 soft / 300 hard | Well within budget |
| Scopeless T3 (`scope: "*"` or no scope) | 1 | 0 | 10 | Freed one slot |
| Critical T3 | 0 | 0 | 10 | Within budget |

The T3-to-Human reclassification freed one T3 slot and one scopeless T3 slot. No budget concerns.

## Output

Modified file saved to: `rule-creator-workspace/iteration-9/eval-9/with_skill/outputs/frontend-standards.md`
