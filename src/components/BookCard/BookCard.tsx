import type { Book } from '../../api';
import './BookCard.css';

interface BookCardProps {
  readonly book: Book;
}

export function BookCard({ book }: BookCardProps): React.JSX.Element {
  return (
    <div className="book-card">
      <p className="book-card-title">{book.title}</p>
      <p className="book-card-author">{book.author}</p>
      <span className="book-card-badge">{book.status}</span>
    </div>
  );
}
