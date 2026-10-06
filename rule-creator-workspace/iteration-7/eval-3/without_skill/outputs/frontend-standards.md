---
paths: src/**/*
---

# Frontend Standards

## Code Style

- No `as any` type assertions. Use proper type narrowing or generics.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for `as any` in all TypeScript files under `src/`.
  ```bash
  grep -rn "as any" src/ --include="*.ts" --include="*.tsx"
  ```
  **Correct example:**
  ```ts
  function getLength(value: string | string[]): number {
    if (Array.isArray(value)) {
      return value.length;
    }
    return value.length;
  }
  ```
  **Incorrect example:**
  ```ts
  function getLength(value: unknown): number {
    return (value as any).length;
  }
  ```
  **Why this matters:** `as any` bypasses the entire type system, hiding real bugs that would otherwise be caught at compile time. Proper narrowing preserves type safety end-to-end.
  </details>

- No `export default`. Use named exports exclusively.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for `export default` in all source files.
  ```bash
  grep -rn "export default" src/ --include="*.ts" --include="*.tsx"
  ```
  **Correct example:**
  ```ts
  export function BookCard({ title }: BookCardProps) { ... }
  export const BOOK_STATUSES = ['reading', 'finished', 'want-to-read'] as const;
  ```
  **Incorrect example:**
  ```ts
  export default function BookCard({ title }: BookCardProps) { ... }
  ```
  **Why this matters:** Named exports produce consistent import names across the codebase, make refactoring safer with find-and-replace, and enable better tree-shaking and IDE auto-imports.
  </details>

- No nested ternary expressions. Extract to variables or use if/else.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for nested ternary patterns (a `?` ... `:` containing another `?` ... `:`).
  ```bash
  grep -Prn '\?[^:]*\?[^:]*:' src/ --include="*.ts" --include="*.tsx"
  ```
  **Correct example:**
  ```ts
  const statusLabel = (() => {
    if (status === 'reading') return 'Currently Reading';
    if (status === 'finished') return 'Finished';
    return 'Want to Read';
  })();
  ```
  **Incorrect example:**
  ```ts
  const statusLabel = status === 'reading' ? 'Currently Reading' : status === 'finished' ? 'Finished' : 'Want to Read';
  ```
  **Why this matters:** Nested ternaries harm readability and make logic branches harder to debug. Extracted variables or if/else blocks are easier to scan, extend, and step through in a debugger.
  </details>

## CSS

- All values come from design tokens. No hardcoded `px`, `rem`, hex colors, or `rgb()` in component stylesheets.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for hardcoded values in component CSS files (exclude `tokens.css`).
  ```bash
  grep -rn --include="*.css" -E '(: *[0-9]+px|: *[0-9.]+rem|#[0-9a-fA-F]{3,8}|rgb\()' src/ | grep -v tokens.css
  ```
  **Correct example:**
  ```css
  .card {
    padding: var(--space-md);
    color: var(--color-text-primary);
    border-radius: var(--radius-sm);
  }
  ```
  **Incorrect example:**
  ```css
  .card {
    padding: 16px;
    color: #333333;
    border-radius: 4px;
  }
  ```
  **Why this matters:** Hardcoded values create inconsistency and make theming (including dark mode) impossible to maintain. Tokens provide a single source of truth for the visual language.
  </details>

- Animations use only `transform` and `opacity` properties.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Inspect `@keyframes` blocks and `transition` declarations for properties other than `transform` and `opacity`.
  ```bash
  grep -rn --include="*.css" -E '(transition|@keyframes)' src/ | grep -vE '(transform|opacity|transition-property)'
  ```
  Manual review: open any `@keyframes` block and confirm only `transform` and `opacity` are animated.
  **Correct example:**
  ```css
  .card-enter {
    transition: transform 200ms ease, opacity 200ms ease;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  ```
  **Incorrect example:**
  ```css
  .card-enter {
    transition: width 200ms ease, background-color 300ms ease;
  }
  @keyframes slideIn {
    from { left: 100%; }
    to   { left: 0; }
  }
  ```
  **Why this matters:** `transform` and `opacity` are composited on the GPU and avoid triggering layout or paint. Animating other properties (width, height, left, background-color) causes layout thrashing and janky frames, especially on mobile devices.
  </details>

- Never set a raw `z-index` value. Use the layer token system.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for raw `z-index` numeric values in component stylesheets.
  ```bash
  grep -rn --include="*.css" 'z-index:' src/ | grep -v 'var(--' | grep -v tokens.css
  ```
  **Correct example:**
  ```css
  .drawer {
    z-index: var(--layer-modal);
  }
  .fab {
    z-index: var(--layer-fab);
  }
  ```
  **Incorrect example:**
  ```css
  .drawer {
    z-index: 1000;
  }
  .fab {
    z-index: 999;
  }
  ```
  **Why this matters:** Raw z-index values lead to stacking-context wars where each fix requires a higher number. A layer token system defines an explicit ordering that is easy to reason about and maintain.
  </details>

## Accessibility

- All images have alt text (empty `alt=""` is acceptable for decorative images).

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for `<img` tags missing the `alt` attribute in TSX files.
  ```bash
  grep -rn --include="*.tsx" '<img ' src/ | grep -v 'alt='
  ```
  **Correct example:**
  ```tsx
  <img src={coverUrl} alt={`Cover of ${title}`} />
  <img src="/decorative-swirl.svg" alt="" />
  ```
  **Incorrect example:**
  ```tsx
  <img src={coverUrl} />
  <img src="/decorative-swirl.svg" />
  ```
  **Why this matters:** Screen readers announce images without alt text as their file name or URL, creating a confusing experience. Providing meaningful alt text (or empty alt for decorative images) is a WCAG 2.1 Level A requirement.
  </details>

- Color alone does not convey meaning. Use icons, patterns, or text labels as well.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Manual review. For every UI element that uses color to convey state (status badges, error highlights, success indicators), confirm there is a secondary indicator (icon, text label, pattern, or shape) that communicates the same information without color.
  ```
  Checklist:
  - Status badges: include text label, not just colored dot
  - Form validation: error icon or text alongside red border
  - Charts/graphs: use patterns or labels in addition to color coding
  ```
  **Correct example:**
  ```tsx
  <span className="badge badge--reading">
    <BookOpenIcon aria-hidden="true" /> Currently Reading
  </span>
  ```
  **Incorrect example:**
  ```tsx
  {/* Only a colored dot — no text, no icon */}
  <span className="badge" style={{ background: 'green' }} />
  ```
  **Why this matters:** Approximately 8% of men have some form of color vision deficiency. Relying solely on color makes information inaccessible, violating WCAG 2.1 SC 1.4.1 (Use of Color).
  </details>

- Tab order follows visual reading order (left-to-right, top-to-bottom).

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Check for positive `tabIndex` values that override natural DOM order, and verify that CSS layout (flexbox `order`, grid placement, `position: absolute`) does not cause visual order to diverge from DOM order.
  ```bash
  grep -rn --include="*.tsx" 'tabIndex=' src/ | grep -vE 'tabIndex=\{?(-1|0)\}?'
  ```
  Manual check: Tab through the page and confirm the focus sequence matches the visual layout.
  **Correct example:**
  ```tsx
  {/* DOM order matches visual order — no tabIndex needed */}
  <header>...</header>
  <nav>...</nav>
  <main>...</main>
  ```
  **Incorrect example:**
  ```tsx
  {/* Forcing tab order with positive tabIndex */}
  <button tabIndex={3}>Save</button>
  <button tabIndex={1}>Cancel</button>
  <button tabIndex={2}>Delete</button>
  ```
  **Why this matters:** Keyboard-only users depend on a predictable tab sequence. A tab order that jumps around the page is disorienting and violates WCAG 2.1 SC 2.4.3 (Focus Order).
  </details>

## Performance

- No synchronous `localStorage` reads in render paths.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for `localStorage.getItem` calls inside component bodies or render functions (outside of `useEffect` or event handlers).
  ```bash
  grep -rn --include="*.tsx" --include="*.ts" 'localStorage\.getItem' src/
  ```
  Then manually verify each hit is inside a `useEffect`, event handler, or initialization function — not in the render path.
  **Correct example:**
  ```ts
  function useTheme() {
    const [theme, setTheme] = useState('light');
    useEffect(() => {
      const saved = localStorage.getItem('theme');
      if (saved) setTheme(saved);
    }, []);
    return theme;
  }
  ```
  **Incorrect example:**
  ```tsx
  function BookShelf() {
    const theme = localStorage.getItem('theme') ?? 'light'; // blocks render
    return <div className={theme}>...</div>;
  }
  ```
  **Why this matters:** `localStorage` is synchronous and blocks the main thread. Reading it during render causes jank, especially on low-end devices where storage I/O is slow. Deferring reads to effects keeps the first paint fast.
  </details>

- Images above the fold use `loading="eager"`, below use `loading="lazy"`.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for `<img` tags and confirm each has an explicit `loading` attribute.
  ```bash
  grep -rn --include="*.tsx" '<img ' src/ | grep -v 'loading='
  ```
  Then review that above-the-fold images (hero, header logos) use `"eager"` and below-the-fold images (card grids, footers) use `"lazy"`.
  **Correct example:**
  ```tsx
  <img src={heroUrl} alt="Hero banner" loading="eager" />
  <img src={coverUrl} alt={title} loading="lazy" />
  ```
  **Incorrect example:**
  ```tsx
  {/* Missing loading attribute — browser decides, often eager */}
  <img src={coverUrl} alt={title} />
  ```
  **Why this matters:** Eager-loading off-screen images wastes bandwidth and delays Largest Contentful Paint. Lazy-loading above-the-fold images delays their appearance. Explicit `loading` values give deterministic, optimal behavior.
  </details>

- Bundle size for any single route does not exceed 200kb gzipped.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Run a production build and check the output sizes.
  ```bash
  npm run build && npx vite-bundle-analyzer
  ```
  Or check gzipped sizes directly:
  ```bash
  npm run build && find dist -name '*.js' -exec sh -c 'echo "$(gzip -c "$1" | wc -c) $1"' _ {} \;
  ```
  Confirm no single route chunk exceeds 200kb gzipped.
  **Correct example:**
  ```
  dist/assets/shelf-DxK3f.js    — 45kb gzipped  ✓
  dist/assets/drawer-Bm2q.js    — 12kb gzipped  ✓
  ```
  **Incorrect example:**
  ```
  dist/assets/shelf-DxK3f.js    — 250kb gzipped  ✗ (exceeds 200kb limit)
  ```
  **Why this matters:** Large bundles slow initial page load, especially on mobile networks. The 200kb budget forces code-splitting and keeps route transitions fast.
  </details>

## Architecture

- Business logic lives in hooks or utilities, not in component render functions.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Review component files for inline business logic (data transformation, filtering, sorting, validation) inside the component body rather than extracted to a hook or utility.
  ```bash
  # Look for complex logic patterns in component render bodies
  grep -rn --include="*.tsx" -E '\.(filter|sort|reduce|map)\(' src/components/
  ```
  Then verify each match is a call to an imported hook or utility, not inline logic.
  **Correct example:**
  ```tsx
  // useFilteredBooks.ts (hook)
  export function useFilteredBooks(books: Book[], status: Status) {
    return useMemo(() => books.filter(b => b.status === status), [books, status]);
  }

  // ShelfGrid.tsx (component)
  function ShelfGrid({ books }: Props) {
    const filtered = useFilteredBooks(books, activeStatus);
    return <div>{filtered.map(b => <BookCard key={b.id} book={b} />)}</div>;
  }
  ```
  **Incorrect example:**
  ```tsx
  function ShelfGrid({ books }: Props) {
    // Business logic mixed into the component
    const filtered = books
      .filter(b => b.status === activeStatus)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, pageSize);
    return <div>{filtered.map(b => <BookCard key={b.id} book={b} />)}</div>;
  }
  ```
  **Why this matters:** Extracting business logic to hooks and utilities makes it independently testable, reusable across components, and keeps components focused on rendering.
  </details>

- Components follow the single responsibility principle.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Review component file sizes and responsibilities. A component should do one thing. Warning signs: file exceeds ~150 lines, component manages multiple unrelated state variables, or the component name requires "And" to describe what it does.
  ```bash
  # Find large component files that may violate SRP
  find src/components -name '*.tsx' -exec sh -c 'lines=$(wc -l < "$1"); if [ "$lines" -gt 150 ]; then echo "$lines $1"; fi' _ {} \;
  ```
  **Correct example:**
  ```
  src/components/BookCard.tsx        — renders a single book card
  src/components/StatusBadge.tsx     — renders a status pill
  src/components/ShelfGrid.tsx       — lays out book cards in a grid
  ```
  **Incorrect example:**
  ```
  src/components/ShelfGridWithFilterAndSort.tsx  — renders grid, manages filters, handles sorting, shows empty state (too many responsibilities)
  ```
  **Why this matters:** Components with multiple responsibilities are harder to test, harder to reuse, and create larger blast radii when changes are needed. Single-responsibility components compose cleanly and fail in predictable ways.
  </details>

- Side effects are isolated in custom hooks, never inline in event handlers.

  <details>
  <summary>🔒 Enforcement</summary>

  **How to verify:** Search for side effects (API calls, analytics, navigation, toast notifications) inside event handler callbacks within components.
  ```bash
  grep -rn --include="*.tsx" -A5 'onClick=' src/components/ | grep -E '(fetch|navigate|toast|track|analytics)'
  ```
  **Correct example:**
  ```tsx
  // useDeleteBook.ts
  export function useDeleteBook() {
    const [deleteBook] = useMutation(DELETE_BOOK);
    return async (id: string) => {
      await deleteBook(id);
      announce('Book deleted');
    };
  }

  // BookDetail.tsx
  function BookDetail({ book }: Props) {
    const deleteBook = useDeleteBook();
    return <button onClick={() => deleteBook(book.id)}>Delete</button>;
  }
  ```
  **Incorrect example:**
  ```tsx
  function BookDetail({ book }: Props) {
    return (
      <button onClick={async () => {
        await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
        toast('Book deleted');
        navigate('/shelf');
      }}>
        Delete
      </button>
    );
  }
  ```
  **Why this matters:** Inline side effects are untestable without rendering the full component and simulating clicks. Custom hooks can be tested in isolation, composed, and reused. They also centralize error handling and loading state management.
  </details>
