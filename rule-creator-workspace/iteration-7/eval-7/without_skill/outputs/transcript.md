# Transcript: Adding Enforcement Blocks to review-rules.md

## Initial Analysis

Read the fixture file at `.claude/skills/rule-creator/evals/fixtures/agent-selection/.claude/rules/review-rules.md`. Found four rules organized into two sections:

### Visual Quality (2 rules)
1. **Loading skeletons match shape/layout** — Already had a complete T3 enforcement block with `agent: visual-qa`. No changes needed.
2. **Dark mode toggle no layout shift** — Had a T2 enforcement block (automated Playwright test, no agent). Needed a T3 visual-qa block.

### Code Structure (2 rules)
3. **No business logic in component files** — Already had a complete T3 enforcement block with `agent: reviewer`. No changes needed.
4. **Functions <= 50 lines** — Had a T1 enforcement block (lint/static analysis, no agent). Needed a T3 reviewer block.

## Agent Selection Reasoning

- **Visual Quality rules -> visual-qa**: These rules are about what things look like — skeleton shapes matching content, layout not shifting during theme toggle. You judge these by comparing screenshots, not by reading code. The visual-qa agent captures and compares screenshots.
- **Code Structure rules -> reviewer**: These rules are about how code is organized — where business logic lives, how long functions are. You judge these by reading source files. The reviewer agent reads and analyzes code.

## Changes Made

### Rule 2 (Dark mode toggle): T2 -> T3 visual-qa
- Replaced the T2 enforcement block (which specified a Playwright assertion) with a T3 block using `agent: visual-qa`.
- Wrote an instruction that tells the visual-qa agent to compare light and dark mode screenshots, looking for geometric/layout differences while ignoring expected color changes.
- Added `triage_hint`, `group`, `priority`, and `critical` fields for consistency.

### Rule 4 (Functions <= 50 lines): T1 -> T3 reviewer
- Replaced the T1 enforcement block (which specified a static pattern/assertion) with a T3 block using `agent: reviewer`.
- Wrote an instruction that tells the reviewer to check function body line counts AND assess single-responsibility (addressing the gap note from the original file about "focused" not being enforceable by line count alone).
- Added `triage_hint`, `group`, `priority`, and `critical` fields for consistency.
- Removed the gap note since the T3 reviewer instruction now covers the "focused" / single-responsibility concern.

### Rules 1 and 3: No changes
- Already had correct T3 enforcement blocks with the appropriate agents.
