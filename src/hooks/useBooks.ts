import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export type ShelfStatus = 'loading' | 'ready' | 'error';

export interface UseBooksResult {
  books: Book[];
  status: ShelfStatus;
}

// Load the shelf once on mount. Books arrive newest-first from the adapter.
export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [status, setStatus] = useState<ShelfStatus>('loading');

  useEffect(() => {
    let active = true;
    getBooks()
      .then((result) => {
        if (!active) return;
        setBooks(result);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    // Guard against a resolve landing after unmount.
    return () => {
      active = false;
    };
  }, []);

  return { books, status };
}
