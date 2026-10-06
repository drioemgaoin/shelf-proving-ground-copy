---
paths: "src/**/*"
---

# Review Rules

## Visual Quality

- Loading skeletons match the shape and layout of the content they replace.

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "ShelfGrid, BookCard, Drawer"
    instruction: "Compare the loading/skeleton state screenshot against the loaded/populated state screenshot for each component. Look for skeleton placeholder elements (rectangles, circles, shimmering bars) and check whether they occupy the same positions, widths, and heights as the real content they replace. A violation is a skeleton element that is missing, significantly different in size, or in a different position than its corresponding content element — e.g., a single wide bar where the loaded state has two lines, or a skeleton that is half the height of the actual card. Correct: every piece of real content (title, author, badge, image) has a matching skeleton placeholder of approximately the same dimensions and position, so the transition from loading to loaded causes no perceptible layout jump."
    group: visual-quality
    priority: 2
    critical: false
  ```

- Dark mode toggle does not cause a visible layout shift.

  ```yaml
  enforcement:
    tier: T2
    scope: "global"
    assert: "Playwright test toggles data-theme between light and dark, measures CLS via PerformanceObserver (layout-shift entries), and asserts total CLS < 0.01"
  ```

## Code Structure

- No business logic in React component files — extract to custom hooks or utility modules.

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/components/**/*.tsx"
    instruction: "Read each React component file and check whether it contains business logic — data transformations, validation rules, computed derivations, API call orchestration, or state machines that are not directly about rendering. A violation is a component file that performs domain-specific computation (e.g., filtering books by status, computing reading statistics, validating form input beyond simple required-field checks) inline rather than importing it from a custom hook or utility module. Correct: component files contain only JSX rendering, event handler wiring, and calls to imported hooks/utilities — all domain logic lives in files under hooks/ or utils/."
    triage_hint: "Component file contains inline data transformation, validation, or domain computation"
    group: code-structure
    priority: 2
    critical: false
  ```

- Functions longer than 50 lines are split into smaller, focused units.

  ```yaml
  enforcement:
    tier: T1
    pattern: "function/method body exceeding 50 lines (AST line count from opening to closing brace)"
    assert: "No function or arrow function body exceeds 50 lines"
    scope: "src/**/*.{ts,tsx}"
    fix: "Extract coherent blocks into named helper functions or custom hooks"
  ```

  > **Gap:** The qualifier "focused" is not enforceable by line count alone. A 45-line function that does three unrelated things would pass T1 but violate the spirit of the rule. If the team wants "focused" enforced independently, create a separate T3 reviewer rule for single-responsibility at the function level.
