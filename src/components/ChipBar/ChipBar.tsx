import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

type Filter = Status | 'all';

interface ChipDef {
  label: string;
  value: Filter;
}

const CHIPS: ChipDef[] = [
  { label: 'All', value: 'all' },
  { label: 'To Read', value: 'to-read' },
  { label: 'Reading', value: 'reading' },
  { label: 'Finished', value: 'finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(new Set());

  function toggle(value: Filter): void {
    if (value === 'all') {
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const isPressed = (value: Filter): boolean =>
    value === 'all' ? selected.size === 0 : selected.has(value);

  return (
    <div role="group" aria-label="Filter by status" className="chip-bar">
      {CHIPS.map((c) => (
        <button
          key={c.value}
          type="button"
          className="chip"
          aria-pressed={isPressed(c.value)}
          onClick={() => toggle(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
