import { useBooks } from '../../hooks/useBooks';
import { ChipBar } from '../ChipBar/ChipBar';
import { Card } from '../Card/Card';
import { Skeleton } from '../Skeleton/Skeleton';
import './Shelf.css';

const SKELETON_COUNT = 6;

export function Shelf(): React.JSX.Element {
  const { books, loading } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => <Skeleton key={index} />)
          : books.map((book) => <Card key={book.id} book={book} />)}
      </ul>
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
