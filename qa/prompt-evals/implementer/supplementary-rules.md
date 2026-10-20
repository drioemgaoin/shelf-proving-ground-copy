## Process (builder) — comment style

- Comments explain WHY, never WHAT. One short line maximum. If the name already says it, write no comment. No multi-line JSDoc blocks.

  CORRECT: `// null = loading; array (possibly empty) = loaded`
  CORRECT: `// Owns only visual pressed state; grid filtering is not wired.`
  CORRECT: (no comment — the name `SKELETON_COUNT` already explains itself)

  WRONG:
  ```ts
  /** Fixed number of skeleton placeholders shown while the shelf loads. */
  const SKELETON_COUNT = 6;
  ```
  — restates the name

  WRONG:
  ```ts
  // null while the first load is in flight; an array once data (or an empty
  // shelf) has arrived. Skeletons render during the null phase.
  ```
  — two lines when one suffices: `// null = loading; array = loaded`

  ```enforcement
  id: "comment-style"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx,css}"
  group: clarity
  triage_hint: "Flag when: JSDoc block, multi-line comment, comment restating name or type signature, comment explaining WHAT not WHY"
  instruction: "Every comment MUST explain WHY, never WHAT. One short line maximum. No multi-line JSDoc blocks. If the function/variable name already communicates the meaning, the comment is a violation."
  ```
