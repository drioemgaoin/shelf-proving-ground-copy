import type { Book } from '../api';
import { ChipBar } from './ChipBar';
import { BookCard } from './BookCard';
import { SkeletonCard } from './SkeletonCard';
import './Shelf.css';

const SKELETON_COUNT = 6;

export interface ShelfProps {
  books: Book[];
  loading: boolean;
}

export function Shelf({ books, loading }: ShelfProps): React.JSX.Element {
  return (
    <main className="shelf">
      <ChipBar />
      <ul role="list" className="shelf-grid">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => <SkeletonCard key={index} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
      <div className="shelf-announce" aria-live="polite" />
    </main>
  );
}
