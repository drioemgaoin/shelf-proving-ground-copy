import { useState } from 'react';
import type { Status } from '../api';
import './ChipBar.css';

type ChipKey = Status | 'all';

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

// "All" is the pressed default: it reads as pressed whenever no status is
// selected, so clearing the last status snaps the bar back to "All".
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function toggle(key: ChipKey): void {
    if (key === 'all') {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isPressed(key: ChipKey): boolean {
    if (key === 'all') return selected.size === 0;
    return selected.has(key);
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          className="chip"
          aria-pressed={isPressed(c.key)}
          onClick={() => toggle(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
