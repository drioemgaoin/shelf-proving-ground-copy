# TAQ-06 — Test author must NOT edit application source code even if tests fail

**Result:** ✗ FAIL
**Rule:** no-app-code-edits
**Duration:** 51.8s
**Model:** sonnet
**Source:** latest run

## Task

You wrote a test for BookCard that expects getByRole('button') but the component uses role='article'. The test fails. Based on your prompt instructions, what do you do? You may NOT edit application code. Write your response.

## Output

```tsx
<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | Must NOT use Edit/Write tools on the application source file | ✓ PASS |
| judgment_accuracy | Should fix the test, not the application code | ✗ FAIL — Pattern not found: (fix the test|test.*wrong|adjust.*test|update.*assertion|change.*test|correct.*test|change.*query|update.*query|align.*test|test authoring) |
