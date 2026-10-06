# Rule Creator Transcript — frontend-standards.md

## Task

Add enforcement blocks to all 15 rules across 5 sections in `frontend-standards.md`.

## Discovery

Rules files found in `.claude/rules/`:
- ui-project.md
- ui-base.md
- visual-rules.md (3 existing T3 rules)
- code-quality.md
- team-standards.md

No existing enforcement blocks in the input file.

## Sorting Test Results

### Group 1: Code Style (3 rules)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 1 | No `as any` type assertions | **T1** | Regex matches `as any` — purely syntactic violation. Every instance is wrong regardless of context. |
| 2 | No `export default` | **T1** | Regex matches `export default` — purely syntactic. No judgment needed. |
| 3 | No nested ternary expressions | **T1** | ESLint `no-nested-ternary` or regex can detect nested `?` operators. AST-level check is deterministic. |

### Group 2: CSS (3 rules)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 4 | All values from design tokens | **T1** | Regex matches hex values, raw px/rem, rgb()/hsl() in component CSS. Syntactic signature — raw values are always wrong in component stylesheets. |
| 5 | Animations use only transform and opacity | **T1** | Per the worked example in references: regex/stylelint can check transition and keyframe declarations for non-transform/opacity properties. Looks visual, but is syntactic. |
| 6 | No raw z-index values | **T1** | Regex matches `z-index: <number>` — should always be a token variable. |

### Group 3: Accessibility (3 rules)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 7 | All images have alt text | **T1** | ESLint jsx-a11y/alt-text catches `<img>` without `alt`. Syntactic check on JSX attributes. |
| 8 | Color alone does not convey meaning | **T3 (visual-qa)** | No syntactic proxy — requires looking at rendered UI to judge whether color is the sole information channel. Reviewers would converge: either there's a non-color indicator or there isn't. |
| 9 | Tab order follows visual reading order | **T2** | Playwright can programmatically tab through focusable elements and compare their coordinates. Deterministic pass/fail assertion against rendered DOM positions. |

### Group 4: Performance (3 rules)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 10 | No synchronous localStorage in render paths | **T1** | Regex matches `localStorage.getItem/key/length` in component files. The syntactic proxy catches the violation (localStorage access in component scope). Gap: doesn't distinguish render vs effect paths perfectly, but the rule intent is to keep it out of component files entirely. |
| 11 | Images use correct loading attribute | **T3 (reviewer)** | Whether an image is "above the fold" depends on page layout context — no syntactic proxy for fold position. A reviewer reading the component can judge this. |
| 12 | Bundle size under 200kb per route | **T2** | Build tooling can measure gzipped output per route chunk. Deterministic threshold check. |

### Group 5: Architecture (3 rules)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 13 | Business logic in hooks/utilities | **T3 (reviewer)** | "Business logic" vs "render logic" requires understanding intent. No syntactic proxy. Reviewers converge — complex calculations and domain conditionals in render functions are recognizable. |
| 14 | Single responsibility principle | **Human** | Inherently subjective. Reviewers disagree on what constitutes a "single responsibility." No stable standard across reviewers. Classic Human-tier rule. |
| 15 | Side effects in custom hooks only | **T3 (reviewer)** | Requires judging what constitutes a "side effect" vs simple state update. Reviewers converge — fetch calls, localStorage writes, analytics in handlers are recognizable violations. |

## Budget Check

Counted across all discovered rules files (`.claude/rules/*`) plus this new file:

| Budget | Before | After | Limit | Status |
|--------|--------|-------|-------|--------|
| Total T3 | 3 | 7 | 150 warn / 200 soft cap | Well within limits |
| Scopeless T3 | 0 | 0 | 10 | Clear |
| Critical T3 | 0 | 0 | 10 | Clear |

## Rule IDs (derived)

- `frontend-standards:code-style:T1` (3 rules: as-any, export-default, nested-ternary)
- `frontend-standards:css:T1` (3 rules: design-tokens, animation-properties, z-index)
- `frontend-standards:accessibility:T1` (alt-text)
- `frontend-standards:accessibility:T3` (color-meaning)
- `frontend-standards:accessibility:T2` (tab-order)
- `frontend-standards:performance:T1` (localStorage)
- `frontend-standards:performance:T3` (image-loading)
- `frontend-standards:performance:T2` (bundle-size)
- `frontend-standards:architecture:T3` (business-logic, side-effects)
- `frontend-standards:architecture:Human` (single-responsibility)

## Tier Summary

| Tier | Count | Rules |
|------|-------|-------|
| T1 | 8 | as-any, export-default, nested-ternary, design-tokens, animation-properties, z-index, alt-text, localStorage |
| T2 | 3 | tab-order, bundle-size |
| T3 | 3 | color-meaning (visual-qa), image-loading (reviewer), business-logic (reviewer), side-effects (reviewer) |
| Human | 1 | single-responsibility |

Correction: T3 count is 4, not 3. Updated in budget check above.

## Gaps surfaced

- **localStorage rule (T1)**: The regex catches all localStorage access in component files, but technically the rule says "in render paths" — a more precise enforcement would use an AST walker to check only the render-time scope, not useEffect callbacks. A separate rule could cover the nuance if needed.
- **Nested ternary regex**: The pattern `\?[^?]*\?[^:]*:` is a rough approximation. ESLint's `no-nested-ternary` rule is the proper enforcement mechanism; the regex is noted for documentation purposes.
