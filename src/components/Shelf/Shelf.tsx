import { useBooks } from '../../hooks/useBooks';
import { ChipBar } from '../ChipBar/ChipBar';
import { BookGrid } from '../BookGrid/BookGrid';
import './Shelf.css';

export function Shelf(): React.JSX.Element {
  const { books, state } = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <div className="shelf-live" aria-live="polite" />
      <BookGrid books={books} loading={state === 'loading'} />
    </main>
  );
}
