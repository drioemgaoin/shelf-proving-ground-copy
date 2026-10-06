# Transcript: Add T3 enforcement blocks to visual-rules.md

## Task

Add T3 visual-qa enforcement blocks to three rules in `.claude/skills/rule-creator/evals/fixtures/instruction-quality/.claude/rules/visual-rules.md`:

1. "Empty states show a helpful illustration, not just text"
2. "Page transitions are smooth and do not flash white"
3. "Cards in a grid maintain equal gutters at every breakpoint"

## Steps

1. **Read input file** at `.claude/skills/rule-creator/evals/fixtures/instruction-quality/.claude/rules/visual-rules.md`. Found three rules under sections Empty States, Transitions, and Spacing — all without enforcement blocks.

2. **Read reference file** at `.claude/rules/visual-rules.md` (project root). This file contains the same three rules but already has T3 visual-qa enforcement blocks. Used this as the canonical format reference.

3. **Identified enforcement block format** — each block is a fenced YAML code block with fields: `tier`, `agent`, `scope`, `instruction`, `group`, `priority`, `critical`. The `instruction` field contains a detailed check description following a Violation/Correct pattern.

4. **Generated enforcement blocks** for all three rules:
   - **Empty States**: scope `src/components/*EmptyState*`, checks for illustrative graphic (SVG/image/icon >48x48) alongside text, group `empty-states`.
   - **Transitions**: scope `src/**/*`, checks for no white/blank frames during route navigation, group `transitions`.
   - **Spacing**: scope `src/components/*Grid*`, checks equal gaps at breakpoints (320px, 768px, 1024px, 1440px), group `spacing`.

5. **Wrote output** to `rule-creator-workspace/iteration-9/eval-8/without_skill/outputs/visual-rules.md`.

## Output

- `visual-rules.md` — the input file with all three T3 enforcement blocks added.
