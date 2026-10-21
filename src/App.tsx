import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

const STATUS_FILTERS: { label: string; status: Status }[] = [
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

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
  const [selected, setSelected] = useState<Status[]>([]);

  useEffect(() => {
    let active = true;
    void getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  function selectAll(): void {
    setSelected([]);
  }

  function toggleStatus(status: Status): void {
    setSelected((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  const loading = books === null;
  const allPressed = selected.length === 0;

  return (
    <main className="shelf">
      <div className="chip-bar" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={allPressed} onClick={selectAll}>
          All
        </button>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.status}
            type="button"
            className="chip"
            aria-pressed={selected.includes(filter.status)}
            onClick={() => toggleStatus(filter.status)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={`skeleton-${index}`} className="shelf-card shelf-skeleton">
                <span className="shelf-skeleton-bar shelf-skeleton-title" />
                <span className="shelf-skeleton-bar shelf-skeleton-author" />
                <span className="shelf-skeleton-bar shelf-skeleton-badge" />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id} className="shelf-card">
                <span className="shelf-card-title">{book.title}</span>
                {book.author ? <span className="shelf-card-author">{book.author}</span> : null}
                <span className="shelf-card-badge">{statusLabel(book.status)}</span>
              </li>
            ))}
      </ul>

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
