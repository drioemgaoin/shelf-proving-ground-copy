import { useBooks } from '../hooks/useBooks';
import { ChipBar } from './ChipBar';
import { BookGrid } from './BookGrid';
import './Shelf.css';

export function Shelf(): React.JSX.Element {
  const state = useBooks();

  return (
    <main className="shelf">
      <ChipBar />
      <BookGrid state={state} />
      {/* Mutations in later tickets announce here for assistive tech. */}
      <div className="shelf-live" aria-live="polite" />
    </main>
  );
}
