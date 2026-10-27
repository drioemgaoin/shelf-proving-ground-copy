import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface BooksState {
  books: Book[];
  loading: boolean;
  error: boolean;
}

export function useBooks(): BooksState {
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
