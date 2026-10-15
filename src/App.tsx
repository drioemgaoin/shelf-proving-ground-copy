import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggle(value: FilterValue): void {
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
      <ul className="shelf-grid" role="list">
        {visible.map((book) => (
          <li key={book.id} className="shelf-card">
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
