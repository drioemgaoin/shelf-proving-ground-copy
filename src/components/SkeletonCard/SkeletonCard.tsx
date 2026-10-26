import './SkeletonCard.css';

export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <div className="skeleton-bar" />
      <div className="skeleton-bar skeleton-bar-short" />
      <div className="skeleton-pill" />
    </li>
  );
}
