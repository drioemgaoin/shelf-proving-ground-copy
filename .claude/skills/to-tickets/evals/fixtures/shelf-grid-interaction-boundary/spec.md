# Shelf grid

Fluid responsive card grid displaying all books with filter chips, newest-first order, staggered card entrance animation, and skeleton loading state. This is the spec — not buildable by itself; child tickets implement it.

## Filter chips

- **Interaction model**: "All" means no active filter. Selecting any status chip narrows the view; deselecting all chips returns to "All." Multi-select is supported (e.g. "To Read" + "Reading").
- **Visual**: Selected = accent fill (bgColor-accent) + on-accent text. Unselected = subtle border (borderColor-subtle) + default text. radius-full pills.
- **Order**: All | To Read | Reading | Finished (lifecycle order).
- **Spacing**: space-sm (8px) gap between chips.
- **Keyboard**: Each chip is a standalone button with aria-pressed. Tab moves between chips, Space/Enter toggles.
- **Position**: Scrolls with the page (not sticky).

## Grid layout

- **CSS**: grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)).
- **Max columns**: 4, enforced via max-width (~1280px) on the grid container, centered.
- **Gap**: space-lg (24px) between cards.
- **Page padding**: space-md (16px) on mobile, space-lg (24px) at 768px+.
- **Card height**: Grid default stretch (tallest card per row).
- **Filter bar to grid spacing**: space-lg (24px).
- **Responsive columns**: ~1 at 375px, ~2 at 768px, 3-4 at 1280px (natural from auto-fill/minmax).

## Staggered card animation

- **Property**: opacity 0 to 1 + translateY(8px) to 0.
- **Per-card stagger delay**: 50ms.
- **Duration**: --shelf-motion-duration-fast per card.
- **Easing**: --shelf-motion-easing-enter.
- **Trigger**: All visible cards re-stagger on initial load and on every filter change (re-key the list).
- **Cap**: Stagger applies to the first 20 cards only. Cards beyond index 20 appear at full opacity instantly.
- **Reduced motion** (prefers-reduced-motion: reduce): Simultaneous fade (no stagger, no translate). All cards fade in together.

## Skeleton loading state

- **Count**: Always 6, regardless of viewport.
- **Appearance**: Instant (no stagger animation). Two text shimmer bars (title-height + author-height) + small pill placeholder (top-right, for status badge). Matches real card anatomy to prevent CLS.
- **Shimmer**: Opacity pulse between ~0.1 and ~0.3, using --shelf-motion-duration-slow and --shelf-motion-easing-enter.
- **Reduced motion**: Static at lower opacity (no pulse).
- **Transition to real cards**: Hard swap — skeletons unmount, real cards stagger in with the standard entrance animation.

## Empty filtered state

- When books exist but no books match the active filter: centered muted text "No books match this filter." No CTA, no illustration.
- The true empty-shelf state (zero books) is owned by the Empty state ticket.

## Accessibility

- aria-live="polite" region announces book count on filter change (e.g. "Showing 3 books", "Showing all 6 books", "No books match this filter").
- Filter bar: div role="group" aria-label="Filter by status".
- Each chip: button aria-pressed="true|false".

## Semantic structure

- main wraps everything.
- Filter bar: div[role=group] containing chip buttons.
- Grid: ul[role=list] with li per card.

## Ticket boundary

- **No page title** in this ticket.
- Grid renders **minimal placeholder cards** (title text, author text, badge shape, correct dimensions). The Book card ticket owns the full card component.

## Design decisions

- **280px card min-width**: Gives natural 1/2/3-4 column breakpoints without media queries.
- **20-card stagger cap**: Prevents 10s waterfall on the many fixture (200 books).
- **6 skeletons always**: Matches default seed count; simpler than viewport-adaptive count.
- **"All" as zero-selection**: Simpler state model than an explicit "All" toggle that combines with individual chips.
- **No sticky filter bar**: Avoids z-index complexity and CLS risk.

## Acceptance tests (26)

Tests are pre-written in `tests/acceptance/shelf-grid/shelf-grid.spec.ts`. Each test carries a ticket tag.

**Behavior** (no category tag)
1. Shelf grid: shows all books by default
2. Shelf grid: "All" chip is selected on load
3. Shelf grid: filtering by one status shows matching books
4. Shelf grid: filtering by multiple statuses
5. Shelf grid: deselecting all chips returns to "All"
6. Shelf grid: tapping "All" resets filter
7. Shelf grid: newest-first order
8. Shelf grid: keyboard can toggle filter chips
9. Shelf grid: shows skeleton cards while loading

**Visual** (@visual)
10. Shelf grid: chip visual states
11. Shelf grid: default populated screenshot
12. Shelf grid: skeleton loading screenshot

**Layout** (@layout)
13. Shelf grid: no horizontal overflow at any width
14. Shelf grid: 1 column on mobile
15. Shelf grid: 2 columns on tablet
16. Shelf grid: 3-4 columns on desktop, max 4

**Motion** (@motion)
17. Shelf grid: cards stagger in on load with correct tokens
18. Shelf grid: cards re-stagger on filter change
19. Shelf grid: stagger capped at 20 cards
20. Shelf grid: reduced motion shows no translate and no stagger
21. Shelf grid: skeleton shimmer respects motion preference

**Accessibility** (@a11y)
22. Shelf grid: no axe violations
23. Shelf grid: filter chips have accessible names
24. Shelf grid: focus visible on tab through chips

**Stability** (@stability)
25. Shelf grid: no layout shift when skeleton swaps to cards

**Performance** (@perf)
26. Shelf grid: entrance animation within frame budget
