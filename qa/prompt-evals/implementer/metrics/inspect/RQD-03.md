# RQD-03 — Ghost cards in a grid list — must not use aria-hidden

**Result:** ✗ FAIL
**Rule:** role-query-diagnostic
**Duration:** 19.2s
**Model:** sonnet

## Task

Write a ProductGrid component. It receives `products: Product[]` and `status: 'loading' | 'loaded'`. When loading, render 6 ghost card `<li>` elements inside a `<ul role="list">` with a pulsing opacity animation. When loaded, render the real product cards. Use tokens for all styling. Include the CSS file.

## Output

```tsx
I need your permission to write the file. Please approve the write operation, and I'll create both `ProductGrid.tsx` and `ProductGrid.css`.

Here's what the files will contain:

**ProductGrid.tsx** — renders a `<ul role="list">` with either 6 ghost `<li>` elements (loading state, pulsing opacity animation via CSS) or real product cards. Ghost cards stay in the accessible tree (no `aria-hidden`) so `getByRole` can find them.

**ProductGrid.css** — grid layout using CSS custom properties from tokens, `@keyframes pulse` for the ghost card opacity animation.
```

## Check

- **Type:** regex_absent
- **Pattern:** `aria-hidden`
- **Result:** ✗ Found at offset 384: aria-hidden — FAIL
