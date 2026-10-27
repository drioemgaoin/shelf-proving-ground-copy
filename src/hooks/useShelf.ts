import { useEffect, useState } from 'react';
import { getBooks, type Book } from '../api';

export interface ShelfData {
  books: Book[];
  loading: boolean;
}

/** Load the reading list once on mount, tracking a loading flag for skeletons. */
export function useShelf(): ShelfData {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const loaded = await getBooks();
        if (active) setBooks(loaded);
      } catch {
        // Swallowed so a failed load leaves an empty grid rather than crashing.
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { books, loading };
}
