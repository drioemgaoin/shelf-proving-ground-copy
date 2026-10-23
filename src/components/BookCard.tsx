import type { Book, Status } from '../types';
import '../styles/card.css';

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

export function BookCard({ book }: { book: Book }): React.JSX.Element {
  return (
    <li className="book-card">
      <span className="book-card-badge">{STATUS_LABELS[book.status]}</span>
      <p className="book-card-title">{book.title}</p>
      {book.author ? <p className="book-card-author">{book.author}</p> : null}
    </li>
  );
}
