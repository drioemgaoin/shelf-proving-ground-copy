import { useEffect, useState } from 'react';
import { getBooks } from '../api';
import type { Book } from '../types';

export interface UseBooksResult {
  books: Book[];
  loading: boolean;
  error: Error | null;
}

// Loads the shelf once on mount. The active fixture (set in the entry) decides
// whether the read is instant, delayed, or fails.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load the shelf.'));
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
