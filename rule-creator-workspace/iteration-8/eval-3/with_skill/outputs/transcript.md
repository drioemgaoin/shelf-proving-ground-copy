# Transcript: Batch Enforcement for frontend-standards.md

## Discovery

Rules file found: `.claude/rules/frontend-standards.md` (scoped to `src/**/*`).
No other rules files in scope for this eval.

Existing enforcement blocks: 0
Existing T3 count: 0
Existing scopeless T3: 0
Existing critical T3: 0

Total rules identified: 15 across 5 sections (Code Style: 3, CSS: 3, Accessibility: 3, Performance: 3, Architecture: 3).

---

## Group 1 of 5: Code Style (Rules 1-3)

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 1 | No `as any` type assertions | T1 | `as any` is a literal string pattern. Regex `\bas\s+any\b` catches every violation without context. Pure syntactic signature. |
| 2 | No `export default` | T1 | `export default` is a literal keyword pair. Regex `\bexport\s+default\b` catches it deterministically. No intent judgment needed. |
| 3 | No nested ternary expressions | T1 | A nested ternary has a syntactic signature: a `?` inside another `?:` expression. A regex or AST walker can detect this pattern. |

**Sorting test detail:**
- All three rules have syntactic signatures that are always violations regardless of context.
- Step 1 answer is "Yes" for all three. No need to continue down the tree.

**Classification confirmed: all T1.**

---

## Group 2 of 5: CSS (Rules 4-6)

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 4 | All values from design tokens, no hardcoded px/rem/hex/rgb | T1 | Raw values (`#abc123`, `16px`, `2rem`, `rgb()`) are syntactic patterns. A regex or stylelint rule catches them in component CSS files. Matches the worked example in references. |
| 5 | Animations use only transform and opacity | T1 | This is the exact "tricky" example from worked-examples.md. Looks visual but is actually syntactic -- check which CSS properties appear in `transition:` and `@keyframes` declarations. A stylelint rule or regex handles this. |
| 6 | Never set a raw z-index value | T1 | Raw `z-index: <number>` vs `z-index: var(--token)` is a syntactic distinction. Regex `z-index:\s*(?!var\(--)` catches violations. |

**Sorting test detail:**
- Rule 4: Step 1 -- "Can a regex detect raw values?" Yes. Hex patterns, px/rem suffixes, rgb()/hsl() function calls are all syntactic.
- Rule 5: Step 1 -- "Can a tool catch properties in animation declarations?" Yes. The properties being animated are listed in the CSS syntax. This is the textbook "looks T3, is T1" case.
- Rule 6: Step 1 -- "Can a regex distinguish raw z-index from token z-index?" Yes. Raw integers vs var() references.

**Classification confirmed: all T1.**

---

## Group 3 of 5: Accessibility (Rules 7-9)

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 7 | All images have alt text | T1 | Missing `alt` attribute on `<img>` is a syntactic pattern. A regex or lint rule (jsx-a11y/alt-text) catches `<img>` without `alt`. The rule explicitly allows `alt=""`, so presence of the attribute is the check, not its content. |
| 8 | Color alone does not convey meaning | T3 (visual-qa) | This requires visual judgment. A tool can't determine from source code whether color is the sole indicator of meaning -- the agent needs to see the rendered UI and assess whether redundant cues (icons, text labels, patterns) exist alongside color coding. Reviewers would converge: either there's a redundant cue or there isn't. |
| 9 | Tab order follows visual reading order | T2 | Tab order can be tested at runtime with a deterministic assertion. A Playwright test can tab through elements and compare the focus sequence against the visual layout order. This is a pass/fail check against rendered DOM, not a judgment call. |

**Sorting test detail:**
- Rule 7: Step 1 -- Yes, purely syntactic. JSX-a11y lint rule covers this.
- Rule 8: Step 1 -- No, can't detect from syntax whether color is the sole meaning carrier. Step 2 -- No deterministic runtime assertion. Step 3 -- Yes, visual-qa agent can see screenshots and judge. Reviewers would converge (either there's a non-color cue or not).
- Rule 9: Step 1 -- No, tabindex in source doesn't tell you the visual order. Step 2 -- Yes, a Playwright test can tab through elements and assert the sequence matches visual position (compare getBoundingClientRect ordering with focus order).

**Classification confirmed: T1, T3 (visual-qa), T2.**

---

## Group 4 of 5: Performance (Rules 10-12)

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 10 | No synchronous localStorage reads in render paths | T1 | `localStorage.getItem` / `localStorage.key` / `localStorage.length` are syntactic patterns. Scoping the check to component files (where render paths live) is a reasonable proxy. The "render path" qualifier adds some imprecision (a localStorage read in a useEffect callback is technically not in the render path), but the syntactic part -- "no localStorage reads in component files" -- is independently meaningful. The gap: reads inside hooks that are imported by components aren't caught by file-scoping alone. |
| 11 | Images above/below the fold use correct loading attribute | T3 (visual-qa) | "Above the fold" vs "below the fold" depends on viewport and layout -- it's a visual/runtime property, not a static one. A visual-qa agent can see which images are visible in the initial viewport and check their loading attribute values. |
| 12 | Bundle size per route does not exceed 200kb gzipped | T2 | This is a hard threshold (200kb) with a measurable metric (gzipped bundle size). A build-time or CI test can assert this deterministically. The "Hard threshold with soft qualifier" branch of the sorting test applies -- the threshold is the enforceable part. |

**Sorting test detail:**
- Rule 10: Step 1 -- Mostly yes. The syntactic proxy (`localStorage.*` in component files) catches the structural violation. The gap is that "render path" is contextual -- a read in useEffect is technically not a render-path read. But the structural part is independently meaningful (T1 "mostly but not entirely" branch). Removing the qualifier "in render paths" still leaves "no synchronous localStorage reads in components" which is a real, enforceable rule.
- Rule 11: Step 1 -- No, "above the fold" is a visual property. Step 2 -- Partially, but determining fold position programmatically is fragile. Step 3 -- Yes, visual-qa can see what's visible in the viewport and cross-reference loading attributes.
- Rule 12: Step 1 -- No, it requires a build step. Step 2 -- Yes, a build analysis tool outputs per-route bundle sizes and asserts against the threshold.

**Classification confirmed: T1, T3 (visual-qa), T2.**

---

## Group 5 of 5: Architecture (Rules 13-15)

| # | Rule | Recommended tier | Reasoning |
|---|------|-----------------|-----------|
| 13 | Business logic in hooks/utilities, not render functions | T3 (reviewer) | "Business logic" requires understanding intent -- a data transformation in render might be display formatting (acceptable) or domain logic (violation). A reviewer needs to read the code and make a judgment call. Reviewers would converge: filtering/sorting/validation in render is clearly business logic; string interpolation is clearly display. |
| 14 | Components follow single responsibility principle | Human | "Single responsibility" is inherently subjective. Three experienced reviewers would draw the boundary differently. There's no anchored standard -- what constitutes "one responsibility" varies by context, domain, and team convention. This is the textbook Human-tier example from the skill references. |
| 15 | Side effects isolated in custom hooks, not inline in event handlers | T3 (reviewer) | "Side effect" (API calls, DOM manipulation, storage writes, navigation) is identifiable by a reviewer reading the code, but has no reliable syntactic proxy. A `fetch()` call could be in a handler directly or abstracted behind a function -- the reviewer needs to judge whether the abstraction is a hook or just another function. Reviewers would converge: fetch/axios/localStorage.setItem directly in an onClick is clearly inline. |

**Sorting test detail:**
- Rule 13: Step 1 -- No. "Business logic" is not syntactically distinguishable from display logic. A regex can't tell if `items.filter(...)` is domain filtering or display filtering. Step 2 -- No deterministic test. Step 3 -- Yes, a reviewer reading the code can judge. Reviewers converge on clear cases (sorting by business rules = logic; formatting a date = display).
- Rule 14: Step 1 -- No. Step 2 -- No. Step 3 -- Reviewers would disagree. The adjective trap applies: "single responsibility" is a qualifying adjective with no objective referent. What counts as "one responsibility" is contextual and shifts between reviewers. Step 4 -- Human.
- Rule 15: Step 1 -- Partially. Could grep for `fetch(` or `axios` inside arrow functions in JSX `on*` props, but this misses many side effects and has false positives (calling a hook-returned function that wraps fetch is fine). The syntactic proxy is too unreliable. Step 2 -- No. Step 3 -- Yes, a reviewer can judge. Reviewers converge on direct API/storage calls in handlers.

**Classification confirmed: T3 (reviewer), Human, T3 (reviewer).**

---

## Budget Check

After adding all enforcement blocks:

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 4 | 150 warn / 200 soft cap / 300 hard cap | Well within budget |
| Scopeless T3 | 0 | 10 | Clear |
| Critical T3 | 0 | 10 | Clear |

**Breakdown by file:**
- `frontend-standards.md`: 4 T3 rules (2 visual-qa, 2 reviewer), all scoped

No budget concerns.

---

## Rule ID Reference

| Rule | Implicit ID |
|------|-------------|
| No `as any` | `frontend-standards:code-style:T1` |
| No `export default` | `frontend-standards:code-style:T1` |
| No nested ternaries | `frontend-standards:code-style:T1` |
| Design tokens only | `frontend-standards:css:T1` |
| Animate transform/opacity only | `frontend-standards:css:T1` |
| No raw z-index | `frontend-standards:css:T1` |
| All images have alt | `frontend-standards:accessibility:T1` |
| Color not sole meaning | `frontend-standards:accessibility:T3` |
| Tab order matches visual order | `frontend-standards:accessibility:T2` |
| No localStorage in render | `frontend-standards:performance:T1` |
| Image loading attribute by fold | `frontend-standards:performance:T3` |
| Bundle size under 200kb | `frontend-standards:performance:T2` |
| Business logic in hooks | `frontend-standards:architecture:T3` |
| Single responsibility | `frontend-standards:architecture:Human` |
| Side effects in hooks | `frontend-standards:architecture:T3` |

---

## Summary

- **15 rules** processed across 5 sections
- **8 T1** (deterministic/syntactic): as any, export default, nested ternaries, design tokens, animation properties, z-index, alt text, localStorage
- **2 T2** (automated test): tab order, bundle size
- **4 T3** (LLM-evaluated): color meaning (visual-qa), image loading fold (visual-qa), business logic placement (reviewer), side effect isolation (reviewer)
- **1 Human**: single responsibility principle
- **0 budget concerns**
