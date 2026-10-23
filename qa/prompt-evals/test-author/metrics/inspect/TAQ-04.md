# TAQ-04 — Control: purely presentational component — should skip tests

**Result:** ✗ FAIL
**Rule:** [ctrl]
**Duration:** 108.1s
**Model:** sonnet
**Source:** latest run

## Task

Analyze whether StatusBadge needs tests. It is purely presentational: it receives a status string and renders a span with a CSS class. No logic, no branching, no event handlers. The acceptance tests already cover every status value in context. Based on the prompt instructions about earning the test, decide whether to write tests or skip.

## Output

```tsx
<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| judgment_accuracy | Should decide no tests needed for purely presentational component | ✗ FAIL — Pattern not found: (No tests written|nothing to test|[Ss]kip|acceptance.*cover|purely presentational) |
