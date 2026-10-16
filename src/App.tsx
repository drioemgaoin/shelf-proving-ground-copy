import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

const SKELETON_COUNT = 6;

type ChipId = 'all' | Status;
const CHIPS: { id: ChipId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'to-read', label: 'To Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' },
];

export function App(): React.JSX.Element {
  // null while the API is in flight — drives the skeleton/populated swap.
  const [books, setBooks] = useState<Book[] | null>(null);
  const [selectedChip, setSelectedChip] = useState<ChipId>('all');

  useEffect(() => {
    let active = true;
    getBooks()
      .then((loaded) => {
        if (active) setBooks(loaded);
      })
      .catch(() => {
        // Full-page error state is a later ticket; fail soft to an empty shelf.
        if (active) setBooks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = books === null;

  return (
    <main id="app" className="shelf">
      <div className="shelf-chips" role="group" aria-label="Filter by status">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="shelf-chip"
            aria-pressed={c.id === selectedChip}
            onClick={() => setSelectedChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={`skeleton-${i}`} className="shelf-card shelf-card-skeleton">
                <span className="shelf-skeleton-pill" />
                <span className="shelf-skeleton-bar shelf-skeleton-bar-title" />
                <span className="shelf-skeleton-bar shelf-skeleton-bar-author" />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id} className="shelf-card">
                <span className="shelf-card-badge" />
                <span className="shelf-card-title">{book.title}</span>
                <span className="shelf-card-author">{book.author}</span>
              </li>
            ))}
      </ul>

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
