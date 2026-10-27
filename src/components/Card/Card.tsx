import type { Book, Status } from '../../api';
import './Card.css';

interface CardProps {
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

export function Card({ book }: CardProps): React.JSX.Element {
  return (
    <li className="card">
      <p className="card-title">{book.title}</p>
      <p className="card-author">{book.author}</p>
      <span className="card-badge">{statusLabel(book.status)}</span>
    </li>
  );
}
