import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { SkeletonCard } from './SkeletonCard';
import { ChipBar } from './ChipBar';
import '../styles/shelf.css';

const SKELETON_COUNT = 6;
const SKELETON_KEYS = Array.from({ length: SKELETON_COUNT }, (_, i) => `skeleton-${i}`);

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? SKELETON_KEYS.map((key) => <SkeletonCard key={key} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
