import type { Book } from '../api';
import type { ShelfLoadState } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { SkeletonCard } from './SkeletonCard';
import './BookGrid.css';

const SKELETON_KEYS = Array.from({ length: 6 }, (_, index) => index);

interface BookGridProps {
  state: ShelfLoadState;
  books: Book[];
}

export function BookGrid({ state, books }: BookGridProps): React.JSX.Element {
  return (
    <ul className="book-grid" role="list">
      {state === 'loading'
        ? SKELETON_KEYS.map((key) => <SkeletonCard key={key} />)
        : books.map((book) => <BookCard key={book.id} book={book} />)}
    </ul>
  );
}
