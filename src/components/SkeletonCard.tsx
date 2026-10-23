import '../styles/card.css';

// Same <li> as a real card so it counts in the list and swaps without shift.
export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-pill" />
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
    </li>
  );
}
