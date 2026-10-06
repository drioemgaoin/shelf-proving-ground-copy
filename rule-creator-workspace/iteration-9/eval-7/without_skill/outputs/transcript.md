# Transcript: Add enforcement blocks to review-rules.md

## Task

Add T3 enforcement blocks to all 4 rules in `review-rules.md`, assigning `visual-qa` agent to visual quality rules and `reviewer` agent to code structure rules.

## Analysis

Read the input file at `.claude/skills/rule-creator/evals/fixtures/agent-selection/.claude/rules/review-rules.md`. Found 4 rules across two sections:

### Visual Quality
1. **Loading skeletons match shape/layout** — Already had a complete T3 enforcement block with `agent: visual-qa`. No changes needed.
2. **Dark mode toggle no layout shift** — Had only a T2 enforcement block (automated Playwright test, no agent). Needed a T3 `visual-qa` block added.

### Code Structure
3. **No business logic in components** — Already had a complete T3 enforcement block with `agent: reviewer`. No changes needed.
4. **Functions under 50 lines** — Had only a T1 enforcement block (static analysis pattern). Needed a T3 `reviewer` block added.

## Changes Made

- **Rule 2 (Dark mode toggle):** Added a T3 enforcement block with `agent: visual-qa`. The instruction directs the agent to compare full-page screenshots in light vs dark mode, checking that element positions and dimensions remain identical — only colors should change. Kept the existing T2 block since automated and agent-based enforcement are complementary.

- **Rule 4 (Functions under 50 lines):** Added a T3 enforcement block with `agent: reviewer`. The instruction directs the agent to count function body lines and also check for single-responsibility — addressing the "focused" qualifier that the existing Gap note identified as unenforced by T1 alone. Kept the existing T1 block and Gap note.

- **Rules 1 and 3:** Preserved exactly as-is — they already had correct T3 blocks with appropriate agents.

## Agent Selection Rationale

- `visual-qa` for rules 1 and 2: Both rules concern visual output that can only be verified by examining screenshots (skeleton layout fidelity, layout shift across themes).
- `reviewer` for rules 3 and 4: Both rules concern code organization that can only be verified by reading source files (logic placement, function length/responsibility).

## Output

Saved to `rule-creator-workspace/iteration-9/eval-7/without_skill/outputs/review-rules.md`.
