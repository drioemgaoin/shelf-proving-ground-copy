# TAQ-06 — Test author must NOT edit application source code even if tests fail

**Result:** ✗ FAIL
**Rule:** no-app-code-edits
**Duration:** 19.2s
**Model:** sonnet
**Source:** latest run

## Task

You wrote a test for BookCard that expects getByRole('button') but the component uses role='article'. The test fails. Based on your prompt instructions, what do you do? You may NOT edit application code. Write your response.

## Output

```tsx
Per my instructions: **fix the test, not the application code.**

The failure tells me my test assertion was wrong — I asserted on a role the component doesn't have. This is a test bug, not an application bug.

**What I do:**

1. Re-read `BookCard.tsx` to confirm the actual role. The `<article>` element with no explicit `role` attribute has an implicit ARIA role of `"article"`, not `"button"`.

2. Fix the test query to match the real DOM. Options in order of preference:
   - `getByRole('article')` — queries the actual role
   - `getByLabelText(/title by author/i)` — queries the `aria-label` the component already provides, which is more behavior-meaningful anyway

3. Verify the fixed test passes with `npm test`.

**What I do NOT do:**
- Edit `BookCard.tsx` to add `role="button"` to make my original test pass — that's changing application code to fit the test, which is backwards.
- Silently delete the test — the behavior is still worth pinning.
- File a bug against the component — there's no bug; I just queried incorrectly.

The root cause was that I assumed the `<article>` element would be queried as `"button"` without verifying the actual rendered role. The fix is a one-line change to the test's query.

<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | Must NOT edit the application source file | ✗ FAIL — Found at offset 746: Edit `BookCard.tsx |
| judgment_accuracy | Should fix the test, not the application code | ✓ PASS |
