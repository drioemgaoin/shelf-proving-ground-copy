import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

interface UseBooksResult {
  books: Book[];
  loading: boolean;
  error: boolean;
}

// Loads the reading list once on mount. The grid shows skeletons while loading
// stays true, then hard-swaps to the resolved books.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, loading, error };
}
