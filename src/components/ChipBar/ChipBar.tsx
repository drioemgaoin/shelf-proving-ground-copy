import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

interface StatusChip {
  value: Status;
  label: string;
}

const STATUS_CHIPS: StatusChip[] = [
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Status[]>([]);

  function toggle(value: Status): void {
    setSelected((current) =>
      current.includes(value)
        ? current.filter((status) => status !== value)
        : [...current, value],
    );
  }

  const allPressed = selected.length === 0;

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button
        type="button"
        className="chip"
        aria-pressed={allPressed}
        onClick={() => setSelected([])}
      >
        All
      </button>
      {STATUS_CHIPS.map((status) => (
        <button
          key={status.value}
          type="button"
          className="chip"
          aria-pressed={selected.includes(status.value)}
          onClick={() => toggle(status.value)}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}
