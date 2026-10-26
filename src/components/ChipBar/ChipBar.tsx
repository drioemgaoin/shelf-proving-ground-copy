import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

interface StatusChip {
  key: Status;
  label: string;
}

const STATUS_CHIPS: StatusChip[] = [
  { key: 'to-read', label: 'To Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  // No active status means the "All" chip owns the pressed state.
  const allPressed = selected.size === 0;

  function toggle(key: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function reset(): void {
    setSelected(new Set());
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button type="button" className="chip" aria-pressed={allPressed} onClick={reset}>
        All
      </button>
      {STATUS_CHIPS.map((status) => (
        <button
          key={status.key}
          type="button"
          className="chip"
          aria-pressed={selected.has(status.key)}
          onClick={() => toggle(status.key)}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}
