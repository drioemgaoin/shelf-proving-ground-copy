import { useBooks } from '../../hooks/useBooks';
import { BookCard } from '../BookCard/BookCard';
import { ChipBar } from '../ChipBar/ChipBar';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_KEYS = Array.from({ length: 6 }, (_, index) => index);

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <div className="shelf-live" aria-live="polite" />
      <ul className="shelf-grid" role="list">
        {loading
          ? SKELETON_KEYS.map((key) => <SkeletonCard key={key} />)
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
    </main>
  );
}
