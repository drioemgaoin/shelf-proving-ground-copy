import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  // Filtering behavior arrives in the next ticket; the chip bar is structural
  // here with "All" selected on load.
  const selected: FilterValue = 'all';

  return (
    <main id="app" className="shelf">
      <div className="shelf-chips" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className="shelf-chip"
            aria-pressed={filter.value === selected}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {books === null ? (
        <ul className="shelf-grid" role="list">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <li key={index} className="shelf-card shelf-card-skeleton">
              <span className="shelf-skeleton shelf-skeleton-badge" />
              <span className="shelf-skeleton shelf-skeleton-title" />
              <span className="shelf-skeleton shelf-skeleton-author" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="shelf-grid" role="list">
          {books.map((book) => (
            <li key={book.id} className="shelf-card">
              <span className="shelf-badge">{statusLabel(book.status)}</span>
              <span className="shelf-title">{book.title}</span>
              {book.author ? <span className="shelf-author">{book.author}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
