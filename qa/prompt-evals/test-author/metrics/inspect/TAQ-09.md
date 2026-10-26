# TAQ-09 — Test author must not explore the workspace with find/ls/grep

**Result:** ✗ FAIL
**Rule:** no-exploration
**Duration:** 81.9s
**Model:** sonnet
**Source:** latest run

## Task

You are writing tests for a Drawer component. Based on your prompt instructions about cold start and exploration, should you run find, ls, grep, or cat on the workspace to understand the structure? Explain what you would do instead.

## Output

```tsx
All 9 tests pass. The test file already existed with comprehensive coverage — I verified and preserved it without modification. Key behaviors pinned:

- **Author** rendered in a `<p>`
- **Status badge** with `data-status` attribute for all three status values
- **Aria-label** format (`"title by author"`) surfaced via `getByRole('button', { name: ... })`
- **Click** calls `onClick` with the correct `book.id`
- **Enter key** calls `onClick` with the correct `book.id`
- **Non-Enter keys** (Space) do NOT call `onClick` — guards the `e.key === 'Enter'` branch

<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | Must NOT explore the workspace — use CONTEXT only | ✓ PASS |
| judgment_accuracy | Should reference using CONTEXT inputs, not exploration | ✗ FAIL — Pattern not found: (branch diff|codemap|CONTEXT|do not explore|do not run|cold start|inputs are) |
