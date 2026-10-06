# Transcript: Adding T3 enforcement blocks to visual-rules.md

## Task

Add T3 visual-qa enforcement blocks to all three rules in `visual-rules.md`:
1. "Empty states show a helpful illustration, not just text" (tier already decided: T3 visual-qa)
2. "Page transitions are smooth and do not flash white between routes"
3. "Cards in a grid maintain equal gutters at every breakpoint"

## Reasoning

### Tier determination

The user specified T3 visual-qa for the first rule. For the other two:

- **Page transitions / white flash**: This requires actually navigating between routes and observing the visual result. A regex (T1) cannot detect it. An automated test (T2) could check for blank frames in theory, but judging whether a transition is "smooth" and whether a brief intermediate state counts as a "flash" requires visual interpretation. T3 visual-qa is appropriate.

- **Equal gutters at every breakpoint**: While gap values could be measured programmatically (T2 candidate), the rule says "maintain equal gutters on all sides at every breakpoint" which requires visual inspection across multiple viewport widths and judging whether spacing is visually uniform. Edge cases (sub-pixel rounding, browser differences) make this a judgment call. T3 visual-qa is appropriate.

### Format decisions

I studied existing enforcement blocks in the project:

- `code-quality.md` uses ````yaml` fenced blocks with `enforcement:` as the top-level key
- `team-standards.md` uses the same format
- `enforcement-tiers.md` documents the T3 block format with fields: `tier`, `agent`, `scope`, `group`, `priority`, `critical`, `instruction`, `triage_hint`
- The `with_skill` output from iteration-4/eval-8 used the same format

I followed the established project convention:
- Used `yaml` fenced code blocks with `enforcement:` wrapper
- All three rules use `agent: visual-qa` (screenshot-based evaluation)
- Scoped to `"Shelf"` (the component context for visual-qa, per enforcement-tiers.md guidance that visual-qa scopes to component names)
- Assigned `priority: 2` (default) and `critical: false` for all three
- Omitted `triage_hint` since that field is for reviewer rules only (visual-qa does not use triage)
- Gave each rule a distinct `group` value for affinity grouping: `empty-states`, `motion`, `layout`

### Instruction quality

Each `instruction` field follows the pattern from enforcement-tiers.md examples:
1. Describes what evidence to gather (navigate to fixture, check viewports, observe transitions)
2. Defines what constitutes a violation (specific, observable conditions)
3. Defines what "correct" looks like (positive example for calibration)

This ensures the visual-qa agent can produce structured `Current:` / `Fix:` findings.

## Output

Modified file saved to `visual-rules.md` in the outputs directory.
