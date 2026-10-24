import { useBooks } from '../hooks/useBooks';
import { BookGrid } from './BookGrid';
import { ChipBar } from './ChipBar';
import './Shelf.css';

export function Shelf(): React.JSX.Element {
  const { state, books } = useBooks();
  return (
    <main className="shelf">
      <div className="shelf-content">
        <ChipBar />
        <div className="shelf-announcer" aria-live="polite" />
        <BookGrid state={state} books={books} />
      </div>
    </main>
  );
}
