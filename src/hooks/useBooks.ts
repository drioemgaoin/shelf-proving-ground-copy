import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

interface UseBooksResult {
  books: Book[];
  loading: boolean;
}

// Books arrive newest-first from the adapter.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, loading };
}
