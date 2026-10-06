# Rule Creator Transcript -- eval-8

## Task

Add T3 enforcement blocks to three rules in `visual-rules.md`:
1. "Empty states show a helpful illustration, not just text" (user pre-decided T3 visual-qa)
2. "Page transitions are smooth and do not flash white between routes"
3. "Cards in a grid maintain equal gutters at every breakpoint"

## Discovery

Scanned `.claude/rules/` and found 5 rules files:
- `ui-project.md`
- `ui-base.md`
- `visual-rules.md`
- `code-quality.md`
- `team-standards.md`

Existing enforcement block counts (production files):
- T3 rules: 3 (all in `visual-rules.md`)
- Scopeless T3: 0
- Critical T3: 0

## Sorting Test

### Rule 1: "Empty states show a helpful illustration, not just text."

User pre-decided T3 visual-qa. Sorting test skipped per instructions.

### Rule 2: "Page transitions are smooth and do not flash white between routes."

- **Step 1 -- Can a tool catch it?** No. "Smooth" and "flash white" are runtime visual behaviors. No regex or linter can detect a white flash during route transitions.
- **Step 2 -- Can a test catch it?** No deterministic assertion can verify "smoothness" or reliably detect brief white frames between routes without visual judgment.
- **Step 3 -- Does it need LLM judgment?** Yes. An agent needs to observe the transition visually (screenshot or video). Reviewers would converge -- a white flash is objectively visible or not. The violation is visual, not in code structure.
- **Classification: T3, agent: visual-qa**

### Rule 3: "Cards in a grid maintain equal gutters on all sides at every breakpoint."

- **Step 1 -- Can a tool catch it?** No. The rendered spacing depends on the CSS layout engine at runtime across multiple viewport widths. A regex on `gap` values cannot verify actual rendered consistency.
- **Step 2 -- Can a test catch it?** Partially. A Playwright test could measure bounding rects between adjacent cards. However, the full check -- equal gutters on ALL sides including outer padding vs. inter-card gaps across all breakpoints -- involves compound spatial comparisons that are better suited to visual judgment than brittle pixel assertions.
- **Step 3 -- Does it need LLM judgment?** Yes. A visual-qa agent can examine screenshots at each breakpoint and judge whether gutters are visually consistent on all sides. Reviewers would converge -- unequal gutters are visually obvious.
- **Classification: T3, agent: visual-qa**

## Generated Blocks

All three blocks follow the T3 template from `references/tier-formats.md`. Each instruction includes the three required parts: what to look for, what counts as a violation, and what correct looks like.

### Rule 1 block
- ID: `visual-rules:empty-states:T3`
- agent: visual-qa
- scope: "EmptyState"
- group: empty-states
- priority: 2, critical: false

### Rule 2 block
- ID: `visual-rules:transitions:T3`
- agent: visual-qa
- scope: "Shelf"
- group: transitions
- priority: 2, critical: false

### Rule 3 block
- ID: `visual-rules:spacing:T3`
- agent: visual-qa
- scope: "ShelfGrid"
- group: spacing
- priority: 2, critical: false

## Budget Check (post-generation)

Aggregated across all discovered rules files (`.claude/rules/`):

| File | T3 count | Scopeless T3 | Critical T3 |
|------|----------|-------------|-------------|
| visual-rules.md (production) | 3 | 0 | 0 |
| ui-project.md | 0 | 0 | 0 |
| ui-base.md | 0 | 0 | 0 |
| code-quality.md | 0 | 0 | 0 |
| team-standards.md | 0 | 0 | 0 |
| **Total (production)** | **3** | **0** | **0** |

Working copy (outputs/visual-rules.md) adds 3 T3 rules. If applied to production, total would remain 3 (replacing existing blocks) or 6 (if additive).

All budgets well within limits:
- T3 total: 3-6 (limit: 150 warn / 200 soft cap / 300 hard cap)
- Scopeless T3: 0 (limit: 10)
- Critical T3: 0 (limit: 10)

## Output Files

- `outputs/visual-rules.md` -- modified rules file with all three enforcement blocks
- `outputs/transcript.md` -- this file
