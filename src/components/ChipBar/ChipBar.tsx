import { useState } from 'react';
import type { Status } from '../../api';
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
  const [selected, setSelected] = useState<Status[]>([]);

  function toggle(value: ChipValue): void {
    if (value === 'all') {
      setSelected([]);
      return;
    }
    setSelected((current) =>
      current.includes(value)
        ? current.filter((status) => status !== value)
        : [...current, value],
    );
  }

  function isPressed(value: ChipValue): boolean {
    if (value === 'all') return selected.length === 0;
    return selected.includes(value);
  }

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className="chip"
          aria-pressed={isPressed(chip.value)}
          onClick={() => toggle(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
