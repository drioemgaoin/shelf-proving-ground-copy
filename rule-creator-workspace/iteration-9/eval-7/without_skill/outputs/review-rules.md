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

  ```yaml
  enforcement:
    tier: T3
    agent: visual-qa
    scope: "global"
    instruction: "Take a full-page screenshot in light mode and another in dark mode. Overlay or compare the two screenshots pixel-by-pixel, focusing on element positions and dimensions — not colors. A violation is any element (card, button, heading, grid cell, drawer) that shifts position, changes size, gains or loses padding/margin, or causes content reflow when the theme switches. Text rewrapping, container height changes, and badge repositioning all count. Correct: every element occupies the exact same position and dimensions in both themes — only foreground colors, background colors, and border colors change."
    triage_hint: "Element shifted position or changed dimensions between light and dark mode"
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
    tier: T1
    pattern: "function/method body exceeding 50 lines (AST line count from opening to closing brace)"
    assert: "No function or arrow function body exceeds 50 lines"
    scope: "src/**/*.{ts,tsx}"
    fix: "Extract coherent blocks into named helper functions or custom hooks"
  ```

  ```yaml
  enforcement:
    tier: T3
    agent: reviewer
    scope: "src/**/*.{ts,tsx}"
    instruction: "Read each function and arrow function in the file. Count the lines from the opening brace to the closing brace of the function body. A violation is any function whose body exceeds 50 lines. Additionally, check whether each function has a single clear responsibility — a function that performs multiple unrelated tasks (e.g., fetching data, transforming it, and updating UI state) violates the spirit of the rule even if it is under 50 lines. Correct: every function is under 50 lines and has a single, nameable purpose. If a function does multiple things, it should delegate to well-named helper functions or hooks."
    triage_hint: "Function body exceeds 50 lines or performs multiple unrelated responsibilities"
    group: code-structure
    priority: 2
    critical: false
  ```

  > **Gap:** The qualifier "focused" is not enforceable by line count alone. A 45-line function that does three unrelated things would pass T1 but violate the spirit of the rule. If the team wants "focused" enforced independently, create a separate T3 reviewer rule for single-responsibility at the function level.
