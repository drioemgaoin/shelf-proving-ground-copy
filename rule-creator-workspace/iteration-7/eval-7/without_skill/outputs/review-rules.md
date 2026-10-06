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
    tier: T3
    agent: visual-qa
    scope: "global"
    instruction: "Capture a screenshot in light mode, then toggle to dark mode and capture a second screenshot. Overlay or compare the two screenshots and check whether any element has moved position, changed size, or caused reflow. A violation is any visible layout shift — text reflowing to a different number of lines, containers changing width or height, elements jumping position, or spacing changes between elements. Ignore expected changes: background color, text color, border color, shadow color, and other purely chromatic differences are fine. Correct: the two screenshots are geometrically identical — every element occupies the same position and dimensions in both themes, with only color values changing."
    triage_hint: "Element position, size, or spacing changed between light and dark mode"
    group: visual-quality
    priority: 2
    critical: false
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
    tier: T3
    agent: reviewer
    scope: "src/**/*.{ts,tsx}"
    instruction: "Read each source file and identify every function declaration, arrow function, or method whose body exceeds 50 lines (count from the line after the opening brace to the line before the closing brace, excluding blank lines and comment-only lines). A violation is any function body longer than 50 lines, or any function — regardless of length — that performs multiple unrelated responsibilities (e.g., fetching data, transforming it, and computing derived state in a single function). Correct: every function is at most 50 lines and has a single clear responsibility. Long functions are split into named helper functions or custom hooks, each doing one focused thing."
    triage_hint: "Function body exceeds 50 lines or mixes unrelated responsibilities"
    group: code-structure
    priority: 2
    critical: false
  ```
