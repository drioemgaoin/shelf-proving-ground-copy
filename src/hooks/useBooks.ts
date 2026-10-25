import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface BooksState {
  books: Book[];
  loading: boolean;
  error: boolean;
}

// Loads the shelf once on mount. The `active` guard drops late resolutions
// after unmount so we never touch a torn-down tree.
export function useBooks(): BooksState {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, loading, error };
}
