import type { Book, Status } from '../../api';
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
    <li className="book-card">
      <p className="book-card-title">{book.title}</p>
      <p className="book-card-author">{book.author}</p>
      <span className="book-card-badge">{STATUS_LABELS[book.status]}</span>
    </li>
  );
}
