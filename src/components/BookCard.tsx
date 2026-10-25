import type { Book, Status } from '../api';
import './BookCard.css';

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps): React.JSX.Element {
  return (
    <article className="book-card">
      <span className="card-badge">{STATUS_LABELS[book.status]}</span>
      <p className="card-title">{book.title}</p>
      {book.author ? <p className="card-author">{book.author}</p> : null}
    </article>
  );
}
