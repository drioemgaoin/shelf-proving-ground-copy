import type { Book, Status } from '../api';
import './Card.css';

const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  finished: 'Finished',
};

interface CardProps {
  book: Book;
}

export function Card({ book }: CardProps): React.JSX.Element {
  return (
    <li className="book-card">
      <p className="card-title">{book.title}</p>
      <p className="card-author">{book.author}</p>
      <span className="card-badge">{STATUS_LABELS[book.status]}</span>
    </li>
  );
}
