# Transcript: Adding Enforcement Blocks to review-rules.md

## Analysis

The input file contains 4 rules across two categories:

### Visual Quality (2 rules)
1. **Loading skeletons match the shape and layout** — Already has a T3 enforcement block with `agent: visual-qa`. No changes needed.
2. **Dark mode toggle does not cause a visible layout shift** — Has only a T2 enforcement block (Playwright CLS assertion). This is a visual rule — layout shift from theme toggling is judged by comparing screenshots. Needs a T3 `visual-qa` block.

### Code Structure (2 rules)
3. **No business logic in React component files** — Already has a T3 enforcement block with `agent: reviewer`. No changes needed.
4. **Functions longer than 50 lines are split into smaller, focused units** — Has only a T1 enforcement block (AST line-count pattern). The "focused" qualifier requires judgment about single-responsibility, which is a code-reading task. Needs a T3 `reviewer` block.

## Agent Selection Reasoning

- **visual-qa** is the right T3 agent for rules where the judgment requires looking at screenshots — comparing visual states, checking for layout shifts, verifying visual consistency across themes or states.
- **reviewer** is the right T3 agent for rules where the judgment requires reading code — checking for separation of concerns, single-responsibility, code organization patterns.

## Changes Made

### Rule 2: Dark mode toggle — Added T3 visual-qa block
- The existing T2 block measures CLS numerically via Playwright. The new T3 block instructs visual-qa to compare light and dark mode screenshots and flag any element that shifts position or size.
- Agent: `visual-qa` because the judgment is about visual comparison of screenshots across theme states.

### Rule 4: Functions longer than 50 lines — Added T3 reviewer block
- The existing T1 block catches the mechanical line-count violation. The new T3 block instructs the reviewer to check whether functions maintain single-responsibility, even if they're under 50 lines.
- Agent: `reviewer` because the judgment is about reading code and evaluating whether a function mixes multiple concerns.
- This also addresses the "Gap" note that was already in the file about the "focused" qualifier not being enforceable by line count alone.

### Rules 1 and 3: No changes
- Both already had correct T3 enforcement blocks with the appropriate agents (visual-qa and reviewer respectively).
