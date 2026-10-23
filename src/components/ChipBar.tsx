import { useState } from 'react';
import type { Status } from '../types';
import './ChipBar.css';

const STATUS_CHIPS: { status: Status; label: string }[] = [
  { status: 'to-read', label: 'To Read' },
  { status: 'reading', label: 'Reading' },
  { status: 'finished', label: 'Finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());
  const allPressed = selected.size === 0;

  function selectAll(): void {
    setSelected(new Set());
  }

  function toggle(status: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button type="button" className="chip" aria-pressed={allPressed} onClick={selectAll}>
        All
      </button>
      {STATUS_CHIPS.map(({ status, label }) => (
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
