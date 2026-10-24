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
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((status) => status !== value) : [...prev, value],
    );
  }

  function isPressed(value: ChipValue): boolean {
    if (value === 'all') return selected.length === 0;
    return selected.includes(value);
  }

  return (
    <div role="group" aria-label="Filter by status" className="chip-bar">
      {CHIPS.map((definition) => (
        <button
          key={definition.value}
          type="button"
          className="chip"
          aria-pressed={isPressed(definition.value)}
          onClick={() => toggle(definition.value)}
        >
          {definition.label}
        </button>
      ))}
    </div>
  );
}
