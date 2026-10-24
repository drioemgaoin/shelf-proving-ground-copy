import './SkeletonCard.css';

export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-bar skeleton-bar-title" />
      <span className="skeleton-bar skeleton-bar-author" />
      <span className="skeleton-pill" />
    </li>
  );
}
