import { useBooks } from './hooks/useBooks';
import { Shelf } from './components/Shelf';

export function App(): React.JSX.Element {
  const { books, loading } = useBooks();
  return <Shelf books={books} loading={loading} />;
}
