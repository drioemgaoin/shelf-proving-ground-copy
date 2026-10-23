# VQA-08 — When all regressions are in locked files, output DEFER not FAIL

**Result:** ✗ FAIL
**Rule:** defer-locked-files
**Duration:** 30.0s
**Model:** sonnet
**Source:** latest run

## Task

Visual QA found 2 regressions. Both trace to issues in tests/acceptance/shelf.spec.ts (a locked file you cannot edit). The source code in src/ is correct. Write the findings file content you would output.

## Output

```tsx
Findings written to `.qa/visual-r1.md`. Both regressions are deferred — the source code is correct but the tests in the locked file `tests/acceptance/shelf.spec.ts` assert raw CSS custom property strings (`var(--color-status-reading)`) instead of resolved computed color values, which is what `toHaveCSS` actually receives from the browser. These are classified as contract gaps requiring a fix in the locked test file.

<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| format_compliance | Must output DEFER — all failures are in locked files | ✗ FAIL — Pattern not found: DEFER |
| format_compliance | Must NOT have Fix now section — nothing is fixable in source | ✓ PASS |
