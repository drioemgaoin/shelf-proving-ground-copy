# Legacy Scenarios Archive

Scenarios from the gen-only testing phase (rounds 1-18). These tested codemap-gen.py
robustness and budget compliance. They did NOT run codemap-verify.py with ticket text.

Preserved for reference — each scenario documents why a mechanism in codemap-gen.py exists.

## Shelf scenarios (7 files, TS/React)

| # | Ticket idea | Scope | Ticket text | Tests what | Tokens | Pass |
|---|-------------|-------|-------------|-----------|-------:|:----:|
| T33 | New reading status | `src/**` | Add a new reading status 'Abandoned' to the book card status badge. Update the status type, the badge color mapping, and the filter chips to include the new status. | Full app scope | 487 | Yes |
| S1 | Fix API timeout | `src/api.ts` | Fix the API fetch timeout in api.ts — the AbortController signal is not being passed to the fetch call, causing requests to hang indefinitely. | Single file + auto-expand + heuristic symbol | 501 | Yes |
| S2 | Add fixture tests | `src/**` + `--include-tests` | Add unit tests for the fixture system. Each fixture mode (empty, error, slow, long, many) should have a test that verifies the returned data shape matches expectations. | Test inclusion flag | 591 | Yes |
| S3 | Dark mode tokens | `src/styles/**` | Add dark mode CSS custom properties to tokens.css. Every color token should have a corresponding dark-mode override inside a prefers-color-scheme media query. | CSS-only scope | 502 | Yes |
| S4 | Loading state styling | `src/api.ts,src/styles/**` | Add loading state styling to the API layer. When fetch is in progress, emit a CSS class that triggers a skeleton animation defined in tokens.css. | Multi-scope (file + dir) | 952 | Yes |
| S5 | New BookCard component | `src/components/**` | Create a new BookCard component in src/components/BookCard.tsx that displays title, author, and status badge. Import the Book type from api.ts. | Greenfield (0 files) + create ticket | 74 | Yes |
| S6 | Accessibility audit | `""` | Audit the entire codebase for accessibility issues. Check all interactive elements have aria labels. | Empty string scope | 71 | Yes |
| S7 | Refactor getBooks | `src/**` | Refactor the `getBooks` function in api.ts to use async/await instead of .then() chains. Ensure all callers in App.tsx are updated. | Backtick symbol check | 487 | Yes |
| S8 | Add fixture mode | `src/fixtures.ts` | Add a new fixture mode 'offline' that simulates a network error by rejecting the fetch promise with a TypeError. | Single file + "fixture" false positive | 502 | Yes |
| S9 | Error boundary | `src/**,src/**` | Add error boundary around the main App component to catch rendering errors and show a fallback UI. | Duplicate scope dedup | 487 | Yes |
| S10 | Responsive grid | `/src/**` | Add responsive breakpoints to the shelf grid layout. The grid should go from 1 column on mobile to 4 columns on desktop. | Leading slash normalization | 487 | Yes |
| S11 | Tiny budget | `src/**` `--budget 100` | Minimize the app footprint. | Budget floor guard | 83 | Yes |
| S12 | Nonexistent repo root | `src/**` `--repo-root /tmp/nope` | N/A | Repo root validation | exit 1 | Yes |
| S13 | Test file without flag | `src/App.test.tsx` | The App component should render a heading with the text 'My Shelf' on initial load. | Test file excluded by default | 503 | Yes |
| S14 | Wildcard *.ts | `src/*.ts` | Extract all TypeScript-only modules (api.ts, fixtures.ts) into a shared lib/ directory and update imports. | Wildcard mid-path glob | 500 | Yes |
| S15 | Overlapping file+dir | `src/api.ts,src/**` | Add a `deleteBook` export to api.ts and wire it to a delete button in the App component. | Subset dedup | 487 | Yes |
| S16 | E2E scope with tests | `e2e/**` `--include-tests` | Add a Playwright test that verifies the empty state shows a CTA button when fixture=empty is set. | Non-src dir + test flag | 1,010 | Yes |
| S17 | Two specific files | `src/main.tsx,src/App.tsx` | Add React StrictMode wrapper in main.tsx around the App component. | Multi-file scope | 952 | Yes |
| S18 | Huge budget tiny repo | `src/**` `--budget 1000000` | Refactor the entire src directory to use a barrel export pattern with an index.ts at the root. | Oversized budget | 487 | Yes |
| S19 | Cross-dir with tests | `src/App.tsx,e2e/**` `--include-tests` | Add a Playwright test for the book card click-to-open-drawer interaction. | Cross-dir multi-scope + tests | 1,563 | Yes |
| S20 | Retry logic | `src/api.ts` | Add retry logic with exponential backoff to the `getBooks` API call. Max 3 retries. | Backtick symbol in narrow scope | 501 | Yes |
| S21 | Codemap tool itself | `codemap-tool/**` | Add a --format json flag to codemap-gen.py that outputs JSON instead of markdown. | Self-referential scope (Python) | 2,567 | Yes |
| S22 | Root glob *.tsx | `*.tsx,*.ts` | Add TypeScript strict mode. Fix type errors in root-level .ts and .tsx files. | Root-only glob, no recursion | 204 | Yes |
| S23 | Triple scope + tests | `src/**,e2e/**,codemap-tool/**` `--include-tests` | Add a CI pipeline that runs unit tests, e2e tests, and codemap verification. | 3-scope proportional + tests | 4,057 | Yes |
| S24 | Low budget | `src/**` `--budget 5000` | Add a search bar above the shelf grid that filters books by title in real-time. | L1 only at budget 5K | 83 | Yes |
| S25 | React.lazy import | `src/main.tsx` | Add a React.lazy wrapper around the App import in main.tsx with a Suspense fallback. | Single entry-point file | 501 | Yes |
| S26 | Single CSS file | `src/styles/tokens.css` | Add spacing tokens (--space-xs through --space-xl) to the design token file. | Narrow CSS scope + auto-expand | 107 | Yes |
| S27 | All nonexistent | `nonexistent/**,also-fake/**` | Create a new plugin system in the nonexistent directory. | Multi-scope all empty | 99 | Yes |
| S28 | Full budget | `src/**` `--budget 45000` | Add keyboard navigation: arrow keys between cards, Enter to open drawer, Escape to close. | Max budget on small repo | 487 | Yes |
| S29 | E2E support dir | `e2e/support/**` `--include-tests` | Add a custom Playwright assertion helper for accessible role attributes. | Sub-dir with tests flag | 1,025 | Yes |
| S30 | 3 specific files | `src/fixtures.ts,src/api.ts,src/App.tsx` | Add `updateBookStatus` to api.ts, wire to App, use `Status` type. | Multi-file + backtick symbols | 1,397 | Yes |
| S31 | Cross-purpose dirs | `src/**,codemap-tool/**` | Add a pre-commit hook running codemap-gen.py on changed files. | TS + Python cross-scope | 3,002 | Yes |
| S32 | Entire repo | `**` | Upgrade from Vite 5 to Vite 6. Fix breaking changes in all config files. | Full repo scope | 39,831 | Yes |
| S33 | Two data files | `src/api.ts,src/fixtures.ts` | Add `Behavior` type to fixtures.ts, use in `initApi`. | Symbol check across files | 953 | Yes |
| S34 | Mid budget | `src/**` `--budget 10000` | Split monolithic App.tsx into ShelfGrid, BookCard, and FilterBar components. | Heuristic CamelCase misses (ok) | 487 | Yes |
| S35 | E2E without tests flag | `e2e/**` | Add page object models for shelf page and drawer component. | Test dir without --include-tests | 650 | Yes |
| S36 | Cross-dir + LLM | `src/**,e2e/**` `--include-tests` | Add drag-and-drop reorder to shelf grid with order persisting in API layer. | LLM gap check (SUFFICIENT) | 1,547 | Yes |

## Grafana scenarios (16,375 files, Go + TS)

| # | Ticket idea | Scope | Tests what | Tokens | Pass |
|---|-------------|-------|-----------|-------:|:----:|
| T1 | Fix ACL permission bypass | `pkg/services/accesscontrol/**` | Large Go package truncation | 43,109 | Yes |
| T2 | Add timezone to dashboard settings | `public/app/features/dashboard/**` | 244-file TS dir, priority ordering | 42,788 | Yes |
| T3 | New annotation API + frontend | 2 scopes: backend + frontend | Balanced cross-stack allocation | 17,781 | Yes |
| T4 | Refactor plugin loading | 3 scopes: Go + TS + runtime | 3-way unbalanced allocation | 42,026 | Yes |
| T5 | Add GraphQL (greenfield) | `pkg/api/graphql/**` (0 files) | Empty scope, L1 still navigable | 3,153 | Yes |
| T6 | Fix health check endpoint | `pkg/api/health*.go` (1 file) | File glob auto-expand | 42,966 | Yes |
| T7 | Fix BarGauge thresholds | `components/BarGauge/**` (4 files) | Dir expand into huge parent (629 siblings) | 41,770 | Yes |
| T8 | Fix flaky auth tests | `authnimpl/**` + `--include-tests` | Test file inclusion toggle | 17,017 | Yes |
| T9 | Standardize error handling | `pkg/services/*/service.go` | Wildcard-in-middle glob | 13,870 | Yes |
| T10 | Wire alerting API to UI | 500 files + 1 file | Very unequal multi-scope | 8,898 | Yes |
| T11 | Valid + nonexistent scope | `annotations/** + nonexistent/**` | Graceful degradation | 14,816 | Yes |
| T12 | Work in codegen-heavy dir | `v0alpha1/**` (32 `_gen.go`) | Generated code filtering | 4,203 | Yes |
| T13 | Backend + frontend (2 big) | `accesscontrol/** + alerting/**` | Cross-language (Go + TS) | 43,035 | Yes |
| T14 | Deep nesting (7 levels) | `rule-editor/**` | Deep path handling | 28,278 | Yes |
| T15 | Hyphens in path | `panel-canvas/**` | Special characters | 24,363 | Yes |
| T16 | Entire repo as scope | `**` | Adversarial max scope | 42,146 | Yes |
| T17 | Overlapping scopes | `services/** + services/accesscontrol/**` | Subset deduplication | 42,565 | Yes |
| T18 | Monster codegen file dir | `v2beta1/**` (8K-line zz_generated) | Large generated file filter | 15,499 | Yes |
| T19 | Config files only | `*.json,*.yaml,*.toml` | Noise file filtering | 3,849 | Yes |
| T20 | Same as T8 without tests | `authnimpl/**` (no flag) | Test exclusion baseline | 10,679 | Yes |
| T21 | Empty string scope | `""` | Crash protection | 3,150 | Yes |
| T22 | Trailing comma | `annotations/**,` | Input sanitization | 14,784 | Yes |
| T23 | 10 scope segments | 10 service packages | Floor allocation at scale | 40,644 | Yes |
| T24 | Single test file, no flag | `Foo.test.tsx` | Auto-expand test file leak | 3,665 | Yes |
| T25 | Nonexistent absolute path | `/nonexistent/**` | Bad input handling | 3,153 | Yes |
| T28 | CSS/SCSS only | `public/sass/**` | Non-code source files | 32,532 | Yes |
| T29 | All files in ignore list | `migrations/**` | Fully-filtered scope | 3,153 | Yes |
| T30 | Exact duplicate scopes | `annotations/**,annotations/**` | Duplicate dedup | 14,784 | Yes |
| T31 | Spaces around commas | `"foo** , bar**"` | Whitespace handling | 36,851 | Yes |
| T32 | Empty repo | `src/**` on empty git repo | Zero-file edge case | 9 | Yes |
| T33 | Shelf (actual target) | `src/**` | Smoke test on real project | 478 | Yes |
| T41 | Concurrent execution | 2 processes, different scopes | Race condition on temp files | 42,564 | Yes |
| T42 | generated/ directory | K8s codegen dir | Generated dir filtering | 37,941 | Yes |
| T46 | Tiny budget (100 tokens) | `--budget 100` | Negative L2 budget guard | 3,163 | Yes |
| T50 | Glob negation `!(...)` | `pkg/services/!(accesscontrol)/**` | Unsupported glob graceful | 3,153 | Yes |
| T51 | 50+ scope segments | 50 service dirs | Many-segment handling | 42,000 | Yes |
| T54 | Binary/image files | `public/img/**` | Binary-heavy dir | 10,345 | Yes |
| T55 | `**` in middle of glob | `pkg/**/api.go` | Mid-path wildcard | 22,000 | Yes |
| T57 | Huge single file (go.sum) | `go.sum` | Non-source file scope | 3,153 | Yes |
| T60 | 500 individual file paths | Many comma-separated .go files | Performance / segment merge | 34,421 | Yes |
| T65 | Read-only output dir | `chmod 444` dir | PermissionError handling | exit 1 | Yes |
| T66 | Leading/trailing slashes | `/pkg/api/**`, `pkg/api/**/` | Slash normalization | 42,949 | Yes |
| T70 | Backslash paths | `pkg\api\**` | Windows path handling | 3,153 | Yes |
| T71 | Dot scope | `.` | Minimal scope | 42,146 | Yes |
| T72 | Newline injection | `pkg/api/**\npkg/services/**` | Input safety | 3,153 | Yes |
| T73 | Output to /dev/null | `-o /dev/null` | Unusual output target | 42,949 | Yes |
| T74 | Nonexistent repo root | `--repo-root /tmp/nope` | Repo validation | exit 1 | Yes |
| T75 | Pipe in scope | `pkg/api/**\|rm -rf /` | Shell injection protection | 42,412 | Yes |
| T76 | Single char scope | `p` | Minimal valid scope | 3,153 | Yes |
| T80 | `**` + `--include-tests` | Full repo with tests | Combined flags | 42,256 | Yes |
| T82 | Budget = 0 | `--budget 0` | Zero budget | 3,163 | Yes |
| T83 | Brace expansion `{a,b}` | `pkg/services/{a,b}/**` | Unsupported glob | 3,153 | Yes |
| T84 | Deeply nested output path | `-o /tmp/a/b/c/.../codemap.md` | Dir auto-creation | 42,949 | Yes |
| T85 | Scope to one huge file | Largest non-test .go file | Auto-expand from single file | 34,000 | Yes |
| T86 | Negative budget | `--budget -100` | Negative budget | 3,263 | Yes |
| T87 | Overwrite existing file | Pre-existing output file | File overwrite | 42,949 | Yes |
| T90 | Two narrow auto-expand scopes | `health*.go,login*.go` | Double auto-expand | varies | Yes |
| T91 | All scopes nonexistent | `foo/**,bar/**,baz/**` | All-empty multi-scope | 3,153 | Yes |
| T93 | Huge budget (1M) | `--budget 1000000` | Oversized budget | 77,572 | Yes |
| T94 | Hidden dir scope | `.github/**` | Dotfile directories | varies | Yes |
| T97 | Null byte in scope | `pkg/api/\x00**` | Null byte safety | rejected | Yes |

## Django scenarios (2,926 files, Python)

| # | Scope | Tokens | Pass |
|---|-------|-------:|:----:|
| T26 | `django/db/models/**` | 43,257 | Yes |

## Home Assistant scenarios (19,003 files, Python)

| # | Ticket idea | Scope | Tokens | Pass |
|---|-------------|-------|-------:|:----:|
| HA-T1 | Single integration | `homeassistant/components/zwave_js/**` | 38,435 | Yes |
| HA-T2 | Core module (dir) | `homeassistant/core/**` | ~20K (empty, correct) | Yes |
| HA-T2b | Core module (file) | `homeassistant/core.py` (auto-expanded) | 39,775 | Yes |
| HA-T3 | Cross-module 2 scopes | `mqtt/** + helpers/**` | 36,295 | Yes |
| HA-T4 | 3 integration scopes | `zwave_js + zha + matter` | 39,387 | Yes |
| HA-T5 | Greenfield integration | `homeassistant/components/newdevice/**` | ~20K (empty, correct) | Yes |
| HA-T6 | Narrow file | `homeassistant/core.py` | 39,775 | Yes |
| HA-T7 | Test ticket | `tests/components/mqtt/**` + `--include-tests` | 21,266 | Yes |
| HA-T8 | Entire repo | `**` | 39,872 | Yes |
| HA-T9 | Biggest component | `homeassistant/components/mqtt/**` | 34,713 | Yes |
| HA-T10 | Root config files | `*.py,*.cfg,*.toml` | 4,053 | Yes |
| HA-T11 | Overlapping scopes | `homeassistant/** + mqtt/**` | 39,755 | Yes |
| HA-T12 | Empty scope | `""` | ~20K (L1 only, correct) | Yes |
| HA-T13 | Leading slash | `/homeassistant/components/mqtt/**` | 34,713 | Yes |
| HA-T14 | Concurrent 2 processes | zwave_js + mqtt simultaneous | no leaks | Yes |
| HA-T20 | 10 small integrations | 10 component scopes | 42,000 | Yes |
| HA-T21 | `__init__.py` priority | `mqtt/**` | __init__.py first | Yes |
| HA-T22 | manifest.json scope | `*/manifest.json` | 345 files | Yes |
| HA-T23 | Tests without flag | `tests/components/mqtt/**` | 47 files (scope forces include) | Yes |
| HA-T24 | Source + test cross-scope | `mqtt/** + tests/mqtt/**` + flag | both present | Yes |
| HA-T25 | conftest.py auto-expand | `tests/conftest.py` | expanded to tests/** | Yes |
| HA-T30 | Script directory | `script/**` | 149 files | Yes |
| HA-T31 | Nonexistent repo root | `--repo-root /tmp/nope` | clean error, exit 1 | Yes |
| HA-T32 | Budget = 5000 | `--budget 5000` | L1 only, 0 L2 files | Yes |
| HA-T33 | Duplicate scope | `mqtt/**,mqtt/**` | deduplicated to 46 files | Yes |
| HA-T34 | Concurrent 3 processes | 3 different components | 0 leaks | Yes |
| HA-T35 | Component with underscores | `homeassistant/components/zone/**` | 12 files | Yes |

## Legacy iteration history

| Round | Repo | New scenarios | Bugs found | Clean streak |
|-------|------|---------------|------------|:------------:|
| 1 | Grafana | T1-T11 (11) | 3 | reset |
| 2 | Grafana | T12-T19 (8) | 3 | reset |
| 3 | Grafana | T20-T33 (14) | 2 | reset |
| 4 | Grafana | T41-T49 (verify fixes + new) | 3 | reset |
| 5 | Grafana | T50-T57 (8) | 3 | reset |
| 6 | Grafana | T60-T76 (verify + new, 12) | 1 | reset |
| 7 | Grafana | T80-T85 (6) | 0 | **1/3** |
| 8 | Grafana | T86-T91 (6) | 0 | **2/3** |
| 9 | Grafana | T92-T97 (6) | 0 | **3/3 on Grafana** |
| 10 | Home Assistant | HA-T1 to HA-T14 (15) | 0 | **1/3** |
| 11 | Home Assistant | HA-T20 to HA-T25 (6) | 0 | **2/3** |
| 12 | Home Assistant | HA-T30 to HA-T35 (6) | 0 | **3/3 on Home Assistant** |
| 13 | Shelf | T33+S1-S6 (7, re-validate) | 2 (verify script) | reset |
| 14 | Shelf | S7-S12 (6) | 1 (test_patterns) | reset |
| 15 | Shelf | S13-S18 (6) + LLM fixes | 3 (LLM tier) | reset |
| 16 | Shelf | S19-S24 (6) | 0 | **1/3** |
| 17 | Shelf | S25-S30 (6) | 0 | **2/3** |
| 18 | Shelf | S31-S36 (6) | 0 | **3/3 on Shelf** |
