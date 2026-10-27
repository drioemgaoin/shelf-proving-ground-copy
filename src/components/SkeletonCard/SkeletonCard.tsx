import './SkeletonCard.css';

export function SkeletonCard(): React.JSX.Element {
  return (
    <div className="skeleton-card">
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
      <span className="skeleton-pill" />
    </div>
  );
}
