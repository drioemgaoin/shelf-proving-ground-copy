import { useBooks } from '../hooks/useBooks';
import { ChipBar } from './ChipBar';
import { BookGrid } from './BookGrid';
import './Shelf.css';

export function Shelf(): React.JSX.Element {
  const { books, status } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <BookGrid books={books} loading={status === 'loading'} />
      <div className="shelf-live-region" aria-live="polite" />
    </main>
  );
}
