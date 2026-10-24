import './Skeleton.css';

export function SkeletonCard(): React.JSX.Element {
  return (
    <article className="skeleton-card">
      <span className="skeleton-pill" />
      <span className="skeleton-bar" />
      <span className="skeleton-bar" />
    </article>
  );
}
