import { useState } from 'react';
import './ChipBar.css';

type ChipKey = 'all' | 'to-read' | 'reading' | 'finished';

interface ChipDef {
  key: ChipKey;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'to-read', label: 'To Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

// State is local; a parent component will lift it to drive grid filtering.
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<ChipKey>>(() => new Set<ChipKey>(['all']));

  function toggle(key: ChipKey): void {
    setSelected((prev) => {
      if (key === 'all') return new Set<ChipKey>(['all']);
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
      {CHIPS.map((definition) => (
        <button
          key={definition.key}
          type="button"
          className="chip"
          aria-pressed={selected.has(definition.key)}
          onClick={() => toggle(definition.key)}
        >
          {definition.label}
        </button>
      ))}
    </div>
  );
}
