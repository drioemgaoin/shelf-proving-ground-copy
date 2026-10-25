import { useState } from 'react';
import type { Status } from '../api';
import './ChipBar.css';

interface ChipDef {
  status: Status;
  label: string;
}

const CHIPS: ChipDef[] = [
  { status: 'to-read', label: 'To Read' },
  { status: 'reading', label: 'Reading' },
  { status: 'finished', label: 'Finished' },
];

// Empty set means "All" — no status filter is active.
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function toggle(status: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function reset(): void {
    setSelected(new Set());
  }

  const allSelected = selected.size === 0;

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button
        type="button"
        className="chip"
        aria-pressed={allSelected}
        onClick={reset}
      >
        All
      </button>
      {CHIPS.map((def) => (
        <button
          key={def.status}
          type="button"
          className="chip"
          aria-pressed={selected.has(def.status)}
          onClick={() => toggle(def.status)}
        >
          {def.label}
        </button>
      ))}
    </div>
  );
}
