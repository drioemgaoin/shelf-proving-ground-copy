import { useBooks } from '../../hooks/useBooks';
import { BookCard } from '../BookCard/BookCard';
import { ChipBar } from '../ChipBar/ChipBar';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_COUNT = 6;
const SKELETON_SLOTS = Array.from({ length: SKELETON_COUNT }, (_, index) => index);

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? SKELETON_SLOTS.map((slot) => <SkeletonCard key={slot} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
