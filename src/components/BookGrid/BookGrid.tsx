import type { Book, Status } from '../../api';
import './BookGrid.css';

const SKELETON_COUNT = 6;

interface BookGridProps {
  books: Book[];
  loading: boolean;
}

function statusLabel(status: Status): string {
  switch (status) {
    case 'to-read':
      return 'To Read';
    case 'reading':
      return 'Reading';
    case 'finished':
      return 'Finished';
    default:
      return status;
  }
}

function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
      <span className="skeleton-pill" />
    </li>
  );
}

function BookCard({ book }: { book: Book }): React.JSX.Element {
  return (
    <li className="book-card">
      <p className="book-card-title">{book.title}</p>
      <p className="book-card-author">{book.author}</p>
      <span className="book-card-badge">{statusLabel(book.status)}</span>
    </li>
  );
}

export function BookGrid({ books, loading }: BookGridProps): React.JSX.Element {
  return (
    <ul role="list" className="shelf-grid">
      {loading
        ? Array.from({ length: SKELETON_COUNT }, (_, i) => <SkeletonCard key={i} />)
        : books.map((book) => <BookCard key={book.id} book={book} />)}
    </ul>
  );
}
