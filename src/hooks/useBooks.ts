import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface UseBooks {
  books: Book[];
  loading: boolean;
}

export function useBooks(): UseBooks {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Books arrive newest-first from the adapter.
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
