---
paths: src/**/*
---

# Composable blocks architecture

Build software like shopping in a supermarket: each module is one item off the shelf — single-purpose, swappable, composable. Walk the aisles, pick what you need, drop it in the trolley. If an item goes bad, replace just that item without repacking the trolley.

## Module boundaries

- Imports stay shallow. Three or more levels of `../` means coupling across module boundaries — import through a barrel file (`index.ts`) or path alias instead.

  CORRECT: `import { Book } from '../types';`
  WRONG: `import { Book } from '../../../api/types/Book';`

  ```enforcement
  id: "no-deep-imports"
  tier: T1
  - pattern: "^\\s*(import|export)\\b.*\\bfrom\\s+['\"](\\.\\./){3,}"
    assert: absent
    scope: "src/**/*.{ts,tsx,js,jsx}"
    strip: comments
    fix: "Import through a barrel file (index.ts) closer to this module. 3+ levels of ../ crosses module boundaries — restructure or use a path alias."
  - pattern: "^\\s*import\\s+['\"](\\.\\./){3,}"
    assert: absent
    scope: "src/**/*.{ts,tsx,js,jsx}"
    strip: comments
    fix: "Side-effect import from 3+ levels deep crosses module boundaries. Move the imported file closer or use a path alias."
  - pattern: "\\brequire\\s*\\(\\s*['\"`](\\.\\./){3,}"
    assert: absent
    scope: "src/**/*.{ts,tsx,js,jsx}"
    strip: comments
    fix: "Require through a barrel file closer to this module."
  - pattern: "\\bimport\\s*\\(\\s*['\"`](\\.\\./){3,}"
    assert: absent
    scope: "src/**/*.{ts,tsx,js,jsx}"
    strip: comments
    fix: "Dynamic import through a barrel file closer to this module."
  ---
  id: "no-deep-imports"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx,js,jsx}"
  group: architecture
  triage_hint: "Flag when: new import added, file moved, module restructured, deep relative path"
  instruction: "Check that every import crosses at most one module boundary and goes through a barrel file (index.ts). A violation is any import that reaches into another module's internal files (bypassing the barrel) or traverses more than two directory levels. Correct: imports use barrel files or path aliases, never deep relative paths into other modules' internals."
  ```

  > **Agent:** `reviewer` for T3 — barrel file discipline and module boundary awareness require understanding project structure beyond what regex can detect.

  **Evidence:** eslint-plugin-import [`no-relative-parent-imports`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-relative-parent-imports.md) — prevents implicit coupling across directory hierarchies. dependency-cruiser [`no-deep-import-across-package`](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) — enforces consumers reach packages only through declared entry points. "Faster Code, Deeper Debt?" (Ehsani et al., 2026, ACM TOSEM) — LLMs produce 4x code clones by copying deep paths instead of abstracting through contracts.

## I/O isolation

- Components perform no I/O. All external calls (HTTP, storage, browser APIs) live in adapter modules. Components call adapters, never raw I/O APIs.

  CORRECT:
  ```tsx
  import { fetchBooks } from '../../api/books';
  const books = await fetchBooks();
  ```

  WRONG:
  ```tsx
  const res = await fetch('/api/books');
  const books = await res.json();
  ```

  ```enforcement
  id: "no-io-in-components"
  tier: T1
  - pattern: "\\bfetch\\s*\\("
    assert: absent
    scope: "src/components/**/*.{ts,tsx}"
    strip: comments
    fix: "Move fetch() to an API adapter (e.g. src/api/) and call the adapter from the component. Components must not perform I/O directly."
  - pattern: "\\b(localStorage|sessionStorage)\\b"
    assert: absent
    scope: "src/components/**/*.{ts,tsx}"
    strip: comments
    fix: "Move storage access to a storage adapter and inject it. Components must not access browser storage directly."
  - pattern: "\\bnew\\s+(XMLHttpRequest|WebSocket|EventSource)\\b"
    assert: absent
    scope: "src/components/**/*.{ts,tsx}"
    strip: comments
    fix: "Move I/O constructors to an adapter module. Components must not create I/O connections directly."
  ---
  id: "no-io-in-components"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: HTTP call, storage access, WebSocket, navigator API, document.cookie, IndexedDB, timer with side effects"
  instruction: "Check that components contain zero direct I/O calls — fetch, XMLHttpRequest, localStorage, sessionStorage, navigator.clipboard, navigator.geolocation, document.cookie, IndexedDB. All I/O goes through adapter modules (src/api/, src/adapters/, src/services/). A violation is any component directly calling a browser or network API. Correct: components receive data through hooks or props that internally delegate to adapters."
  ```

  > **Agent:** `reviewer` for T3 — catches I/O APIs beyond the T1 regex set (navigator, document.cookie, IndexedDB) and verifies the adapter pattern is correctly followed.

  **Evidence:** Hexagonal architecture (Cockburn, 2005) — isolating business logic from I/O enables unit testing in complete isolation. "Quality Assurance of LLM-generated Code" (2025) — LLMs generate code with poor modularity; direct I/O in components is the most common structural debt in LLM-generated React code.

## Configuration injection

- Environment variables are read in one place. Source modules receive configuration through injection (props, hooks, arguments), not by reading `process.env` or `import.meta.env` directly.

  CORRECT:
  ```ts
  // src/config.ts — the ONE place that reads env
  export const config = { apiUrl: import.meta.env.VITE_API_URL ?? '/api' };

  // src/api/books.ts — receives config via import
  import { config } from '../config';
  export const fetchBooks = () => fetch(`${config.apiUrl}/books`);
  ```

  WRONG:
  ```ts
  // src/api/books.ts — reads env directly
  export const fetchBooks = () => fetch(`${import.meta.env.VITE_API_URL}/books`);
  ```

  ```enforcement
  id: "no-scattered-env"
  tier: T1
  - pattern: "\\bprocess\\.env\\."
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    exclude: "src/config*,src/env*,src/vite-env*"
    strip: comments+strings
    fix: "Read environment variables in a config module (e.g. src/config.ts) and import the config object. Source modules must not access process.env directly."
  - pattern: "\\bimport\\.meta\\.env\\."
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    exclude: "src/config*,src/env*,src/vite-env*"
    strip: comments+strings
    fix: "Read environment variables in a config module (e.g. src/config.ts) and import the config object. Source modules must not access import.meta.env directly."
  ---
  id: "no-scattered-env"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: process.env, import.meta.env, hardcoded URL, magic timeout, feature flag string literal"
  instruction: "Check that all environment variable access is centralized in config modules (src/config.ts, src/env.ts, or equivalent). A violation is any source file outside the config layer reading process.env, import.meta.env, or equivalent directly. Also flag hardcoded configuration values (API URLs, timeouts, feature flag strings) that should come from config. Correct: one config module reads all env vars; other modules import typed config from it."
  ```

  > **Agent:** `reviewer` for T3 — catches hardcoded configuration values beyond env vars (magic URLs, timeouts, feature flag strings) and verifies the config module pattern.

  **Evidence:** 12-factor app principle #3 (Heroku, 2011) — strict separation of config from code. Scattered env access makes it impossible to know what configuration an app needs without reading all source files. Practitioner analysis: env vars are global, mutable, schema-less — centralizing in a typed config module makes misconfiguration fail at startup, not at runtime.

## Single responsibility

- Every module, function, or component owns one capability. If you cannot name what it does in four words or fewer, split it.

  ```enforcement
  id: "single-responsibility"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: new module/file/component added, function > 50 lines, file > 300 lines, component with multiple useEffect, mixed data fetching and rendering"
  instruction: "Check that each module owns exactly one capability. Signs of violation: (1) a component that fetches data AND renders complex UI AND manages form state — split into container + presentational, (2) a function over 50 lines doing multiple unrelated things — extract sub-functions, (3) a file exporting multiple unrelated classes or components — split into separate files, (4) a module mixing I/O with business logic — separate into adapter + domain. Correct: each file has one clear purpose nameable in 4 words or fewer."
  ```

  **Evidence:** Hatton (1997) — components that fit human working memory have lowest defect density (U-shaped curve: both very small and very large have higher fault rates). Cyclomatic complexity studies show fault-proneness rising from 0.28 at complexity 11 to 0.98 at complexity 74. "Faster Code, Deeper Debt?" (2026) — LLMs amplify code and design debt by generating fast but monolithic modules.

## Swappability

- Replacement modules satisfy the same contract. Swapping is a one-line wiring change, not a cascade of edits across consumers.

  ```enforcement
  id: "swap-readiness"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: new adapter/service/provider added, interface changed, concrete class imported by consumers, dependency introduced"
  instruction: "For each module that could have alternative implementations (API adapters, storage adapters, auth providers, feature flags), check that: (1) the module implements a typed contract (interface or type alias), (2) consumers import the contract type not the concrete module, (3) swapping to a different implementation requires changing only the wiring point (composition root, provider, factory). A violation is a consumer importing and using a concrete implementation directly without a contract. Correct: adapters implement interfaces, consumers depend on interfaces, wiring happens in one place."
  ```

  **Evidence:** Hexagonal architecture ports-and-adapters (Cockburn, 2005). Nx [`enforce-module-boundaries`](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries) — undocumented implicit dependencies accumulate until refactoring becomes dangerous. eslint-plugin-boundaries funnels public API decisions into barrel files.

## Independent testability

- Every module is testable in isolation by stubbing its contract dependencies. If a module needs an integration test to verify its own logic, it has hidden coupling.

  ```enforcement
  id: "independent-testability"
  tier: T3
  agent: reviewer
  scope: "src/**/*.{ts,tsx}"
  group: architecture
  triage_hint: "Flag when: new module without test, test importing many concrete modules, test needing complex setup, mock of internal implementation"
  instruction: "Check that each module can be tested by stubbing only its declared dependencies (constructor args, props, injected hooks). A violation is: (1) a test that must import and wire multiple concrete modules to test one unit — hidden coupling, (2) a module with no test at all — untestable code is a coupling smell, (3) a test that mocks internal implementation details rather than contract boundaries. Correct: each module's test creates stubs for its contract dependencies and tests behavior through the public API."
  ```
