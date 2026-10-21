---
paths: "src/**/*"
---

# Review Rules

## Visual Quality

- Loading skeletons match the shape and layout of the content they replace.

- Dark mode toggle does not cause a visible layout shift.

## Code Structure

- No business logic in React component files — extract to custom hooks or utility modules.

- Functions longer than 50 lines are split into smaller, focused units.
