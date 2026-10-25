import { useBooks } from '../hooks/useBooks';
import { ChipBar } from './ChipBar';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import './Shelf.css';

const SKELETON_COUNT = 6;

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <div className="shelf-live" aria-live="polite" />
      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => <Skeleton key={`skeleton-${i}`} />)
          : books.map((book) => <Card key={book.id} book={book} />)}
      </ul>
    </main>
  );
}
