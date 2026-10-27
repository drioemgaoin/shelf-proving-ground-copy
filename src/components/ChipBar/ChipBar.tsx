import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

interface StatusChip {
  status: Status;
  label: string;
}

const STATUS_CHIPS: StatusChip[] = [
  { status: 'to-read', label: 'To Read' },
  { status: 'reading', label: 'Reading' },
  { status: 'finished', label: 'Finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function toggle(status: Status): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function reset(): void {
    setSelected(new Set());
  }

  // An empty selection means the "All" chip owns the pressed state.
  const allPressed = selected.size === 0;

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button type="button" className="chip" aria-pressed={allPressed} onClick={reset}>
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
