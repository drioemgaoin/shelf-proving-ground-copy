import { useState } from 'react';
import './ChipBar.css';

// The filter chip bar manages only its own selection state; grid filtering is wired by its consumer.
interface ChipDef {
  readonly key: string;
  readonly label: string;
}

const CHIPS: readonly ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'to-read', label: 'To Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

export function ChipBar(): React.JSX.Element {
  // "All" is the default: pressing a status chip clears it; clearing the last
  // status chip falls back to "All".
  const [pressed, setPressed] = useState<readonly string[]>(['all']);

  function toggle(key: string): void {
    if (key === 'all') {
      setPressed(['all']);
      return;
    }
    setPressed((prev) => {
      const statuses = prev.filter((k) => k !== 'all');
      const next = statuses.includes(key)
        ? statuses.filter((k) => k !== key)
        : [...statuses, key];
      return next.length === 0 ? ['all'] : next;
    });
  }

  return (
    <div role="group" aria-label="Filter by status" className="chip-bar">
      {CHIPS.map((def) => (
        <button
          key={def.key}
          type="button"
          className="chip"
          aria-pressed={pressed.includes(def.key)}
          onClick={() => toggle(def.key)}
        >
          {def.label}
        </button>
      ))}
    </div>
  );
}
