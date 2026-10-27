import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface UseBooksResult {
  books: Book[];
  loading: boolean;
}

// Loads the shelf once on mount; adapter owns the I/O, the hook owns the state.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
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
