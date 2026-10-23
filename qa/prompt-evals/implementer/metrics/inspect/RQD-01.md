# RQD-01 — Placeholder list items in role=list container — must not use aria-hidden

**Result:** ✓ PASS
**Rule:** role-query-diagnostic
**Duration:** 24.0s
**Model:** sonnet

## Task

Write a NotificationList component. It receives `items: Notification[]` and `isLoading: boolean`. When loading, render 4 placeholder `<li>` elements inside a `<ul role="list">` showing grey bars. When loaded, render the real notification items as `<li>`. Use tokens for all styling. Include the CSS file.

## Output

```tsx
import './NotificationList.css';

interface Notification {
  id: string;
  message: string;
}

interface NotificationListProps {
  items: Notification[];
  isLoading: boolean;
}

export function NotificationList({ items, isLoading }: NotificationListProps): JSX.Element {
  if (isLoading) {
    return (
      <ul role="list" className="notification-list">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="notification-item notification-item--placeholder">
            <span className="notification-bar" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul role="list" className="notification-list">
      {items.map((item) => (
        <li key={item.id} className="notification-item">
          {item.message}
        </li>
      ))}
    </ul>
  );
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| output_compliance | Model produced component code with exports/imports | ✓ PASS |
| constraint_adherence | No aria-hidden on placeholder elements — they must participate in the accessible tree for role-based locators | ✓ PASS |
| constraint_adherence | Named exports only — no default exports | ✓ PASS |
| task_accuracy | Must render a list container with role=list | ✓ PASS |
