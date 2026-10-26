import { useState } from 'react';
import './ChipBar.css';

type FilterKey = 'all' | 'to-read' | 'reading' | 'finished';

interface Filter {
  key: FilterKey;
  label: string;
}

const FILTERS: Filter[] = [
  { key: 'all', label: 'All' },
  { key: 'to-read', label: 'To Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

// State is local; a parent component will lift it to drive grid filtering.
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<FilterKey>>(new Set(['all']));

  function toggle(key: FilterKey): void {
    setSelected((prev) => {
      if (key === 'all') return new Set(['all']);
      const next = new Set(prev);
      next.delete('all');
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add('all');
      return next;
    });
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          className="chip"
          aria-pressed={selected.has(filter.key)}
          onClick={() => toggle(filter.key)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
