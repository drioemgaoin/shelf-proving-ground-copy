import '../styles/skeleton.css';

// Same <li>/listitem shape as a real card so the swap causes no layout shift
// and the accessible tree keeps a stable listitem count.
export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="skeleton-card">
      <span className="skeleton-pill" />
      <span className="skeleton-bar skeleton-bar-title" />
      <span className="skeleton-bar skeleton-bar-author" />
    </li>
  );
}
