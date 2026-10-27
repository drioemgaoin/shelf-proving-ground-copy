import { useState } from 'react';
import type { Status } from '../../api';
import './ChipBar.css';

interface ChipDef {
  readonly label: string;
  readonly status: Status | 'all';
}

const CHIPS: readonly ChipDef[] = [
  { label: 'All', status: 'all' },
  { label: 'To Read', status: 'to-read' },
  { label: 'Reading', status: 'reading' },
  { label: 'Finished', status: 'finished' },
];

export function ChipBar(): React.JSX.Element {
  const [selected, setSelected] = useState<Set<Status>>(() => new Set());

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

  return (
    <div className="chip-bar" role="group" aria-label="Filter by status">
      {CHIPS.map(({ label, status }) => {
        const pressed = status === 'all' ? selected.size === 0 : selected.has(status);
        const onClick = status === 'all' ? reset : () => toggle(status);
        return (
          <button key={label} type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
