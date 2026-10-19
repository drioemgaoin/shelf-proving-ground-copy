import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

// Filter chips, in bar order after the "All" default. Grid filtering is not
// wired here — chips own only their own pressed/visual state.
const STATUS_FILTERS: { label: string; status: Status }[] = [
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

// Placeholder count while the shelf loads; matches the skeleton screenshot.
const SKELETON_COUNT = 6;

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

export function App(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  useEffect(() => {
    let active = true;
    void getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  // "All" is pressed exactly when no status chip is selected.
  const allPressed = selected.size === 0;

  function toggleStatus(status: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function selectAll(): void {
    setSelected(new Set());
  }

  const isLoading = books === null;

  return (
    <main className="shelf-page">
      <div className="chip-bar" role="group" aria-label="Filter by status">
        <button
          type="button"
          className="chip"
          aria-pressed={allPressed}
          onClick={selectAll}
        >
          All
        </button>
        {STATUS_FILTERS.map(({ label, status }) => (
          <button
            key={status}
            type="button"
            className="chip"
            aria-pressed={selected.has(status)}
            onClick={() => toggleStatus(status)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ul className="shelf-grid" role="list">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <li className="shelf-card" key={index}>
              <span className="skeleton-bar" />
              <span className="skeleton-bar" />
              <span className="skeleton-pill" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="shelf-grid" role="list">
          {books.map((book) => (
            <li className="shelf-card" key={book.id}>
              <p className="card-title">{book.title}</p>
              <p className="card-author">{book.author}</p>
              <span className="card-badge">{STATUS_LABELS[book.status]}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
