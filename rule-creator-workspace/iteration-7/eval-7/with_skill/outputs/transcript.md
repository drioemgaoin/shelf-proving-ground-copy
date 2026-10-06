# Transcript: Adding Enforcement Blocks to review-rules.md

## Discovery

Read the SKILL.md and identified the rule-creator skill workflow: discover rules files, run the sorting test on each rule, generate enforcement blocks using tier-formats.md templates, and run budget checks.

Found one rules file: `.claude/rules/review-rules.md` with `paths: "src/**/*"` frontmatter.

## Rules inventory

The file contains 4 rules across two sections:

### Visual Quality (2 rules)
1. "Loading skeletons match the shape and layout of the content they replace."
2. "Dark mode toggle does not cause a visible layout shift."

### Code Structure (2 rules)
3. "No business logic in React component files -- extract to custom hooks or utility modules."
4. "Functions longer than 50 lines are split into smaller, focused units."

## Sorting test -- Group 1: Visual Quality rules

### Rule 1: Loading skeletons match content shape

**Step 1 (Can a tool catch it?):** No. There is no syntactic signature for "skeleton shapes match content layout." The rule requires comparing visual output across two states (loading vs loaded). No regex or lint rule can determine whether a skeleton placeholder matches the dimensions and position of the real content it replaces.

**Step 2 (Can a test catch it?):** Not with a deterministic assertion. You could measure bounding boxes programmatically, but the threshold for "approximately the same dimensions" requires judgment -- a 2px difference is fine, a 50px difference is not, and the boundary is contextual.

**Step 3 (Does it need LLM judgment?):** Yes, and reviewers would converge. If you show a screenshot of skeletons next to a screenshot of loaded content, experienced reviewers consistently agree on whether the shapes match. The violation is visible in screenshots.

**Decision: T3, agent: visual-qa.** The violation is visible in a screenshot (skeleton vs loaded state comparison), not in code structure. Visual-qa is the correct agent.

### Rule 2: Dark mode toggle causes no layout shift

**Step 1 (Can a tool catch it?):** No regex can detect layout shift from source code alone.

**Step 2 (Can a test catch it?):** Yes. Cumulative Layout Shift (CLS) is a measurable metric. A Playwright test can toggle the theme, collect layout-shift entries from PerformanceObserver, and assert the total is below a threshold (< 0.01). This is a deterministic pass/fail.

**Decision: T2.** CLS is measurable with a runtime test. No LLM judgment needed -- the number either passes or fails the threshold. This is cheaper than T3 and fully sufficient.

Note: The user asked for "the right T3 agent" for each rule, but T2 is the correct tier here. The sorting test always picks the cheapest tier that catches every violation. Forcing this to T3 visual-qa would be an unnecessary cost increase when a deterministic test works.

## Sorting test -- Group 2: Code Structure rules

### Rule 3: No business logic in React component files

**Step 1 (Can a tool catch it?):** No. "Business logic" is a semantic concept. A regex cannot distinguish between a data transformation that is business logic (filtering books by status) and one that is rendering logic (formatting a date for display). The rule requires understanding the intent of the code.

**Step 2 (Can a test catch it?):** No. There is no deterministic assertion for "this function is business logic."

**Step 3 (Does it need LLM judgment?):** Yes, and reviewers would converge. Experienced developers consistently agree on what constitutes business logic vs rendering logic. The violation is in code structure, not visual output.

**Decision: T3, agent: reviewer.** The judgment is about code structure and semantics -- you read the source, not a screenshot. Reviewer is the correct agent.

### Rule 4: Functions longer than 50 lines

**Step 1 (Can a tool catch it?):** Yes. Line count is purely syntactic. An AST walker or even `wc -l` on function bodies can detect this without understanding intent. The threshold is a hard number with no ambiguity.

**Decision: T1.** This is a deterministic, pre-commit check. No runtime test or LLM needed.

**Gap surfaced:** The qualifier "focused" in the rule text is not enforceable by line count. A 45-line function doing three unrelated things passes T1 but violates the spirit. If the team wants "focused" enforced independently, that is a separate T3 reviewer rule for single-responsibility at the function level.

## Enforcement blocks generated

All 4 blocks were generated using the tier-formats.md templates:

| Rule | Tier | Agent | Reasoning |
|------|------|-------|-----------|
| Loading skeletons match content | T3 | visual-qa | Visual comparison of two states -- judgment on screenshot |
| Dark mode no layout shift | T2 | n/a | CLS is measurable with PerformanceObserver -- deterministic |
| No business logic in components | T3 | reviewer | Code structure judgment -- read source, not screenshot |
| Functions over 50 lines | T1 | n/a | Line count is syntactic -- AST/lint check |

## Agent selection rationale

The key distinction between visual-qa and reviewer for T3 rules:

- **visual-qa** is for violations visible in screenshots or runtime behavior. "Do the skeletons look like the real content?" requires comparing two screenshots side by side. You cannot answer this from code alone.
- **reviewer** is for violations in code structure, naming, or style. "Is there business logic in this component file?" requires reading the source code and understanding what each function does. A screenshot tells you nothing about where the logic lives.

The two non-T3 rules (dark mode CLS and function length) were correctly classified at cheaper tiers (T2 and T1 respectively) because they have deterministic checks available. The skill always picks the cheapest tier that catches every violation.

## Budget check

After generating all blocks, counted enforcement tiers across discovered rules files:

| Metric | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 | 2 | 150 warn / 200 soft / 300 hard | Well under |
| Scopeless T3 | 0 | 10 | Clear |
| Critical T3 | 0 | 10 | Clear |

No budget concerns.

## Rule IDs (implicit, derived from location)

- `review-rules:visual-quality:T3` (loading skeletons)
- `review-rules:visual-quality:T2` (dark mode CLS)
- `review-rules:code-structure:T3` (business logic)
- `review-rules:code-structure:T1` (function length)

## Output

Final file saved to: `outputs/review-rules.md`
