import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export type LoadState = 'loading' | 'ready' | 'error';

export interface BooksState {
  books: Book[];
  state: LoadState;
}

export function useBooks(): BooksState {
  const [books, setBooks] = useState<Book[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return { books, state };
}
