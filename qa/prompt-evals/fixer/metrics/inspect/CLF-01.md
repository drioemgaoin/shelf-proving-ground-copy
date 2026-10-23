# CLF-01 — Removing centering from child requires simultaneously adding it to parent — both must happen

**Result:** ✗ FAIL
**Rule:** coupled-layout-fix
**Duration:** 46.1s
**Model:** sonnet
**Source:** latest run

## Task

The findings file at .qa/unified-r1.md says:

FINDINGS
- src/styles/shelf.css:7 `.shelf`
  Cause: [Values > no-outer-margin] Child self-centers with margin-inline: auto, which is prohibited. The parent layout must own centering.
  Current: margin-inline: auto;
  Fix: Remove line; add centering to the #app wrapper in src/styles/global.css (e.g. #app { display: flex; flex-direction: column; align-items: center; }).

The file src/styles/shelf.css contains:

@layer components {
  .shelf {
    max-width: var(--shelf-grid-maxWidth);
    margin-inline: auto;
    padding: var(--shelf-space-md);
  }
}

The file src/styles/global.css contains:

@layer base {
  #app {
    min-height: 100vh;
  }
}

Apply the fix. Write both corrected files.

## Output

```tsx
No `package.json` — verification commands don't exist in this repo. The two CSS files have been written with the correct fixes:

- **`src/styles/shelf.css`**: removed `margin-inline: auto;` from `.shelf`
- **`src/styles/global.css`**: added `display: flex; flex-direction: column; align-items: center;` to `#app`

<promise>COMPLETE</promise>
```

## Checks

| Metric | Check | Result |
|---|---|---|
| judgment_accuracy | Must remove margin-inline: auto from shelf.css | ✗ FAIL — Found at offset 168: margin-inline: auto |
| judgment_accuracy | Must add centering to #app in global.css — removing from child without adding to parent breaks layout | ✓ PASS |
