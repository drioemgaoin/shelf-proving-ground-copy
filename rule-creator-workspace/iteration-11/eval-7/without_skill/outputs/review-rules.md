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
    instruction: "Capture a full-page screenshot in light mode, then toggle to dark mode and capture the same page again. Overlay or compare the two screenshots pixel-by-pixel focusing on element positions, sizes, and spacing — ignore color changes. A violation is any element that moves, resizes, or reflows between the two screenshots (text reflow, cards shifting, margins collapsing, scrollbar appearing/disappearing). Correct: every element occupies the exact same position and dimensions in both screenshots — only colors, backgrounds, and shadows change."
    triage_hint: "Element moved, resized, or reflowed when toggling between light and dark mode"
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
    instruction: "Read each source file and identify every function or arrow function whose body exceeds 50 lines (count from the opening brace to the closing brace, excluding blank lines and comments). A violation is any function body longer than 50 lines, or any function — regardless of length — that clearly performs multiple unrelated responsibilities (e.g., fetching data, transforming it, and updating unrelated state in one function). Correct: every function is at most 50 lines and has a single, clear purpose — multi-step logic is decomposed into named helper functions or custom hooks."
    triage_hint: "Function body exceeds 50 lines or mixes multiple unrelated responsibilities"
    group: code-structure
    priority: 2
    critical: false
  ```
