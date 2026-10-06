---
paths: "src/**/*"
---

# Code Quality Standards

## Naming

- Use descriptive variable names that convey purpose and meaning.

  <details>
  <summary>Enforcement</summary>

  **When to check:** Before completing any code change that introduces or modifies variables in `src/**/*`.

  **How to check:**
  - Review all new or changed variable names.
  - Flag single-letter variables (except `i`, `j`, `k` in short loops, or `e` for event handlers).
  - Flag generic names like `data`, `temp`, `val`, `result`, `info`, `item` when a more specific name exists.
  - Flag abbreviations that are not universally understood (e.g., `btn` instead of `button`, `msg` instead of `message`).

  **What to do if violated:**
  - Rename the variable to describe its purpose (e.g., `d` -> `fetchedBooks`, `temp` -> `filteredByStatus`).
  - Do not proceed until all variable names convey their purpose clearly.

  </details>

- Functions should do one thing well and have a name that describes that thing.

  <details>
  <summary>Enforcement</summary>

  **When to check:** Before completing any code change that introduces or modifies functions in `src/**/*`.

  **How to check:**
  - Review each new or changed function.
  - Check if the function body contains multiple unrelated responsibilities (e.g., fetching data AND formatting output AND updating state).
  - Check if the function name accurately describes what the function does.
  - Flag functions longer than ~30 lines as candidates for splitting.
  - Flag functions with names like `handleStuff`, `doWork`, `processData` that don't describe a specific action.

  **What to do if violated:**
  - Extract each responsibility into its own well-named function.
  - Rename the function to match its single responsibility (e.g., `handleStuff` -> `updateBookStatus`).
  - Do not proceed until each function does one thing and its name reflects that thing.

  </details>

## Imports

- No unused imports.

  <details>
  <summary>Enforcement</summary>

  **When to check:** Before completing any code change in `src/**/*`.

  **How to check:**
  - Review all import statements in changed files.
  - For each imported symbol, verify it is actually referenced in the file body.
  - Check for default imports that are not used.
  - Check for namespace imports (`import * as X`) where `X` is never referenced.

  **What to do if violated:**
  - Remove every import that is not referenced in the file.
  - Do not proceed until all imports in the changed files are actively used.

  </details>

- Group imports by source: external packages first, then internal modules.

  <details>
  <summary>Enforcement</summary>

  **When to check:** Before completing any code change in `src/**/*` that adds or modifies import statements.

  **How to check:**
  - Verify import statements are ordered in two groups separated by a blank line:
    1. **External packages** (e.g., `react`, `vitest`, any `node_modules` dependency) — listed first.
    2. **Internal modules** (e.g., `./components/Card`, `../utils/format`, any path starting with `.` or `src/`) — listed second.
  - Flag any internal import that appears before an external import without a blank-line separator.
  - Flag missing blank line between the two groups.

  **What to do if violated:**
  - Reorder imports so all external packages come first, followed by a blank line, then all internal modules.
  - Do not proceed until import grouping matches the required order.

  </details>

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

  <details>
  <summary>Enforcement</summary>

  **When to check:** Before completing any code change in `src/**/*` that adds or modifies error handling (try/catch, `.catch()`, error callbacks).

  **How to check:**
  - Review every `catch` block and error handler in changed files.
  - Verify each error log includes: (1) what operation failed, (2) relevant identifiers or input values, and (3) the original error object or message.
  - Flag bare `console.error(err)` or `console.log(error)` without contextual information.
  - Flag empty catch blocks or catch blocks that swallow errors silently.
  - Flag error logs that only include a static string with no dynamic context.

  **What to do if violated:**
  - Add context to every error log, e.g., `console.error('Failed to fetch book details', { bookId, error })`.
  - Never swallow errors silently — at minimum, log with context.
  - Do not proceed until every error handler logs enough context to diagnose the failure without access to the running application.

  </details>
