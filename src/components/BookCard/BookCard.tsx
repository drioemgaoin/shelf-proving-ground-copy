import type { Book, Status } from '../../api';
import './BookCard.css';

interface BookCardProps {
  book: Book;
}

function statusLabel(status: Status): string {
  switch (status) {
    case 'to-read':
      return 'To Read';
    case 'reading':
      return 'Reading';
    case 'finished':
      return 'Finished';
  }
}

export function BookCard({ book }: BookCardProps): React.JSX.Element {
  return (
    <li className="book-card">
      <span className="book-card-badge">{statusLabel(book.status)}</span>
      <p className="book-card-title">{book.title}</p>
      {book.author ? <p className="book-card-author">{book.author}</p> : null}
    </li>
  );
}
