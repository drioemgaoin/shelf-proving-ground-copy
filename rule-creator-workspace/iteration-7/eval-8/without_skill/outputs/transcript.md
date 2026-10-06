# Transcript: Adding T3 Enforcement Blocks to visual-rules.md (Without Skill)

## Task

Add T3 visual-qa enforcement blocks to three rules in the fixture file at `.claude/skills/rule-creator/evals/fixtures/instruction-quality/.claude/rules/visual-rules.md`:

1. "Empty states show a helpful illustration, not just text"
2. "Page transitions are smooth and do not flash white between routes"
3. "Cards in a grid maintain equal gutters at every breakpoint"

## Reasoning

### Approach

The task specifies T3 tier with visual-qa agent. T3 enforcement blocks are YAML code blocks placed directly after the rule they enforce. They contain structured metadata that tells the visual-qa agent what to check, where to check it, and how to judge pass/fail.

Each block needs:
- **tier**: T3 (visual review, not static analysis or tests)
- **agent**: visual-qa (the agent that performs the check)
- **scope**: file glob indicating which source files trigger the check
- **instruction**: detailed visual-qa instruction with explicit violation/correct criteria
- **group**: logical grouping for reporting
- **priority**: severity weight (2 = standard visual rule)
- **critical**: whether failure blocks merge (false for visual polish rules)

### Rule 1: Empty States

- **Scope**: `src/components/*EmptyState*` — targets empty state components specifically.
- **Instruction logic**: The visual-qa agent should look at zero-data screens (fixture=empty) and verify an illustrative graphic (SVG, image, or large icon) appears alongside text. Violation is text-only. Correct is graphic + text.

### Rule 2: Page Transitions

- **Scope**: `src/**/*` — broad scope since transitions involve routing, layouts, and pages.
- **Instruction logic**: During route changes, the agent should watch for white/blank flashes between pages. Violation is any perceptible blank frame or abrupt hard cut. Correct is smooth fade/slide/cross-fade with no blank intermediate.

### Rule 3: Grid Gutters

- **Scope**: `src/components/*Grid*` — targets grid layout components.
- **Instruction logic**: At each responsive breakpoint (320px, 768px, 1024px, 1440px), measure horizontal and vertical gaps between cards plus outer padding. Violation is gaps differing by more than 1px or outer padding inconsistent with the design token. Correct is uniform gaps matching the gutter token.

## Actions Taken

1. Read the fixture input file (bare rules, no enforcement blocks).
2. Referenced the project's existing visual-rules.md (which already had enforcement blocks) for the established pattern and field structure.
3. Generated enforcement blocks for all three rules following the T3 visual-qa pattern.
4. Wrote the complete modified file to the outputs directory.

## Output

- `visual-rules.md` — the fixture file with all three T3 enforcement blocks added.
