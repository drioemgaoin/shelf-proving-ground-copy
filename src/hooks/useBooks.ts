import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface BooksState {
  books: Book[];
  loading: boolean;
}

// Load the shelf once on mount. The adapter owns the I/O and the fixture delay;
// the hook only tracks the resulting list and whether it has arrived yet.
export function useBooks(): BooksState {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, loading };
}
