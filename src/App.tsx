import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

type FilterValue = Status | 'all';

interface Filter {
  label: string;
  value: FilterValue;
}

// Order is locked by the spec: All | To Read | Reading | Finished.
const FILTERS: Filter[] = [
  { label: 'All', value: 'all' },
  { label: 'To Read', value: 'to-read' },
  { label: 'Reading', value: 'reading' },
  { label: 'Finished', value: 'finished' },
];

// Skeleton placeholders shown while the first load is in flight.
const SKELETON_COUNT = 6;

// Stagger entrance: each card delays 50ms more than the previous one, capped at
// 20 cards so a large list (the `many` fixture) never waterfalls for seconds.
const STAGGER_STEP_MS = 50;
const STAGGER_CAP = 20;

// Parse a CSS time token ("150ms" / "0ms") into milliseconds.
function parseMs(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return parseFloat(trimmed);
  if (trimmed.endsWith('s')) return parseFloat(trimmed) * 1000;
  return parseFloat(trimmed) || 0;
}

function statusLabel(status: Status): string {
  switch (status) {
    case 'to-read':
      return 'To Read';
    case 'reading':
      return 'Reading';
    case 'finished':
      return 'Finished';
  }
}

export function App(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);
  // Active status filters. An empty set means "All" — no filter applied.
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(new Set());
  // Bumped on every filter change. Prefixed onto card keys so React remounts the
  // whole filtered list and the entrance animation re-runs (re-stagger).
  const [generation, setGeneration] = useState(0);
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let active = true;
    getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  // Staggered card entrance. Driven via the Web Animations API (not CSS) so the
  // animation carries the enter easing at the effect level. Runs on first load
  // (skeletons -> cards) and on every filter change (generation bump remounts
  // the list). Fades opacity 0 -> 1 and rises translateY 8px -> 0, 50ms per card,
  // capped at STAGGER_CAP so a 200-book list never waterfalls. Reduced motion
  // skips animation entirely, leaving cards at full opacity with no movement.
  useLayoutEffect(() => {
    const ul = gridRef.current;
    if (ul === null || books === null) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const styles = getComputedStyle(document.documentElement);
    const duration = parseMs(styles.getPropertyValue('--shelf-motion-duration-fast'));
    const easing = styles.getPropertyValue('--shelf-motion-easing-enter').trim();
    const rise = styles.getPropertyValue('--shelf-space-sm').trim();

    Array.from(ul.children).forEach((node, index) => {
      if (index >= STAGGER_CAP || !(node instanceof HTMLElement)) return;
      if (typeof node.animate !== 'function') return;
      node.animate(
        [
          { opacity: 0, transform: `translateY(${rise})` },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration, delay: index * STAGGER_STEP_MS, easing, fill: 'backwards' },
      );
    });
  }, [books, generation]);

  function toggle(value: FilterValue): void {
    setGeneration((prev) => prev + 1);
    if (value === 'all') {
      setActiveStatuses(new Set());
      return;
    }
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  const visible = useMemo(() => {
    if (books === null) return [];
    if (activeStatuses.size === 0) return books;
    return books.filter((book) => activeStatuses.has(book.status));
  }, [books, activeStatuses]);

  const allSelected = activeStatuses.size === 0;

  // Live-region announcement of the filtered count after every change.
  let announcement = '';
  if (books !== null) {
    if (allSelected) {
      announcement = `Showing all ${books.length} books`;
    } else {
      announcement = `Showing ${visible.length} books`;
    }
  }

  let gridBody: React.JSX.Element;
  if (books === null) {
    gridBody = (
      <ul className="shelf-grid" role="list">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <li key={index} className="shelf-card shelf-card-skeleton">
            <span className="shelf-skeleton shelf-skeleton-badge" />
            <span className="shelf-skeleton shelf-skeleton-title" />
            <span className="shelf-skeleton shelf-skeleton-author" />
          </li>
        ))}
      </ul>
    );
  } else if (visible.length === 0) {
    gridBody = <p className="shelf-empty-filter">No books match this filter.</p>;
  } else {
    gridBody = (
      <ul className="shelf-grid" role="list" ref={gridRef}>
        {visible.map((book) => (
          <li key={`${generation}-${book.id}`} className="shelf-card">
            <span className="shelf-badge">{statusLabel(book.status)}</span>
            <span className="shelf-title">{book.title}</span>
            {book.author ? <span className="shelf-author">{book.author}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main id="app" className="shelf">
      <div className="shelf-chips" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => {
          const pressed = filter.value === 'all' ? allSelected : activeStatuses.has(filter.value);
          return (
            <button
              key={filter.value}
              type="button"
              className="shelf-chip"
              aria-pressed={pressed}
              onClick={() => toggle(filter.value)}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {gridBody}

      <div className="shelf-live" aria-live="polite">
        {announcement}
      </div>
    </main>
  );
}
