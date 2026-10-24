import { useBooks } from '../../hooks/useBooks';
import { ChipBar } from '../ChipBar/ChipBar';
import { BookCard } from '../BookCard/BookCard';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5'];

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <div className="shelf-announce" aria-live="polite" />
      <div className="shelf-body">
        <ChipBar />
        <ul className="shelf-grid" role="list">
          {loading
            ? SKELETON_KEYS.map((key) => <SkeletonCard key={key} />)
            : books.map((book) => <BookCard key={book.id} book={book} />)}
        </ul>
      </div>
    </main>
  );
}
