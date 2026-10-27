import './Skeleton.css';

export function Skeleton(): React.JSX.Element {
  return (
    <li className="skeleton">
      <span className="skeleton-bar" />
      <span className="skeleton-bar skeleton-bar-short" />
      <span className="skeleton-pill" />
    </li>
  );
}
