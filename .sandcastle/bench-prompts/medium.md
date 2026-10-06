# TASK

You are a sandcastle performance benchmark. This is a **MEDIUM** task.

Create an `EmptyState` component for the Shelf app.

## Context

Here are the last 5 commits:

<recent-commits>

!`git log -n 5 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

## What to build

A reusable empty-state component rendered when the shelf has no books (or no books match a filter). It is a pure presentational component — no data fetching.

### Component: `src/EmptyState.tsx`

```tsx
interface EmptyStateProps {
  heading: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

- Renders a `<section>` with `role="status"` and class `empty-state`
- Contains an `<h2>` with the heading
- Contains a `<p>` with the description (class `empty-state__description`)
- If `actionLabel` and `onAction` are provided, renders a `<button>` with class `empty-state__cta`
- Uses semantic HTML, no divs for structure

### Styles: `src/EmptyState.css`

- Center text, generous vertical padding using `--shelf-space-2xl`
- Heading uses `--shelf-font-size-xl` and `--shelf-font-weight-semibold`
- Description uses `--shelf-fgColor-muted` and `--shelf-font-size-base`
- CTA button: `--shelf-bgColor-accent` background, `--shelf-fgColor-on-accent` text, `--shelf-radius-full` pill shape, `--shelf-space-sm` vertical padding, `--shelf-space-lg` horizontal padding
- CTA hover: `--shelf-bgColor-accent-hover`
- CTA active: `--shelf-bgColor-accent-active`
- CTA focus: `outline: var(--shelf-focusRing); outline-offset: var(--shelf-focusRing-offset)`

### Unit tests: `src/EmptyState.test.tsx`

Write at least 4 tests:
1. Renders heading and description
2. Does not render CTA when no action props
3. Renders CTA when action props given
4. Calls onAction when CTA clicked

## Validation

Run `npm run typecheck` and `npm run test`. Both must pass.

## Commit

Commit with message: `bench: add EmptyState component with unit tests`.

Once complete, output <promise>COMPLETE</promise>.

## Rules

- Read the existing code (`App.tsx`, `tokens.css`, one existing test file for patterns) then build. No excessive exploration.
- Do not write throwaway browser scripts.
- Do not edit locked files (`e2e/acceptance/`, `e2e/support/`, `playwright.config.ts`, `.claude/`).
- Do not run Playwright tests — this component has no acceptance tests.
