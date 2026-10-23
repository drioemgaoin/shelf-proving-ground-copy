import { useBooks, type BooksState } from '../../hooks/useBooks';
import { ChipBar } from '../ChipBar/ChipBar';
import { BookCard } from '../BookCard/BookCard';
import { SkeletonCard } from '../SkeletonCard/SkeletonCard';
import './Shelf.css';

const SKELETON_COUNT = 6;

function renderCards(state: BooksState): React.JSX.Element[] {
  if (state.status === 'ready') {
    return state.books.map((book) => <BookCard key={book.id} book={book} />);
  }
  if (state.status === 'error') {
    return [];
  }
  return Array.from({ length: SKELETON_COUNT }, (_, index) => <SkeletonCard key={index} />);
}

export function Shelf(): React.JSX.Element {
  const state = useBooks();

  return (
    <main id="app" className="shelf">
      <h1 className="shelf-heading">Shelf</h1>
      <ChipBar />
      <ul className="shelf-grid" role="list">
        {renderCards(state)}
      </ul>
      <div className="shelf-announce" aria-live="polite" />
    </main>
  );
}
