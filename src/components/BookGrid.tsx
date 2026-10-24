import type { BooksState } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { SkeletonCard } from './Skeleton';
import './BookGrid.css';

const SKELETON_COUNT = 6;

interface BookGridProps {
  state: BooksState;
}

function renderItems(state: BooksState): React.JSX.Element[] {
  switch (state.status) {
    case 'ready':
      return state.books.map((book) => (
        <li key={book.id} className="book-grid-item">
          <BookCard book={book} />
        </li>
      ));
    case 'loading':
      return Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <li key={`skeleton-${i}`} className="book-grid-item">
          <SkeletonCard />
        </li>
      ));
    case 'error':
      return [];
  }
}

export function BookGrid({ state }: BookGridProps): React.JSX.Element {
  return (
    <ul className="book-grid" role="list">
      {renderItems(state)}
    </ul>
  );
}
