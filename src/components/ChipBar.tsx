import { useState } from 'react';
import type { Status } from '../api';
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

// Owns its own pressed state; the empty selection reads as "All".
export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Status[]>([]);

  function toggle(status: Status): void {
    setSelected((current) =>
      current.includes(status)
        ? current.filter((entry) => entry !== status)
        : [...current, status],
    );
  }

  const allPressed = selected.length === 0;

  return (
    <div role="group" aria-label="Filter by status" className="chip-bar">
      <button
        type="button"
        className="chip"
        aria-pressed={allPressed}
        onClick={() => setSelected([])}
      >
        All
      </button>
      {STATUS_CHIPS.map(({ status, label }) => (
        <button
          key={status}
          type="button"
          className="chip"
          aria-pressed={selected.includes(status)}
          onClick={() => toggle(status)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
