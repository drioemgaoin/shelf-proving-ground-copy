---
paths: "src/**/*"
---

# Code Quality Standards

## Naming

- Use descriptive variable names that convey purpose and meaning.

  <enforcement>
  When reviewing or writing code in `src/**/*`, check that variable names are
  descriptive and convey their purpose. Reject single-letter names (except `i`,
  `j`, `k` in short loops and `e` for event/error in callbacks), cryptic
  abbreviations, and generic names like `data`, `temp`, `val`, or `result` when
  a more specific name is possible. If a violation is found, rename the variable
  to reflect what it holds or represents and explain the improvement.
  </enforcement>

- Functions should do one thing well and have a name that describes that thing.

  <enforcement>
  When reviewing or writing functions in `src/**/*`, verify each function has a
  single, clear responsibility. Signs of violation: the function name includes
  "and" (e.g., `fetchAndRender`), the body has unrelated logical sections, or
  the function exceeds ~40 lines without clear justification. If a violation is
  found, extract the distinct responsibilities into separate well-named
  functions and explain the decomposition.
  </enforcement>

## Imports

- No unused imports.

  <enforcement>
  When modifying any file in `src/**/*`, scan the import block and confirm every
  imported symbol is referenced in the file body. If an unused import is found,
  remove it. After completing edits to a file, re-check imports since refactoring
  may have made previously-used imports unnecessary.
  </enforcement>

- Group imports by source: external packages first, then internal modules.

  <enforcement>
  When writing or modifying imports in `src/**/*`, enforce this ordering with a
  blank line between groups:
  1. External / third-party packages (e.g., `react`, `uuid`, libraries from
     `node_modules`)
  2. Internal project modules (relative paths starting with `./` or `../`, or
     aliased paths like `@/`)

  If imports are not grouped or are interleaved, reorder them to match the
  required grouping. Do not mix external and internal imports within the same
  block.
  </enforcement>

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  <enforcement>
  When reviewing or writing error handling in `src/**/*`, verify that every
  `catch` block or error callback logs the error with enough context to diagnose
  the issue — at minimum the error object/message and the operation that failed
  (e.g., which function, which resource, which user action). Reject bare
  `console.error(err)` or empty catch blocks. If a violation is found, add
  contextual information such as the function name, relevant parameters, and the
  action being attempted.
  </enforcement>
