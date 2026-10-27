import { useShelf } from '../../hooks/useShelf';
import { ChipBar } from '../ChipBar/ChipBar';
import { BookCard } from '../BookCard/BookCard';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_COUNT = 6;

export function Shelf(): React.JSX.Element {
  const { books, loading } = useShelf();

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={i}>
                <SkeletonCard />
              </li>
            ))
          : books.map((book) => (
              <li key={book.id}>
                <BookCard book={book} />
              </li>
            ))}
      </ul>
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
