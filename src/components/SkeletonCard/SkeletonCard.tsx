import './SkeletonCard.css';

// Mirrors BookCard's element and role (an <li>) so the loading-to-loaded swap
// keeps the same accessible tree and geometry.
export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-bar skeleton-bar-title" />
      <span className="skeleton-bar skeleton-bar-author" />
      <span className="skeleton-pill" />
    </li>
  );
}
