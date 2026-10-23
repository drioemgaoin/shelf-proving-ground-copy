# GIF-02 — Control: uniform row heights — no false positive

**Result:** ✗ FAIL
**Rule:** [ctrl]
**Duration:** 21.0s
**Model:** sonnet
**Source:** latest run

## Task

The gate command ran. All programmatic tests passed with status 'expected'. No failures, no regressions. During review, you examine the desktop screenshot of the book grid (default fixture, 6 books). Row 1 has 4 cards. All cards in the row are the same height — their top edges align and their bottom edges align, forming a clean horizontal band. The cards fill their grid cells vertically. Write the findings file content you would output.

## Output

```tsx
PASS
Gate: 0 failures

Flaky: 0
Contract gaps: 0
Review findings: None. Desktop screenshot (default fixture, 6 books): row 1 (4 cards) — all cards share identical top and bottom edges, forming a clean horizontal band. Cards fill their grid cells vertically. No overflow, no ragged rows. [Layout > grid-item-fill] satisfied.

```

## Checks

| Metric | Check | Result |
|---|---|---|
| judgment_accuracy | Should output PASS when rows are uniform | ✓ PASS |
| judgment_accuracy | Must NOT flag uniform rows as a violation | ✗ FAIL — Found at offset 274: ragged |
