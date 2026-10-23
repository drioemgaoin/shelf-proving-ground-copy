import { useEffect, useState } from 'react';
import { getBooks } from '../api';
import type { Book } from '../types';

// Discriminated union so the UI renders skeletons, cards, or an error branch
// without juggling separate boolean flags.
export type BooksState =
  | { status: 'loading' }
  | { status: 'ready'; books: Book[] }
  | { status: 'error' };

// Loads the shelf once on mount. The active fixture decides timing and outcome.
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
    // Guards against a late resolve writing to an unmounted component.
    return () => {
      active = false;
    };
  }, []);

  return state;
}
