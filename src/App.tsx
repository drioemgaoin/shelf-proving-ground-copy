import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

// Filter chips, in display order. Grid filtering is a later ticket (djk.2);
// here the chips only own their own pressed/visual state.
const STATUS_ORDER: Status[] = ['to-read', 'reading', 'finished'];
const STATUS_LABEL: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

// Exactly six skeleton placeholders while the shelf loads.
const SKELETON_COUNT = 6;

export function App(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);
  // Empty set means the "All" chip is the active one.
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  useEffect(() => {
    let active = true;
    getBooks()
      .then((loaded) => {
        if (active) setBooks(loaded);
      })
      .catch(() => {
        // Error state ships in a later ticket.
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = books === null;
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

  return (
    <main className="shelf">
      <div className="shelf-chips" role="group" aria-label="Filter by status">
        <button
          type="button"
          className="shelf-chip"
          aria-pressed={allPressed}
          onClick={selectAll}
        >
          All
        </button>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className="shelf-chip"
            aria-pressed={selected.has(status)}
            onClick={() => toggleStatus(status)}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <li key={index} className="shelf-card shelf-card-skeleton">
                <div className="shelf-skeleton-bar shelf-skeleton-title" />
                <div className="shelf-skeleton-bar shelf-skeleton-author" />
                <div className="shelf-skeleton-pill" />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id} className="shelf-card">
                <h3 className="shelf-card-title">{book.title}</h3>
                <p className="shelf-card-author">{book.author ?? ''}</p>
                <span className="shelf-card-badge">{STATUS_LABEL[book.status]}</span>
              </li>
            ))}
      </ul>

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
