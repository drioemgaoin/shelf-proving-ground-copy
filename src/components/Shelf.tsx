import { useBooks } from '../hooks/useBooks';
import { ChipBar } from './ChipBar';
import { BookCard } from './BookCard';
import { SkeletonCard } from './SkeletonCard';
import '../styles/shelf.css';

const SKELETON_COUNT = 6;

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <div className="shelf-content">
        <ChipBar />
        <ul role="list" className="shelf-grid">
          {loading
            ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <SkeletonCard key={index} />
              ))
            : books.map((book) => <BookCard key={book.id} book={book} />)}
        </ul>
        <div className="shelf-announcer" aria-live="polite" />
      </div>
    </main>
  );
}
