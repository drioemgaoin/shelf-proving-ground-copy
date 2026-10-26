import { useBooks } from '../../hooks/useBooks';
import { BookCard } from '../BookCard/BookCard';
import { ChipBar } from '../ChipBar/ChipBar';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_COUNT = 6;

export function Shelf(): React.JSX.Element {
  const { books, state } = useBooks();
  const loading = state === 'loading';

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <SkeletonCard key={index} />
            ))
          : books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
      <div className="shelf-announcer" aria-live="polite" />
    </main>
  );
}
