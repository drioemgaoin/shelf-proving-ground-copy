import { useState } from 'react';
import type { Status } from '../api';
import './ChipBar.css';

type ChipValue = Status | 'all';

interface ChipDef {
  label: string;
  value: ChipValue;
}

const CHIPS: ChipDef[] = [
  { label: 'All', value: 'all' },
  { label: 'To Read', value: 'to-read' },
  { label: 'Reading', value: 'reading' },
  { label: 'Finished', value: 'finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<Status>>(new Set());

  function toggle(value: ChipValue): void {
    if (value === 'all') {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function isPressed(value: ChipValue): boolean {
    if (value === 'all') {
      return selected.size === 0;
    }
    return selected.has(value);
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {CHIPS.map((chipDef) => (
        <button
          key={chipDef.value}
          type="button"
          className="chip"
          aria-pressed={isPressed(chipDef.value)}
          onClick={() => toggle(chipDef.value)}
        >
          {chipDef.label}
        </button>
      ))}
    </div>
  );
}
