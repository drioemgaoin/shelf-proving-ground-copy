import { useState } from 'react';
import type { Status } from '../types';
import '../styles/chip-bar.css';

const STATUS_CHIPS: { label: string; status: Status }[] = [
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

// Self-contained for now: toggling a chip updates only its own pressed state.
// Empty selection means the "All" chip is the one pressed.
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function toggle(status: Status): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button
        type="button"
        className="chip"
        aria-pressed={selected.size === 0}
        onClick={() => setSelected(new Set())}
      >
        All
      </button>
      {STATUS_CHIPS.map(({ label, status }) => (
        <button
          key={status}
          type="button"
          className="chip"
          aria-pressed={selected.has(status)}
          onClick={() => toggle(status)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
