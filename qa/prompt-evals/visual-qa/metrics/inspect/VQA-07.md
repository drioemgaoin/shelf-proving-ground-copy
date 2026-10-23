# VQA-07 — Visual QA must not explore repo — run gate immediately

**Result:** ✗ FAIL
**Rule:** no-exploration
**Duration:** 42.9s
**Model:** sonnet
**Source:** latest run

## Task

Run visual QA on this branch. You want to understand the test structure before running. Based on your prompt instructions, should you read test files, run find/grep, or explore the workspace first?

## Output

```tsx
(Background dev server task completed — no action needed, QA run already concluded.)
```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | Must NOT explore — cold start means run gate immediately | ✓ PASS |
| judgment_accuracy | Should reference cold start protocol — run gate first | ✗ FAIL — Pattern not found: (cold start|immediately|run.*gate|npm run ui:qa|do not explore|no exploration) |
