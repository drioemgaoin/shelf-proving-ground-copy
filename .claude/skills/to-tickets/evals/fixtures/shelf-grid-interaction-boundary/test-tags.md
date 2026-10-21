# Acceptance test tag assignments

Pre-written tests in `tests/acceptance/shelf-grid/shelf-grid.spec.ts`. Each test is tagged with exactly one ticket ID. The tickets must match these assignments.

## Ticket 1 (@djk.1) — 16 tests

- Shelf grid: shows all books by default
- Shelf grid: newest-first order
- Shelf grid: "All" chip is selected on load
- Shelf grid: shows skeleton cards while loading
- Shelf grid: chip visual states (@visual) — **clicks "Reading" chip and asserts accent background**
- Shelf grid: default populated screenshot (@visual)
- Shelf grid: skeleton loading screenshot (@visual)
- Shelf grid: no horizontal overflow at any width (@layout)
- Shelf grid: 1 column on mobile (@layout)
- Shelf grid: 2 columns on tablet (@layout)
- Shelf grid: 3-4 columns on desktop, max 4 (@layout)
- Shelf grid: skeleton shimmer respects motion preference (@motion)
- Shelf grid: no layout shift when skeleton swaps to cards (@stability)
- Shelf grid: no axe violations (@a11y)
- Shelf grid: filter chips have accessible names (@a11y)
- Shelf grid: focus visible on tab through chips (@a11y)

## Ticket 2 (@djk.2) — 5 tests

- Shelf grid: filtering by one status shows matching books
- Shelf grid: filtering by multiple statuses
- Shelf grid: deselecting all chips returns to "All"
- Shelf grid: tapping "All" resets filter
- Shelf grid: keyboard can toggle filter chips

## Ticket 3 (@djk.3) — 5 tests

- Shelf grid: cards stagger in on load with correct tokens (@motion)
- Shelf grid: cards re-stagger on filter change (@motion)
- Shelf grid: stagger capped at 20 cards (@motion)
- Shelf grid: reduced motion shows no translate and no stagger (@motion)
- Shelf grid: entrance animation within frame budget (@perf)
