import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export type LoadState = 'loading' | 'ready' | 'error';

export interface BooksResult {
  books: Book[];
  state: LoadState;
}

// Loads the shelf once on mount. Newest-first ordering comes straight from the api.
export function useBooks(): BooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    getBooks()
      .then((result) => {
        if (cancelled) return;
        setBooks(result);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { books, state };
}
