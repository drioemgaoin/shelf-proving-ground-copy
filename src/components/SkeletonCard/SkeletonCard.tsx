import './SkeletonCard.css';

// A loading placeholder shaped like a real card so the swap causes no shift.
// Kept as an <li> (no aria-hidden) so it stays in the list's accessible tree.
export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-pill" />
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
    </li>
  );
}
