import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

type ChipKey = 'all' | Status;

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

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<ChipKey>>(() => new Set<ChipKey>(['all']));

  // Filtering is not wired in this ticket; chips only update their own pressed state.
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
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          className="chip"
          aria-pressed={selected.has(c.key)}
          onClick={() => toggle(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
