import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';
import { ChipBar } from './ChipBar';
import { BookGrid } from './BookGrid';
import './Shelf.css';

// Top-level shelf page: loads the reading list, shows skeletons while it loads,
// then the real card grid. Filtering and mutation announcements land in later
// tickets; the aria-live region is seeded here so they have a home.
export function Shelf(): React.JSX.Element {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getBooks()
      .then((loaded) => {
        if (active) {
          setBooks(loaded);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shelf">
      <ChipBar />
      <BookGrid books={books} loading={loading} />
      <div aria-live="polite" />
    </main>
  );
}
