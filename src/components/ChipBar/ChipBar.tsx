import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

interface Chip {
  label: string;
  status: Status;
}

const STATUS_CHIPS: Chip[] = [
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Status[]>([]);

  const toggle = (status: Status): void => {
    setSelected((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      <button
        type="button"
        className="chip"
        aria-pressed={selected.length === 0}
        onClick={() => setSelected([])}
      >
        All
      </button>
      {STATUS_CHIPS.map((chip) => (
        <button
          key={chip.status}
          type="button"
          className="chip"
          aria-pressed={selected.includes(chip.status)}
          onClick={() => toggle(chip.status)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
