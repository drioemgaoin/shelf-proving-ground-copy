import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export type ShelfLoadState = 'loading' | 'ready' | 'error';

export interface UseBooksResult {
  books: Book[];
  state: ShelfLoadState;
}

// Load the shelf once on mount. The adapter owns all I/O; this hook only
// mirrors its async result into render state.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [state, setState] = useState<ShelfLoadState>('loading');

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
