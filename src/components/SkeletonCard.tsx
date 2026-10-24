import './SkeletonCard.css';

const BAR_KEYS = [0, 1];

export function SkeletonCard(): React.JSX.Element {
  return (
    <li className="shelf-card skeleton-card">
      {BAR_KEYS.map((key) => (
        <span key={key} className="skeleton-bar" />
      ))}
      <span className="skeleton-pill" />
    </li>
  );
}
