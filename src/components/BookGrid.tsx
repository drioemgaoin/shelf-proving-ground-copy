import type { Book } from '../api';
import { BookCard } from './BookCard';
import { SkeletonCard } from './SkeletonCard';
import './BookGrid.css';

const SKELETON_COUNT = 6;
const SKELETON_KEYS = Array.from({ length: SKELETON_COUNT }, (_, i) => `skeleton-${i}`);

interface BookGridProps {
  books: Book[];
  loading: boolean;
}

export function BookGrid({ books, loading }: BookGridProps): React.JSX.Element {
  return (
    <ul className="book-grid" role="list">
      {loading
        ? SKELETON_KEYS.map((key) => (
            <li key={key} className="book-grid-item">
              <SkeletonCard />
            </li>
          ))
        : books.map((book) => (
            <li key={book.id} className="book-grid-item">
              <BookCard book={book} />
            </li>
          ))}
    </ul>
  );
}
