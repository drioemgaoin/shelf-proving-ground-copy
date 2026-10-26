import { ChipBar } from '../ChipBar/ChipBar';
import { useBooks } from '../../hooks/useBooks';
import type { Book, Status } from '../../api';
import './Shelf.css';

const SKELETON_COUNT = 6;

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

function SkeletonCard(): React.JSX.Element {
  return (
    <li className="shelf-card skeleton-card">
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
      <span className="skeleton-pill" />
    </li>
  );
}

function BookCard({ book }: { book: Book }): React.JSX.Element {
  return (
    <li className="shelf-card">
      <p className="card-title">{book.title}</p>
      <p className="card-author">{book.author}</p>
      <span className="card-badge">{STATUS_LABELS[book.status]}</span>
    </li>
  );
}

export function Shelf(): React.JSX.Element {
  const { books, state } = useBooks();
  const loading = state === 'loading';

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => <SkeletonCard key={index} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
