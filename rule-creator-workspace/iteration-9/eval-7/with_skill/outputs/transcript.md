# Rule Creator Transcript — Agent Selection Eval

## Discovery

Found one rules file: `.claude/rules/review-rules.md` (scoped to `src/**/*`).

Existing enforcement blocks: 0 (starting from a clean file with 4 rules, no blocks).

## Sorting Test — Group 1 of 1 (all 4 rules)

| # | Rule | Section | Recommended Tier | Agent | Reasoning |
|---|------|---------|-----------------|-------|-----------|
| 1 | Loading skeletons match the shape and layout of the content they replace | Visual Quality | T3 | visual-qa | Step 1: No syntactic signature — matching skeleton shapes to content requires comparing visual layouts, not text patterns. Step 2: No deterministic assertion — "match" is a judgment about spatial correspondence. Step 3: Yes, LLM judgment needed. Visible in screenshots — compare skeleton state vs loaded state side by side. Reviewers would converge: a skeleton that is the wrong shape or missing is objectively wrong. |
| 2 | Dark mode toggle does not cause a visible layout shift | Visual Quality | T2 | n/a | Step 1: No regex can detect layout shift. Step 2: Yes — Playwright can toggle `data-theme`, measure CLS via PerformanceObserver (`layout-shift` entries), and assert `CLS < 0.01`. This is a deterministic runtime check with a hard threshold. No LLM judgment needed. |
| 3 | No business logic in React component files — extract to custom hooks or utility modules | Code Structure | T3 | reviewer | Step 1: No syntactic proxy — "business logic" vs "rendering logic" requires understanding intent. A regex could flag certain patterns (e.g., `.filter()`, `.reduce()`) but would produce excessive false positives on legitimate render-time transformations. Step 2: No runtime assertion possible. Step 3: Yes — a reviewer reads the component source and judges whether inline logic is domain-specific computation vs rendering wiring. This is a code structure judgment, not a visual one. Reviewers would converge: data transformations, validation rules, and API orchestration in a component file are clearly violations. |
| 4 | Functions longer than 50 lines are split into smaller, focused units | Code Structure | T1 | n/a | Step 1: Yes — an AST walker counts lines between opening and closing braces of function/arrow-function bodies. The 50-line threshold is a hard, measurable limit. The qualifier "focused" is a soft intent phrase that describes why the team chose the threshold — the threshold itself is independently enforceable. Gap: "focused" cannot be enforced by line count. If the team wants single-responsibility enforced independently, that would be a separate T3 reviewer rule. |

## Agent Assignment Rationale

The two T3 rules get different agents based on the skill's decision tree:

- **Rule 1 (skeletons)** → `visual-qa`: The violation is visible in a screenshot. You compare the skeleton rendering against the loaded rendering to judge whether shapes match. This is a visual judgment.
- **Rule 3 (business logic)** → `reviewer`: The violation is in code structure. You read `.tsx` source files to judge whether inline logic is domain computation vs rendering wiring. This is a code-reading judgment.

The other two rules do not need T3:
- **Rule 2 (dark mode CLS)** → T2: A Playwright test with PerformanceObserver provides a deterministic pass/fail. No LLM judgment needed.
- **Rule 4 (50-line functions)** → T1: An AST line-count check is fully deterministic. The "focused" qualifier is surfaced as a gap, not enforced at T1.

## Enforcement Blocks Generated

All 4 blocks written to `review-rules.md`. See output file.

## Budget Check

Aggregated across all discovered rules files (`review-rules.md` only):

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 2 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 (`scope: "*"` or no scope) | 0 | 10 | OK |
| Critical T3 (`critical: true`) | 0 | 10 | OK |

Per-file breakdown:
- `review-rules.md`: 2 T3 rules (0 scopeless, 0 critical), 1 T2, 1 T1

## Rule IDs

| Rule | Derived ID |
|------|-----------|
| Skeleton shapes | `review-rules:visual-quality:T3` |
| Dark mode CLS | `review-rules:visual-quality:T2` |
| Business logic separation | `review-rules:code-structure:T3` |
| 50-line functions | `review-rules:code-structure:T1` |
