# Transcript: Adding Enforcement Blocks to frontend-standards.md

## Task
Add enforcement blocks to all 15 rules in `.claude/rules/frontend-standards.md`.

## Input Analysis
Read the fixture file and identified 15 rules across 5 sections:

| Section | Count | Rules |
|---------|-------|-------|
| Code Style | 3 | No `as any`, no `export default`, no nested ternaries |
| CSS | 3 | Design tokens only, transform/opacity animations, layer token z-index |
| Accessibility | 3 | Image alt text, color not sole indicator, tab order matches visual order |
| Performance | 3 | No sync localStorage in render, explicit loading attr on images, 200kb route budget |
| Architecture | 3 | Business logic in hooks/utils, single responsibility, side effects in hooks |

## Approach
For each rule, I created an enforcement block inside a `<details>` element with the following structure:
- **How to verify:** A concrete verification method, typically a grep/bash command that can be run to detect violations, plus manual review steps where automated detection is insufficient.
- **Correct example:** Code showing the compliant pattern.
- **Incorrect example:** Code showing the violation.
- **Why this matters:** A brief rationale explaining the consequence of violating the rule.

## Design Decisions

1. **Automated where possible:** 11 of 15 rules got grep/bash commands for automated detection. The remaining rules (color-alone meaning, single responsibility, tab order) require manual review due to their semantic nature -- I provided checklists or heuristic commands for those.

2. **Project-contextual examples:** Examples reference the Shelf app's domain (BookCard, ShelfGrid, StatusBadge, useFilteredBooks, useDeleteBook) to make them concrete and recognizable to contributors.

3. **Preserved original structure:** The frontmatter (`paths: src/**/*`), section headings, and original rule text are unchanged. Enforcement blocks are appended below each rule as collapsible details elements.

4. **Consistent format:** Every enforcement block uses the same four-part structure for predictability.

## Output
- `frontend-standards.md` -- the complete rules file with all 15 enforcement blocks added.
- `transcript.md` -- this file.
