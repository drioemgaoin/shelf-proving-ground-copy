import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

// Number of skeleton placeholder cards shown while the shelf loads.
const SKELETON_COUNT = 6;

// Filter chips, in display order. "All" is a reset pseudo-chip; the three
// status chips map to a Book status. Filtering behavior arrives in a later
// ticket — here the chips only carry their selected/unselected visual state.
const STATUS_CHIPS: { status: Status; label: string }[] = [
  { status: 'to-read', label: 'To Read' },
  { status: 'reading', label: 'Reading' },
  { status: 'finished', label: 'Finished' },
];

export function App(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  useEffect(() => {
    let active = true;
    getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const loading = books === null;
  const allSelected = selected.size === 0;

  function toggle(status: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function reset(): void {
    setSelected(new Set());
  }

  return (
    <div id="app">
      <main className="shelf">
        <div className="shelf-inner">
          <div className="chips" role="group" aria-label="Filter by status">
            <button
              type="button"
              className="chip"
              aria-pressed={allSelected}
              onClick={reset}
            >
              All
            </button>
            {STATUS_CHIPS.map(({ status, label }) => (
              <button
                key={status}
                type="button"
                className="chip"
                aria-pressed={selected.has(status)}
                onClick={() => toggle(status)}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="grid" role="list">
            {loading
              ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <li key={`skeleton-${i}`} className="skeleton">
                    <span className="skeleton-pill" />
                    <span className="skeleton-bar skeleton-bar-title" />
                    <span className="skeleton-bar skeleton-bar-author" />
                  </li>
                ))
              : books.map((book) => (
                  <li key={book.id} className="card">
                    <span className="card-badge">{book.status}</span>
                    <span className="card-title">{book.title}</span>
                    <span className="card-author">{book.author}</span>
                  </li>
                ))}
          </ul>

          <div className="live" aria-live="polite" />
        </div>
      </main>
    </div>
  );
}
