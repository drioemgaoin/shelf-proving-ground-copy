import { Shelf } from './Shelf';

// Application shell. The reading-list surface mounts inside #app.
export function App(): React.JSX.Element {
  return (
    <div id="app">
      <Shelf />
    </div>
  );
}
