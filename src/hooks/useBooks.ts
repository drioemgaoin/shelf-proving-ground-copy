import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export type ShelfLoadState = 'loading' | 'ready' | 'error';

export interface ShelfBooks {
  state: ShelfLoadState;
  books: Book[];
}

export function useBooks(): ShelfBooks {
  const [state, setState] = useState<ShelfLoadState>('loading');
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    // The active flag drops a late resolution after unmount.
    let active = true;
    getBooks()
      .then((loaded) => {
        if (!active) return;
        setBooks(loaded);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return { state, books };
}
