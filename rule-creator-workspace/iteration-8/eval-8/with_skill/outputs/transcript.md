# Transcript: Adding T3 enforcement blocks to visual-rules.md

## Task

Add T3 visual-qa enforcement blocks to three rules in the fixture file at `.claude/skills/rule-creator/evals/fixtures/instruction-quality/.claude/rules/visual-rules.md`:

1. "Empty states show a helpful illustration, not just text"
2. "Page transitions are smooth and do not flash white between routes"
3. "Cards in a grid maintain equal gutters at every breakpoint"

The user pre-decided all three are T3 visual-qa -- no sorting test needed.

## Discovery

Rules files found in `.claude/rules/`:
- `ui-project.md`
- `ui-base.md`
- `visual-rules.md` (real project file, already has enforcement blocks)
- `code-quality.md`
- `team-standards.md`

Existing T3 count: 3 (all in `visual-rules.md` -- the real one, not the fixture)
Scopeless T3 count: 0
Critical T3 count: 0

The fixture input file has the same three rules but without enforcement blocks.

## Reference material read

- `SKILL.md` -- full skill instructions including sorting test, T3 instruction checklist, placement rules, budget checks
- `references/tier-formats.md` -- YAML templates for all tiers; T3 template requires: tier, agent, scope, instruction, triage_hint (for reviewer), group, priority, critical
- `references/worked-examples.md` -- calibration examples including T3 visual-qa (truncation) and T3 reviewer (spacing ownership)

## T3 instruction checklist (applied to each rule)

Per SKILL.md, every T3 instruction must include three parts:
1. What to look for
2. What counts as a violation
3. What correct looks like

### Rule 1: Empty states show a helpful illustration, not just text

- **What to look for:** On every zero-data screen (no books, no search results, fixture=empty), check whether an illustrative graphic (SVG, image, or icon larger than 48x48) appears alongside the message text.
- **What counts as a violation:** The empty state contains only a text string or heading with no accompanying illustration element.
- **What correct looks like:** A visible illustration or graphic is rendered next to or above the explanatory text, giving the screen visual weight beyond plain copy.
- **Scope:** `src/components/*EmptyState*` -- narrow to empty state components rather than all source files.
- **Group:** `empty-states`

### Rule 2: Page transitions are smooth and do not flash white

- **What to look for:** During every route navigation (clicking links, browser back/forward, programmatic pushes), watch for intermediate visual states between the outgoing and incoming page.
- **What counts as a violation:** A fully white or blank frame is visible for any perceptible duration (one or more frames) between the two pages, or the transition appears as an abrupt hard cut with no easing.
- **What correct looks like:** The outgoing page fades, slides, or cross-fades into the incoming page with no intermediate blank frame, producing a visually continuous transition.
- **Scope:** `src/**/*` -- transitions are cross-cutting, any route change could trigger the issue.
- **Group:** `transitions`

### Rule 3: Cards in a grid maintain equal gutters at every breakpoint

- **What to look for:** At each responsive breakpoint (mobile 320px, tablet 768px, desktop 1024px, wide 1440px), measure the gaps between adjacent grid cards -- both horizontal (column gaps) and vertical (row gaps) -- as well as the outer padding between the outermost cards and the grid container edge.
- **What counts as a violation:** Any gap between cards differs from the others by more than 1px, or outer padding is inconsistent with the inter-card gap value defined in the design tokens.
- **What correct looks like:** All horizontal gaps are identical, all vertical gaps are identical, and outer padding matches the grid's gutter token at every measured breakpoint.
- **Scope:** `src/components/*Grid*` -- narrow to grid components.
- **Group:** `spacing`

## Placement

All three rules are in bulleted lists, so enforcement blocks are indented to match per SKILL.md placement rules (two-space indent under the bullet).

## Budget check (post-generation)

Counting across all discovered rules files (`.claude/rules/`):

| Budget | Before | After adding 3 | Limit | Status |
|--------|--------|-----------------|-------|--------|
| Total T3 | 3 | 6 | 150 warn / 200 soft / 300 hard | Well within budget |
| Scopeless T3 | 0 | 0 | 10 | OK (all three have explicit scopes) |
| Critical T3 | 0 | 0 | 10 | OK (none marked critical) |

Note: The "after" count of 6 reflects the real `.claude/rules/visual-rules.md` (3 existing blocks) plus the 3 new blocks in the fixture copy. In practice, the fixture file is in a test directory and wouldn't be loaded by the agent harness, so the real budget impact is 0 additional T3 rules on the live pipeline.

## Rule IDs (implicit)

- `visual-rules:empty-states:T3`
- `visual-rules:transitions:T3`
- `visual-rules:spacing:T3`

## Output

File saved to: `rule-creator-workspace/iteration-8/eval-8/with_skill/outputs/visual-rules.md`
