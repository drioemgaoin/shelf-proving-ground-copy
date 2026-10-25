import './SkeletonCard.css';

// Same element and role as a real card so the loading grid keeps its shape.
export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-bar" />
      <span className="skeleton-bar" />
      <span className="skeleton-pill" />
    </li>
  );
}
