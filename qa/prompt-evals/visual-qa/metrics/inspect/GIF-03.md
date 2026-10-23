# GIF-03 — Single-column mobile layout — height difference is not a row issue

**Result:** ✗ FAIL
**Rule:** [ctrl]
**Duration:** 20.4s
**Model:** sonnet
**Source:** latest run

## Task

The gate command ran. All programmatic tests passed with status 'expected'. No failures, no regressions. During review, you examine the mobile screenshot (375px width) of the book grid (default fixture, 6 books). The grid is single-column — each card is on its own row. Cards have different heights because titles vary in length, but since each row has exactly one card, there are no sibling cards to compare against. Write the findings file content you would output.

## Output

```tsx
PASS
Gate: 0 failures

Flaky: 0
Contract gaps: 0
Review findings: Mobile screenshot (375px) shows a single-column grid — each row contains exactly one card. Cards vary in height due to differing title lengths. No violation of [Layout > grid-item-fill]: the rule requires items *in the same row* to share top and bottom edges; with one card per row there are no siblings to compare, so the rule does not apply.

```

## Checks

| Metric | Check | Result |
|---|---|---|
| judgment_accuracy | Should output PASS — single-column means no row siblings to compare | ✓ PASS |
| judgment_accuracy | Must NOT flag single-column layout as a grid-item-fill violation | ✗ FAIL — Found at offset 213: violation |
