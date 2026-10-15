# TASK

You are a sandcastle performance benchmark. This is a **COMPLEX** task.

Build the Shelf grid — the main page-load surface for the reading-list app.

## Context

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

## ENVIRONMENT

`UI_GUARD=afk` is set. This means:
- You CAN write to `src/` using the Write, Edit, or Bash tools — all work.
- You CANNOT edit locked files: `e2e/acceptance/`, `e2e/support/`, `scripts/ui-qa/`, `playwright.config.ts`, `.claude/`.
- Do NOT probe the guard hook or test whether writes work. They do. Just write files.

Extra integration tests you write go in `e2e/agent/`, not `e2e/acceptance/`.

## CRITICAL: Read before probing

**Do NOT write throwaway browser scripts.** Read `e2e/agent/pw-facts.spec.ts` first — it contains validated answers to browser API questions (color serialization with `@property`, CSS animation easing vs WAAPI, transition persistence, clock behavior). Every answer you need is already there.

## What to build

Navigate to the shelf and see the complete page-load flow: 6 skeleton cards appear instantly while the API responds, then hard-swap to a responsive grid of placeholder cards showing all books newest-first.

### Page structure

The page renders inside a `<main>` wrapper. The grid is a `<ul role="list">` with `<li>` per card. Placeholder cards show title text, author text, and a badge-shaped element.

### Skeleton cards

- Two shimmer bars (title-height + author-height) and a small pill placeholder (top-right)
- Shimmer is an opacity pulse using `--shelf-motion-duration-slow`
- Under `prefers-reduced-motion: reduce`, skeletons are static (no animation)
- Transition to real cards is a hard swap (skeletons unmount, cards appear)
- **Dark mode**: use `--shelf-borderColor-default` (not `-subtle`) for skeleton bars so they stay visible against the raised card surface. In dark mode, `-subtle` collapses to the same value as the card background.

### Grid layout

- CSS `auto-fill`/`minmax(280px, 1fr)`, capped at 4 columns via ~1280px max-width centered
- Gap: `--shelf-space-lg`
- Page padding: `--shelf-space-md` on mobile, `--shelf-space-lg` at 768px+
- Cards stretch to tallest in row (grid default)

### Filter chip bar

- Above the grid, `div` with `role="group"` and `aria-label="Filter by status"`
- Chips are `<button>` elements with `aria-pressed`
- Order: All | To Read | Reading | Finished
- "All" selected by default
- Chip gap: `--shelf-space-sm`
- Selected chip: accent fill; unselected: subtle border; `border-radius: var(--shelf-radius-full)`
- **Important**: The locked chip-visual-states test compares `getPropertyValue('--token')` to `getComputedStyle(el).backgroundColor`. These only match if the token is registered via `@property { syntax: '<color>' }`. Read `e2e/agent/pw-facts.spec.ts` for proof.

### Aria-live region

An `aria-live="polite"` region exists in the DOM. Reserve its vertical space up front (e.g. `min-block-size` matching one line of text) so it never causes layout shift when text appears.

### Entrance animation

- Staggered entrance for cards using the **Web Animations API** (not CSS `@keyframes`, not CSS transitions — read pw-facts for why)
- Use `--shelf-motion-duration-fast` for duration, `--shelf-motion-easing-enter` for easing
- Stagger delay: `index * 50ms`, capped at 20 cards
- Use `fill: 'both'` so the animation persists and is readable by tests
- **Transform-only** (e.g. `translateY(8px)` to `translateY(0)`) — do NOT animate opacity, because the a11y test runs with no settle and mid-fade text fails contrast
- Under `prefers-reduced-motion: reduce`, skip the animation entirely (cards appear instantly)

### Filtering behavior

When a chip is clicked, filter the visible cards. When "All" is selected, show all. Multi-select: clicking a status chip toggles it. If all status chips are deselected, revert to "All". Announce filter changes in the live region (e.g. "Showing 3 Reading books").

### Component token registration

Register `--shelf-bgColor-accent` and `--shelf-borderColor-subtle` via `@property { syntax: '<color>' }` in `tokens.css` so `getPropertyValue` returns `rgb()` matching computed styles.

## Acceptance tests

All tests in `e2e/acceptance/shelf-grid.spec.ts` must pass. Run them with:
```
npx playwright test -g "Shelf grid" --project=desktop --reporter=line
```

Then run across all projects:
```
npx playwright test --reporter=line
```

## SPEED RULES

- **Exploration budget: under 2 minutes.** Read: `src/App.tsx`, `src/api.ts`, `src/styles/tokens.css`, `e2e/acceptance/shelf-grid.spec.ts`, `e2e/agent/pw-facts.spec.ts`, `playwright.config.ts`. Then start writing code. Do not read hooks, settings, eslint config, or other infrastructure unless a build fails.
- **No throwaway scripts.** pw-facts has the answers. If you need to verify something, write a test in `e2e/agent/`, not a disposable .mjs file.
- **Write all source files in one batch**, then validate. Don't write one file, test, write another, test.

## EXECUTION

Use the tdd skill:

1. RED: run an existing locked acceptance test — confirm it fails
2. GREEN: write the minimum implementation to pass it
3. REPEAT until all acceptance tests pass
4. REFACTOR

## Validation

Before committing: `npm run typecheck && npm run lint && npm run test`

After committing: delegate to the **visual-qa** agent.

## Commit

Commit with a descriptive message starting with `bench:`.

Once complete, output <promise>COMPLETE</promise>.
