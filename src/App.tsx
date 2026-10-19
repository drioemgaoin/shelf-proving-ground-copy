import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

// Status filter chips. "All" is handled separately — it is the reset, not a status.
const STATUS_FILTERS: { label: string; status: Status }[] = [
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

// Fixed number of skeleton placeholders shown while the shelf loads.
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

function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Status[]>([]);

  function toggleStatus(status: Status): void {
    setSelected((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  const allPressed = selected.length === 0;

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button
        type="button"
        className="chip"
        aria-pressed={allPressed}
        onClick={() => setSelected([])}
      >
        All
      </button>
      {STATUS_FILTERS.map(({ label, status }) => (
        <button
          key={status}
          type="button"
          className="chip"
          aria-pressed={selected.includes(status)}
          onClick={() => toggleStatus(status)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Loading placeholder: two shimmer bars and a pill, matching a real card's box. */
function SkeletonCard(): React.JSX.Element {
  return (
    <li className="card card-skeleton">
      <div className="skeleton-bar skeleton-bar-title" />
      <div className="skeleton-bar skeleton-bar-author" />
      <div className="skeleton-pill" />
    </li>
  );
}

/** Placeholder card. The Book card ticket owns the full card design later. */
function BookCard({ book }: { book: Book }): React.JSX.Element {
  return (
    <li className="card">
      <h2 className="card-title">{book.title}</h2>
      {book.author ? <p className="card-author">{book.author}</p> : null}
      <span className="card-badge">{statusLabel(book.status)}</span>
    </li>
  );
}

export function App(): React.JSX.Element {
  const [books, setBooks] = useState<Book[] | null>(null);

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (active) setBooks(result);
      })
      .catch(() => {
        // Error state is owned by a later ticket; fall back to an empty shelf.
        if (active) setBooks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = books === null;

  return (
    <main className="shelf">
      <ChipBar />
      <div className="shelf-announcer" aria-live="polite" />
      <ul className="grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => <SkeletonCard key={i} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
    </main>
  );
}
