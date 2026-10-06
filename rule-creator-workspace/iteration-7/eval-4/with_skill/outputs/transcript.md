# Transcript: Adding Enforcement Blocks Under Budget Pressure

## Initial State

Read the fixture file at `.claude/skills/rule-creator/evals/fixtures/budget-pressure/.claude/rules/ui-rules.md`.

### Existing enforcement block inventory (pre-change)

| Metric | Count | Limit |
|--------|-------|-------|
| Total T3 | 11 | 150 warn / 200 soft / 300 hard |
| Scopeless T3 (scope: "*") | 8 | 10 max |
| Critical T3 | 2 | 10 max |
| Scoped T3 (non-"*") | 3 | n/a |

Scopeless breakdown: headings hierarchy, body text size, dark mode contrast, accent colors, hover effects, disabled elements, loading states, overlap/spacing.

Critical breakdown: dark mode contrast, loading states.

### Three new rules needing enforcement

1. "Empty states show a helpful message and a call-to-action, not just blank space."
2. "Error states include a retry mechanism and a human-readable explanation."
3. "Modal dialogs are centered and never extend beyond the viewport."

## Sorting Test

### Rule 1: Empty states

- **Step 1 (tool catch?):** No. "Helpful message" requires judgment about content quality. Presence of a CTA element could be partially detected, but the overall assessment is visual.
- **Step 2 (test catch?):** Partially. A test could assert a specific element exists, but "helpful" and "not just blank space" need visual judgment across different empty states.
- **Step 3 (LLM judgment?):** Yes. Visible in a screenshot -- reviewers would converge on whether an empty state has a message + CTA vs blank space.
- **Tier: T3, agent: visual-qa**

### Rule 2: Error states

- **Step 1 (tool catch?):** No. "Human-readable explanation" is a judgment call.
- **Step 2 (test catch?):** Partially. Retry button presence could be asserted, but "human-readable" vs raw error code requires judgment.
- **Step 3 (LLM judgment?):** Yes. Visible in a screenshot -- reviewers would converge.
- **Tier: T3, agent: visual-qa**

### Rule 3: Modal dialogs

- **Step 1 (tool catch?):** No. Centering and viewport containment are visual properties that depend on rendered layout across breakpoints.
- **Step 2 (test catch?):** Partially. Bounding box assertions are possible but fragile across breakpoints and responsive layouts.
- **Step 3 (LLM judgment?):** Yes. Visible in a screenshot -- reviewers would converge on whether a dialog is centered and contained.
- **Tier: T3, agent: visual-qa**

## Budget-Driven Scope Decisions

The critical constraint was the scopeless budget: 8 of 10 slots already used, only 2 remaining. All 3 new rules could plausibly apply broadly, but each targets a specific component type:

- Rule 1 -> scope: "EmptyState" (only relevant when empty states are rendered)
- Rule 2 -> scope: "ErrorState" (only relevant when error states are rendered)
- Rule 3 -> scope: "Dialog" (only relevant when modal dialogs are present)

Using specific scopes is both budget-correct (avoids exceeding the scopeless limit) and semantically correct (these rules only apply to their respective component types, not every screen).

No new critical flags were added -- none of these rules warrant bypassing triage.

## Post-Change Budget

| Metric | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 11 | 14 | 150 warn | Well within budget |
| Scopeless T3 | 8 | 8 | 10 max | Unchanged -- all 3 new rules use specific scopes |
| Critical T3 | 2 | 2 | 10 max | Unchanged -- no new critical rules |

## Rule IDs (derived)

- `ui-rules:new-rules-to-add:T3` (empty states -- EmptyState scope)
- `ui-rules:new-rules-to-add:T3` (error states -- ErrorState scope)
- `ui-rules:new-rules-to-add:T3` (modal dialogs -- Dialog scope)

Note: These share the same heading slug. If disambiguation is needed, the rules should be moved under their own headings or the heading should be restructured.

## Instruction Quality Check

Each T3 instruction includes all three required parts:
1. **What to look for** -- the specific screen/state to examine
2. **What counts as a violation** -- concrete failure condition
3. **What correct looks like** -- description of the passing state

## Output

Final file saved to: `rule-creator-workspace/iteration-7/eval-4/with_skill/outputs/ui-rules.md`
