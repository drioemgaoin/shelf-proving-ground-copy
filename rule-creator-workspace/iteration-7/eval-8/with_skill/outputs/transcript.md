# Transcript: Adding T3 Enforcement Blocks to visual-rules.md

## Task

Add T3 enforcement blocks to three rules in the fixture file `.claude/rules/visual-rules.md`:
1. "Empty states show a helpful illustration, not just text"
2. "Page transitions are smooth and do not flash white between routes"
3. "Cards in a grid maintain equal gutters at every breakpoint"

The user pre-decided all three as T3 visual-qa. No sorting test needed.

## Discovery

Scanned `.claude/rules/` and found 5 rules files:
- ui-project.md
- ui-base.md
- visual-rules.md (already has 3 T3 blocks in the real file)
- code-quality.md
- team-standards.md

## Reasoning per Rule

### Rule 1: Empty states show a helpful illustration, not just text

- **Tier**: T3 (user-decided)
- **Agent**: visual-qa -- the violation is visible in a screenshot (presence/absence of an illustration alongside text)
- **Scope**: `src/components/*EmptyState*` -- narrows to empty-state components rather than scanning everything
- **Instruction checklist**:
  - What to look for: zero-data screens (no books, no results, fixture=empty)
  - What counts as a violation: empty state has only text/heading with no illustration
  - What correct looks like: a visible illustration (SVG, image, or icon >48x48) rendered alongside the text
- **Group**: `empty-states`
- **Priority**: 2 (default)
- **Critical**: false

### Rule 2: Page transitions are smooth and do not flash white

- **Tier**: T3 (user-decided)
- **Agent**: visual-qa -- requires watching runtime navigation for visual artifacts
- **Scope**: `src/**/*` -- transitions span all routes, no single component owns them
- **Instruction checklist**:
  - What to look for: intermediate visual states during route navigation
  - What counts as a violation: a white/blank frame visible between pages, or an abrupt hard cut
  - What correct looks like: outgoing page fades/slides/cross-fades into incoming page with no blank frame
- **Group**: `transitions`
- **Priority**: 2
- **Critical**: false

### Rule 3: Cards in a grid maintain equal gutters at every breakpoint

- **Tier**: T3 (user-decided)
- **Agent**: visual-qa -- requires measuring visual gaps across breakpoints in screenshots
- **Scope**: `src/components/*Grid*` -- narrows to grid components
- **Instruction checklist**:
  - What to look for: gaps between grid cards at each breakpoint (320, 768, 1024, 1440px)
  - What counts as a violation: any inter-card gap differs by >1px, or outer padding doesn't match the gutter token
  - What correct looks like: all horizontal gaps identical, all vertical gaps identical, outer padding matches gutter token
- **Group**: `spacing`
- **Priority**: 2
- **Critical**: false

## Block Placement

Each enforcement block is indented under its parent bullet (the rule is in a bulleted list), using the format from `references/tier-formats.md`.

## Budget Check

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules (across all rules files) | 3 | 150 warn / 200 soft / 300 hard | Well under |
| Scopeless T3 (`scope: "*"` or no scope) | 0 | 10 | Clear |
| Critical T3 | 0 | 10 | Clear |

Note: The real `.claude/rules/visual-rules.md` already contains these same 3 T3 blocks. This eval works on a fixture copy. If deployed alongside the existing file (replacing it), the count remains 3.

## Rule IDs (implicit, derived from location)

- `visual-rules:empty-states:T3`
- `visual-rules:transitions:T3`
- `visual-rules:spacing:T3`

## Output

Saved modified file to: `outputs/visual-rules.md`
