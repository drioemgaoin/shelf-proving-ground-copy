import type { Book, Status } from '../api';
import './BookGrid.css';

// Number of skeleton placeholders shown while the shelf loads.
const SKELETON_COUNT = 6;

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

interface BookGridProps {
  readonly books: readonly Book[];
  readonly loading: boolean;
}

// The responsive card grid. While loading it renders a fixed set of skeleton
// cards that occupy the same footprint as real cards, so the swap is shift-free.
export function BookGrid({ books, loading }: BookGridProps): React.JSX.Element {
  return (
    <ul role="list" className="book-grid">
      {loading
        ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <SkeletonCard key={index} />
          ))
        : books.map((book) => <BookCard key={book.id} book={book} />)}
    </ul>
  );
}

function BookCard({ book }: { readonly book: Book }): React.JSX.Element {
  return (
    <li className="card book-card">
      <span className="card-title">{book.title}</span>
      {book.author ? <span className="card-author">{book.author}</span> : null}
      <span className="card-badge">{STATUS_LABELS[book.status]}</span>
    </li>
  );
}

function SkeletonCard(): React.JSX.Element {
  return (
    <li className="card skeleton-card">
      <span className="skeleton-line skeleton-line-title" />
      <span className="skeleton-line skeleton-line-author" />
      <span className="skeleton-pill" />
    </li>
  );
}
