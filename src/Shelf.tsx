import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './styles/shelf.css';

// Six skeleton cards appear instantly while the API responds, then hard-swap
// to the real grid. Stagger is capped so very long lists don't animate forever.
const SKELETON_COUNT = 6;
const STAGGER_CAP = 20;
const STAGGER_STEP_MS = 50;

// Status chips, in display order after the "All" reset chip.
const STATUS_CHIPS: readonly { status: Status; label: string }[] = [
  { status: 'to-read', label: 'To Read' },
  { status: 'reading', label: 'Reading' },
  { status: 'finished', label: 'Finished' },
];

const STATUS_LABEL: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

/** "150ms" | "0.15s" -> 150. Mirrors the test helper so motion tokens round-trip. */
function toMs(value: string): number {
  const n = parseFloat(value);
  return value.trim().endsWith('ms') ? n : n * 1000;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  return <span className={`shelf-badge shelf-badge--${status}`}>{STATUS_LABEL[status]}</span>;
}

function ShelfCard({ book }: { book: Book }): React.JSX.Element {
  return (
    <li className="shelf-card">
      <StatusBadge status={book.status} />
      <p className="shelf-card-title">{book.title}</p>
      {book.author ? <p className="shelf-card-author">{book.author}</p> : null}
    </li>
  );
}

function SkeletonCard(): React.JSX.Element {
  // A listitem (counted by tests) whose inner placeholders are decorative.
  return (
    <li className="shelf-card shelf-skeleton">
      <span className="shelf-skeleton-pill" aria-hidden="true" />
      <span className="shelf-skeleton-bar shelf-skeleton-title" aria-hidden="true" />
      <span className="shelf-skeleton-bar shelf-skeleton-author" aria-hidden="true" />
    </li>
  );
}

export function Shelf(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<Set<Status>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    getBooks()
      .then((data) => {
        if (!cancelled) setBooks(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = books === null && !failed;
  const visible = books
    ? active.size === 0
      ? books
      : books.filter((b) => active.has(b.status))
    : [];

  // Announce filter results in the live region (space is reserved up front).
  useEffect(() => {
    if (!books) return;
    const count =
      active.size === 0 ? books.length : books.filter((b) => active.has(b.status)).length;
    const noun = count === 1 ? 'book' : 'books';
    if (active.size === 0) {
      setAnnouncement(`Showing all ${count} ${noun}`);
    } else {
      const labels = STATUS_CHIPS.filter((c) => active.has(c.status))
        .map((c) => c.label)
        .join(' and ');
      setAnnouncement(`Showing ${count} ${labels} ${noun}`);
    }
  }, [active, books]);

  // Staggered, transform-only entrance via the Web Animations API. Re-runs on
  // load and on every filter change. fill:"both" so the end state persists and
  // is readable by tests even after the animation finishes.
  useLayoutEffect(() => {
    if (loading || failed) return;
    if (prefersReducedMotion()) return;
    const grid = gridRef.current;
    if (!grid) return;
    const root = getComputedStyle(document.documentElement);
    const duration = toMs(root.getPropertyValue('--shelf-motion-duration-fast'));
    const easing = root.getPropertyValue('--shelf-motion-easing-enter').trim();
    const items = Array.from(grid.querySelectorAll<HTMLLIElement>('li.shelf-card'));
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      li.getAnimations().forEach((a) => a.cancel());
      const delay = i < STAGGER_CAP ? i * STAGGER_STEP_MS : 0;
      li.animate([{ transform: 'translateY(8px)' }, { transform: 'translateY(0)' }], {
        duration,
        delay,
        easing,
        fill: 'both',
      });
    }
  }, [books, active, loading, failed]);

  function selectAll(): void {
    setActive(new Set());
  }

  function toggle(status: Status): void {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <main className="shelf">
      <header className="shelf-header">
        <h1 className="shelf-heading">Shelf</h1>
      </header>

      <div className="shelf-chips" role="group" aria-label="Filter by status">
        <button
          type="button"
          className="shelf-chip"
          aria-pressed={active.size === 0}
          onClick={selectAll}
        >
          All
        </button>
        {STATUS_CHIPS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            className="shelf-chip"
            aria-pressed={active.has(status)}
            onClick={() => toggle(status)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="shelf-announce" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {failed ? (
        <p className="shelf-error" role="alert">
          Failed to load the shelf. Please try again.
        </p>
      ) : (
        <ul className="shelf-grid" role="list" ref={gridRef}>
          {loading
            ? Array.from({ length: SKELETON_COUNT }, (_, i) => <SkeletonCard key={`skeleton-${i}`} />)
            : visible.map((book) => <ShelfCard key={book.id} book={book} />)}
        </ul>
      )}
    </main>
  );
}
