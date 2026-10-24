import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface BooksState {
  books: Book[];
  loading: boolean;
}

export function useBooks(): BooksState {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (active) {
          setBooks(result);
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

  return { books, loading };
}
