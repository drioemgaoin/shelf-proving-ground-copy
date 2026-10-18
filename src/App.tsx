import { useEffect, useState } from 'react';
import { getBooks, type Book, type Status } from './api';
import './App.css';

// The chip bar offers an "All" default plus one chip per status. "all" is a
// sentinel, not a real status — it means "no status filter selected".
type ChipValue = Status | 'all';

interface Chip {
  readonly value: ChipValue;
  readonly label: string;
}

const CHIPS: readonly Chip[] = [
  { value: 'all', label: 'All' },
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
];

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

// Exactly six skeletons while data loads (ticket djk.1). No stagger.
const SKELETON_COUNT = 6;

export function App(): React.JSX.Element {
  // null = still loading. The grid shows skeletons until the first resolve.
  const [books, setBooks] = useState<Book[] | null>(null);
  // Empty set means the "All" chip is the active one. This ticket tracks the
  // chip bar's pressed/visual state only — grid filtering ships in djk.2.
  const [selected, setSelected] = useState<ReadonlySet<Status>>(new Set());

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (active) setBooks(result);
      })
      .catch(() => {
        // Error-state UI is a separate ticket; leave the skeletons in place.
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleChip(value: ChipValue): void {
    if (value === 'all') {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function isPressed(value: ChipValue): boolean {
    if (value === 'all') return selected.size === 0;
    return selected.has(value);
  }

  const loading = books === null;

  return (
    <main className="shelf">
      <div className="shelf-filters" role="group" aria-label="Filter by status">
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className="chip"
            aria-pressed={isPressed(chip.value)}
            onClick={() => toggleChip(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="shelf-announcer" aria-live="polite" />

      <ul className="grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={`skeleton-${index}`} className="card">
                <span className="card-bar" />
                <span className="card-bar" />
                <span className="card-pill" />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id} className="card">
                <span className="card-title">{book.title}</span>
                <span className="card-author">{book.author}</span>
                <span className="card-badge">{STATUS_LABELS[book.status]}</span>
              </li>
            ))}
      </ul>
    </main>
  );
}
