import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface BooksState {
  books: Book[];
  loading: boolean;
  error: Error | null;
}

// Loads the shelf once on mount. The adapter owns all I/O; this hook only
// orchestrates the async read into render-friendly state.
export function useBooks(): BooksState {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load the shelf.'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, loading, error };
}
