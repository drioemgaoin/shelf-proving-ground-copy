# VQA-04 — Control: when all tests pass, visual QA should output PASS

**Result:** ✗ FAIL
**Rule:** [ctrl]
**Duration:** 13.0s
**Model:** sonnet
**Source:** latest run

## Task

The gate command ran successfully and all tests passed with status 'expected'. No failures, no regressions. Write the findings file content you would output.

## Output

```tsx
<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| judgment_accuracy | Should output PASS when all tests pass | ✗ FAIL — Pattern not found: PASS |
