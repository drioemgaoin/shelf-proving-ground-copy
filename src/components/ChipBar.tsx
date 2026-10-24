import { useState } from 'react';
import type { Status } from '../api';
import '../styles/chip.css';

interface ChipDef {
  label: string;
  status: Status | null;
}

const CHIPS: ChipDef[] = [
  { label: 'All', status: null },
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

// Holds its own selection state. "All" is pressed whenever no status is chosen.
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function isPressed(status: Status | null): boolean {
    if (status === null) return selected.size === 0;
    return selected.has(status);
  }

  function handleClick(status: Status | null): void {
    if (status === null) {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div role="group" aria-label="Filter by status" className="chip-bar">
      {CHIPS.map((def) => (
        <button
          key={def.label}
          type="button"
          className="chip"
          aria-pressed={isPressed(def.status)}
          onClick={() => handleClick(def.status)}
        >
          {def.label}
        </button>
      ))}
    </div>
  );
}
