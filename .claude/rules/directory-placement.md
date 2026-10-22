---
paths: "**/*"
---

# Directory placement

Every source file lives in exactly one declared module type, and every import follows a declared dependency direction. The module vocabulary in CLAUDE.md is the single source of truth for where code lives and what it may depend on. If a file doesn't match the vocabulary, it's misplaced. If an import crosses a boundary the vocabulary doesn't allow, it's a violation.

## Rules

- Every file matches exactly one declared module type. A file matching zero patterns is misplaced. A file matching two or more patterns is ambiguous — tighten the vocabulary until each file has one match.

  CORRECT: `src/api.ts` — matches `api` (one match)
  WRONG: `src/helpers/format.ts` — matches no declared module type (orphan file)
  WRONG: `src/api.test.ts` — matches both `api` and `test` (ambiguous; fix by ordering `test` first so test files match before source types)

  ```enforcement
  id: "placement-file-in-declared-module"
  tier: T3
  agent: reviewer
  scope: "**/*.{ts,tsx,js,jsx,css}"
  group: architecture
  triage_hint: "Flag when: new file added, file moved, file renamed, new directory created under src/"
  instruction: "Read the module vocabulary table in .claude/rules/directory-placement.md. Expand {root} using the declared scope template. For every file in the diff, check that it matches exactly one module type pattern. A violation is: (1) a file matching zero patterns — orphan file outside the declared architecture, or (2) a file matching two or more patterns — ambiguous placement, tighten the vocabulary. For test files (*.test.*), the test type takes priority over any source type — this is not ambiguous. Correct: every file matches exactly one row in the vocabulary table."
  ```

  > **Agent:** `reviewer` — the violation requires expanding vocabulary patterns against file paths; not detectable by regex alone.

- Imports follow the allowed dependency direction declared in the vocabulary table. A file in module type A may only import from module types listed in A's "May import from" column.

  CORRECT (component importing api):
  `import { getBooks } from '../api';` — component → api ✓

  WRONG (api importing component):
  `import { BookCard } from './components/BookCard';` — api → component ✗ (api may only import from: type)

  CORRECT (component importing component — self-reference allowed):
  `import { Badge } from './Badge';` — component → component ✓

  WRONG (type importing anything):
  `import { getBooks } from '../api';` — type → api ✗ (type may not import from any module)

  ```enforcement
  id: "placement-import-direction"
  tier: T1
  - pattern: "^\\s*(import|export)\\b.*\\bfrom\\s+['\"].*/(components|hooks|pages|views)/"
    assert: absent
    scope: "src/**/types/**/*.{ts,tsx}"
    strip: comments
    fix: "Type modules are leaf nodes — they must not import from components, hooks, pages, or views. Move shared types to the type module and import from there."
  - pattern: "^\\s*(import|export)\\b.*\\bfrom\\s+['\"].*/(components|hooks|pages|views)/"
    assert: absent
    scope: "src/**/domain/**/*.{ts,tsx}"
    strip: comments
    fix: "Domain modules must not import from UI modules (components, hooks, pages, views). Domain is the innermost layer — it depends on nothing outside itself."
  ---
  id: "placement-import-direction"
  tier: T3
  agent: reviewer
  scope: "**/*.{ts,tsx,js,jsx}"
  group: architecture
  triage_hint: "Flag when: new import added, import path changed, file moved between module types"
  instruction: "Read the module vocabulary table in .claude/rules/directory-placement.md. Expand {root} using the declared scope template. For every import statement in the diff: (1) determine the importing file's module type from the vocabulary, (2) determine the imported file's module type, (3) check that the imported type appears in the 'May import from' column for the importing type. Peer isolation: if a module type does NOT list itself in 'May import from', two instances of that type in different scope instances cannot import each other. Qualified references: 'shared/util' means only the util module type under the shared scope is allowed, not util from a peer scope. Entry-point types (May import from: *) are unconstrained. Test types (May import from: *) are unconstrained. A violation is any import whose target module type is not in the allowed list. Correct: every import follows the dependency direction declared in the vocabulary table."
  ```

  > **Agent:** `reviewer` for T3 — full dependency direction validation requires reading the vocabulary table and resolving module types for both source and target of every import. T1 catches the universal invariants (types and domain never import UI) that hold across all project shapes.
