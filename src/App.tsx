import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

type FilterValue = Status | 'all';

interface Filter {
  readonly label: string;
  readonly value: FilterValue;
}

// Chip bar order. "All" is the default selection; the three statuses follow.
const FILTERS: readonly Filter[] = [
  { label: 'All', value: 'all' },
  { label: 'To Read', value: 'to-read' },
  { label: 'Reading', value: 'reading' },
  { label: 'Finished', value: 'finished' },
];

// Human-readable label for a book's status, shown in the card badge.
const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

// Number of skeleton placeholders rendered while the shelf loads.
const SKELETON_COUNT = 6;

export function App(): React.JSX.Element {
  // `null` means "still loading" — distinct from an empty shelf.
  const [books, setBooks] = useState<Book[] | null>(null);
  // Empty = "All" is active. A status present here means its chip is pressed.
  // (This ticket toggles chip state only; grid filtering ships in djk.2.)
  const [selected, setSelected] = useState<readonly Status[]>([]);

  useEffect(() => {
    let active = true;
    void getBooks().then((loaded) => {
      if (active) setBooks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleFilter(value: FilterValue): void {
    if (value === 'all') {
      setSelected([]);
      return;
    }
    setSelected((current) =>
      current.includes(value)
        ? current.filter((status) => status !== value)
        : [...current, value],
    );
  }

  function isPressed(value: FilterValue): boolean {
    if (value === 'all') return selected.length === 0;
    return selected.includes(value);
  }

  const loading = books === null;

  return (
    <main className="shelf">
      <div className="shelf-filters" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className="shelf-chip"
            aria-pressed={isPressed(filter.value)}
            onClick={() => toggleFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={`skeleton-${index}`} className="shelf-card shelf-skeleton">
                <span className="shelf-skeleton-bar" />
                <span className="shelf-skeleton-bar shelf-skeleton-bar-author" />
                <span className="shelf-skeleton-pill" />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id} className="shelf-card">
                <p className="shelf-card-title">{book.title}</p>
                <p className="shelf-card-author">{book.author}</p>
                <span className="shelf-card-badge">{STATUS_LABELS[book.status]}</span>
              </li>
            ))}
      </ul>

      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
