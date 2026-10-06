---
paths: "src/**/*"
---

# Code Quality Standards

## Naming

- Use descriptive variable names that convey purpose and meaning.

<!-- ENFORCEMENT:START - Use descriptive variable names -->
**How to verify:** When reviewing or writing code, check that every variable name clearly communicates its purpose. Reject single-letter names (except conventional loop counters like `i`, `j` in short loops), abbreviations that aren't universally understood, and generic names like `data`, `temp`, `val`, `stuff`, or `result` when a more specific name is possible.

**What to do when violated:**
1. Identify the variable with the unclear name.
2. Determine its purpose from context (what it holds, how it is used).
3. Rename it to a descriptive name that a reader unfamiliar with the code would understand (e.g., `d` -> `elapsedDays`, `arr` -> `filteredUsers`, `temp` -> `previousBalance`).
4. Update all references to the variable.
5. Verify the code still compiles and tests pass.

**Examples:**
```typescript
// BAD
const d = new Date();
const arr = users.filter(u => u.active);
let x = calcTotal(items);

// GOOD
const currentDate = new Date();
const activeUsers = users.filter(user => user.active);
let orderTotal = calcTotal(items);
```
<!-- ENFORCEMENT:END -->

- Functions should do one thing well and have a name that describes that thing.

<!-- ENFORCEMENT:START - Functions should do one thing well -->
**How to verify:** When reviewing or writing a function, check that (a) the function has a single clear responsibility, (b) the function name accurately describes that responsibility, and (c) the function body does not mix unrelated concerns (e.g., fetching data AND formatting UI AND logging analytics in one function).

**What to do when violated:**
1. Identify the distinct responsibilities inside the function.
2. Extract each responsibility into its own well-named function.
3. Have the original call site compose the extracted functions as needed.
4. Ensure each extracted function's name describes exactly what it does (e.g., `fetchUserProfile`, `formatDisplayName`, `trackPageView`).
5. Verify tests pass after refactoring.

**Examples:**
```typescript
// BAD - does multiple things
function handleUser(userId: string) {
  const user = db.query(`SELECT * FROM users WHERE id = ?`, [userId]);
  const html = `<div>${user.name}</div>`;
  analytics.track('user_viewed', { userId });
  return html;
}

// GOOD - each function does one thing
function fetchUser(userId: string): User {
  return db.query(`SELECT * FROM users WHERE id = ?`, [userId]);
}

function renderUserCard(user: User): string {
  return `<div>${user.name}</div>`;
}

function trackUserView(userId: string): void {
  analytics.track('user_viewed', { userId });
}
```
<!-- ENFORCEMENT:END -->

## Imports

- No unused imports.

<!-- ENFORCEMENT:START - No unused imports -->
**How to verify:** After writing or modifying a file, check that every `import` statement is referenced in the file's code. Run the linter (`npm run lint`) which flags unused imports. Also visually scan for imports whose symbols do not appear in the file body.

**What to do when violated:**
1. Identify the unused import(s) by checking which imported symbols are not referenced in the file.
2. Remove the entire import statement if none of its symbols are used.
3. If only some symbols from a multi-symbol import are unused, remove only the unused symbols from the import.
4. Re-run `npm run lint` and `npm run typecheck` to confirm no breakage.

**Examples:**
```typescript
// BAD - useState is never used
import { useState, useEffect } from 'react';

export function Timer() {
  useEffect(() => { /* ... */ }, []);
  return <div>Timer</div>;
}

// GOOD - only import what is used
import { useEffect } from 'react';

export function Timer() {
  useEffect(() => { /* ... */ }, []);
  return <div>Timer</div>;
}
```
<!-- ENFORCEMENT:END -->

- Group imports by source: external packages first, then internal modules.

<!-- ENFORCEMENT:START - Group imports by source -->
**How to verify:** Check that imports in every file are organized into distinct groups separated by a blank line: (1) external/third-party packages (e.g., `react`, `lodash`, `@testing-library/*`) come first, (2) internal/project modules (e.g., `./components`, `../utils`, `@/services`) come second. Within each group, imports should be in a consistent order (alphabetical preferred).

**What to do when violated:**
1. Identify which imports are external (from `node_modules`) and which are internal (relative paths or project aliases).
2. Move all external imports to the top of the import block.
3. Add a blank line separator between external and internal imports.
4. Optionally sort alphabetically within each group.
5. Verify the file still compiles.

**Examples:**
```typescript
// BAD - mixed external and internal imports
import { formatDate } from '../utils/date';
import { useState } from 'react';
import { UserCard } from './UserCard';
import axios from 'axios';

// GOOD - grouped by source with blank line separator
import axios from 'axios';
import { useState } from 'react';

import { formatDate } from '../utils/date';
import { UserCard } from './UserCard';
```
<!-- ENFORCEMENT:END -->

## Error handling

- Log errors with sufficient context to diagnose the issue in production.

<!-- ENFORCEMENT:START - Log errors with sufficient context -->
**How to verify:** When reviewing error handling code, check that every `catch` block or error log includes: (a) the original error object or message, (b) the operation that failed, and (c) relevant identifiers or parameters that help reproduce or locate the issue. Reject bare `console.error(error)` or `console.log("error")` without context.

**What to do when violated:**
1. Identify the catch block or error-logging call that lacks context.
2. Add the operation name or description (what was being attempted).
3. Include relevant identifiers (user ID, request URL, record ID, input parameters).
4. Preserve the original error (pass it as the last argument or include `error.message` and `error.stack`).
5. Use structured logging if available in the project.

**Examples:**
```typescript
// BAD - no context
try {
  await saveOrder(order);
} catch (error) {
  console.error(error);
}

// BAD - message but no identifiers or original error
try {
  await saveOrder(order);
} catch (error) {
  console.error('Failed to save');
}

// GOOD - operation, identifiers, and original error
try {
  await saveOrder(order);
} catch (error) {
  console.error(
    `Failed to save order [orderId=${order.id}, userId=${order.userId}]`,
    error
  );
}
```
<!-- ENFORCEMENT:END -->
