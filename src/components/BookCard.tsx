import type { Book, Status } from '../types';
import './BookCard.css';

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

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps): React.JSX.Element {
  return (
    <article className="book-card">
      <span className="book-card-badge">{statusLabel(book.status)}</span>
      <p className="book-card-title">{book.title}</p>
      {book.author ? <p className="book-card-author">{book.author}</p> : null}
    </article>
  );
}
