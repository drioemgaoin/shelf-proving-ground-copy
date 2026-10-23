import { useState } from 'react';
import type { Status } from '../../types';
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

// "All" is pressed when no status is selected; otherwise each selected status
// reflects its own chip.
function isPressed(key: ChipKey, selected: ReadonlySet<Status>): boolean {
  if (key === 'all') return selected.size === 0;
  return selected.has(key);
}

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<Status>>(new Set());

  function toggle(key: ChipKey): void {
    if (key === 'all') {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {CHIPS.map((def) => (
        <button
          key={def.key}
          type="button"
          className="chip"
          aria-pressed={isPressed(def.key, selected)}
          onClick={() => toggle(def.key)}
        >
          {def.label}
        </button>
      ))}
    </div>
  );
}
