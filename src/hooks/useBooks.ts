import { useEffect, useState } from 'react';
import { getBooks } from '../api';
import type { Book } from '../types';

// Discriminated load state so the UI renders skeletons until real books arrive.
export type BooksState =
  | { status: 'loading' }
  | { status: 'ready'; books: Book[] }
  | { status: 'error' };

export function useBooks(): BooksState {
  const [state, setState] = useState<BooksState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getBooks()
      .then((books) => {
        if (active) setState({ status: 'ready', books });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    // Ignore a resolved fetch after unmount so we never set state on a dead view.
    return () => {
      active = false;
    };
  }, []);

  return state;
}
