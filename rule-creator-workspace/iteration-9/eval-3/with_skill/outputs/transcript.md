# Rule Creator Transcript: frontend-standards.md batch enforcement

## Discovery

Rules files found in `.claude/rules/`:
- `ui-project.md`
- `ui-base.md`
- `visual-rules.md` (3 existing T3 blocks)
- `code-quality.md`
- `team-standards.md`

Input file: `evals/fixtures/batch-file/.claude/rules/frontend-standards.md` (15 rules, 0 enforcement blocks)

### Existing budget baseline (across all discovered rules files)
- T3 total: 3 (limit: 150 warn / 200 soft cap / 300 hard cap)
- Scopeless T3: 0 (limit: 10)
- Critical T3: 0 (limit: 10)

---

## Sorting Test: Group 1 (Code Style, rules 1-3)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 1 | No `as any` type assertions | **T1** | Regex/lint can match `as any` in .ts/.tsx files. ESLint `@typescript-eslint/no-explicit-any` covers this. Pure syntactic signature -- always wrong regardless of context. |
| 2 | No `export default` | **T1** | Regex/lint can match `export default`. ESLint `import/no-default-export` catches every case. Pure syntactic pattern. |
| 3 | No nested ternary expressions | **T1** | AST/lint can detect nested ternaries. ESLint built-in `no-nested-ternary` rule. Pure syntactic. |

All three are textbook T1 -- banned syntax patterns with well-known lint rules.

**Blocks generated.** Rule IDs:
- `frontend-standards:code-style:T1` (as any)
- `frontend-standards:code-style:T1` (export default)
- `frontend-standards:code-style:T1` (nested ternary)

---

## Sorting Test: Group 2 (CSS, rules 4-6)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 4 | All values from design tokens | **T1** | Regex matches raw hex, px, rem, rgb(), hsl() in component CSS. Exactly the worked example from references. |
| 5 | Animations use only transform and opacity | **T1** | Regex/stylelint can check transition/keyframes for non-transform/opacity properties. This is the "tricky: looks T3, is T1" worked example. |
| 6 | Never set raw z-index value | **T1** | Regex matches `z-index:` not using `var(--shelf-z-*)`. Pure syntactic. |

All CSS rules have clear syntactic proxies. The "animate only transform/opacity" rule is the classic example of a rule that sounds visual but is actually about which CSS properties appear in declarations.

**Blocks generated.** Rule IDs:
- `frontend-standards:css:T1` (design tokens)
- `frontend-standards:css:T1` (animation properties)
- `frontend-standards:css:T1` (z-index tokens)

---

## Sorting Test: Group 3 (Accessibility, rules 7-9)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 7 | All images have alt text | **T1** | JSX lint rule (`jsx-a11y/alt-text`) catches `<img>` without `alt` attribute. Syntactic pattern in JSX. |
| 8 | Color alone does not convey meaning | **T3** (visual-qa) | Requires visual judgment -- must look at rendered UI to determine if color is the sole differentiator. No syntactic or runtime assertion covers this. Reviewers would converge (obvious when color is the only signal). |
| 9 | Tab order follows visual reading order | **T2** | Playwright test can programmatically tab through elements and compare DOM tab order against visual bounding rect positions. Deterministic pass/fail. |

Mixed group: one syntactic (alt text), one runtime-testable (tab order), one requiring visual judgment (color meaning).

**Blocks generated.** Rule IDs:
- `frontend-standards:accessibility:T1` (alt text)
- `frontend-standards:accessibility:T3` (color meaning)
- `frontend-standards:accessibility:T2` (tab order)

---

## Sorting Test: Group 4 (Performance, rules 10-12)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 10 | No synchronous localStorage reads in render paths | **T1** | Regex matches `localStorage.getItem` etc. in component files. Gap: doesn't distinguish render-time vs event-handler calls within the same file, but scoping to component files catches the structural part. The gap (event-handler calls are technically fine) is a minor false-positive worth accepting since localStorage in components should generally be in hooks. |
| 11 | Images above fold: loading="eager", below: loading="lazy" | **T3** (visual-qa) | "Above the fold" requires visual/layout context. A screenshot-based agent can verify which images are visible on initial load and check their loading attribute. |
| 12 | Bundle size per route does not exceed 200kb gzipped | **T2** | Build tooling measures this. CI test asserts the threshold. Hard threshold rule (200kb) -- T1 for the threshold per the skill's "hard threshold with soft qualifier" guidance, but this requires a build step to measure, making it T2. |

**Blocks generated.** Rule IDs:
- `frontend-standards:performance:T1` (localStorage)
- `frontend-standards:performance:T3` (image loading strategy)
- `frontend-standards:performance:T2` (bundle size)

---

## Sorting Test: Group 5 (Architecture, rules 13-15)

| # | Rule | Tier | Reasoning |
|---|------|------|-----------|
| 13 | Business logic in hooks/utilities, not render functions | **T3** (reviewer) | "Business logic" requires understanding intent -- what counts as business logic vs display logic varies by context. An LLM reviewer can read component code and judge. Reviewers would generally converge on obvious cases (data transformations, validation, conditionals in render). |
| 14 | Components follow single responsibility principle | **Human** | SRP is inherently subjective. Explicitly listed as a "Human" example in the skill references. Three reviewers would disagree on boundaries. |
| 15 | Side effects isolated in custom hooks, not inline in handlers | **T3** (reviewer) | "Side effect" is a semantic concept. While some patterns are detectable (fetch, setTimeout), the full set requires code comprehension. An LLM reviewer can identify inline side effects in event handlers reliably. |

**Blocks generated.** Rule IDs:
- `frontend-standards:architecture:T3` (business logic placement)
- `frontend-standards:architecture:Human` (single responsibility)
- `frontend-standards:architecture:T3` (side effect isolation)

---

## Budget Check (post-generation)

### Per-file breakdown

| File | T3 count | Scopeless T3 | Critical T3 |
|------|----------|--------------|-------------|
| `visual-rules.md` | 3 | 0 | 0 |
| `frontend-standards.md` (new) | 4 | 0 | 0 |
| `ui-project.md` | 0 | 0 | 0 |
| `ui-base.md` | 0 | 0 | 0 |
| `code-quality.md` | 0 | 0 | 0 |
| `team-standards.md` | 0 | 0 | 0 |

### Aggregated totals

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 | 7 | 150 warn / 200 soft / 300 hard | Well within budget |
| Scopeless T3 | 0 | 10 | Clear |
| Critical T3 | 0 | 10 | Clear |

---

## Summary

15 rules classified:
- **T1:** 8 rules (as any, export default, nested ternary, design tokens, animation properties, z-index tokens, alt text, localStorage)
- **T2:** 2 rules (tab order, bundle size)
- **T3:** 4 rules (color meaning, image loading strategy, business logic placement, side effect isolation)
- **Human:** 1 rule (single responsibility principle)

Note: Rule 10 (localStorage) has a known gap -- scoping to component files catches the structural violation but may flag legitimate event-handler localStorage use. If this produces false positives, consider narrowing the scope or splitting into two rules.
