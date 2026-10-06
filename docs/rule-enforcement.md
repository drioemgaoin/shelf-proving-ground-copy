# Rule Enforcement Strategy

How every rule in `ui-base.md`, `ui-project.md`, and `CODING_STANDARDS.md` gets enforced — and how the pipeline ensures the fixer agent never needs to read rules, standards, or explore the codebase.

## The core constraint: fixer = cheap machine

The fixer agent is a mechanical applicator. It reads a report, opens the file at the line indicated, replaces old code with new code, runs verification. It never reads rules, never greps for patterns, never makes judgment calls. This means it can run on Sonnet or Haiku.

**Everything upstream exists to make the report self-contained.** If the fixer has to investigate, the pipeline has failed — not the fixer.

```
Cost model:

  Implementer (Opus)     — reads rules, writes code, TDD loop        = expensive, justified
  Visual QA (Sonnet)     — reads rules + runtime, writes report       = medium, justified
  Reviewer (Sonnet)      — reads rules + diff, writes report          = medium, justified
  Fixer (Haiku?)         — reads report, applies fix, runs verify     = cheap, mechanical
```

There is one fixer prompt (`fix-prompt.md`) and one fixer role. It handles both visual-qa findings and review findings — the report format is what changes, not the fixer. The orchestrator calls the same prompt with different `{{FINDINGS_FILE}}` and `{{VERIFY_COMMAND}}` values.

The expensive work is diagnosis. The cheap work is applying a prescription.

---

## What "self-contained report" means

A finding in a report must contain everything the fixer needs to apply the fix without opening any other file, reading any rule, or running any exploratory command.

### Visual QA report — required fields per finding

```
- src/components/ShelfGrid.css:42 `.chip[aria-pressed="true"]`
  Test: "Shelf grid: chip visual states" (e2e/acceptance/shelf-grid.spec.ts:136)
  Assertion: `expect(selectedBg).toBe(await resolveColor(page, accentBg))`
  Expected: rgb(186, 108, 79)
  Received: rgb(255, 255, 255)
  Cause: [ui-base > States] Selected chip missing accent background
  Current: /* no rule for .chip[aria-pressed="true"] */
  Fix: Add after line 41:
    .chip[aria-pressed="true"] {
      background-color: var(--shelf-bgColor-accent);
      color: var(--shelf-fgColor-on-accent);
      border-color: transparent;
    }
```

**Every field is mandatory.** Here's why each one exists:

| Field | Why the fixer needs it | What happens without it |
|-------|----------------------|------------------------|
| `src/file.ext:line` | Fixer opens this file at this line. No grep needed. | Fixer greps the codebase → expensive, slow, error-prone |
| `selector or symbol` | Fixer confirms it's at the right spot (guard against line drift) | Fixer reads surrounding code to orient → wastes tokens |
| `Test:` with spec file:line | Fixer can re-run just this test to verify | Fixer runs the whole suite → slow, or can't verify at all |
| `Assertion:` | Fixer understands what's being checked | Fixer has to read the test → defeats the purpose |
| `Expected:` / `Received:` | Fixer knows the target value and current wrong value | Fixer has to reason about what "correct" means → needs rule knowledge |
| `Cause: [rule ref]` | Audit trail for humans reviewing the report | Not strictly needed by fixer, but critical for human oversight |
| `Current:` | The exact code the fixer will find at that line | Fixer reads the file and has to figure out what to change → investigation |
| `Fix:` | The exact replacement code, copy-pasteable | Fixer has to write code → needs rule + design knowledge → expensive model |

### Code review report — same required fields

The reviewer uses the same field structure. Findings are often simpler (single-line substitutions), but the contract is identical — `Current:` + `Fix:` = mechanical replacement:

```
- src/components/ShelfGrid.css:18 `.grid`
  Cause: [ui-base > Values > token] Raw gap value instead of token
  Current: gap: 24px;
  Fix: gap: var(--shelf-space-lg);
```

### Why one fixer prompt handles both

Both visual-qa and reviewer produce reports in the same structure: a list of findings, each with file:line, `Current:`, and `Fix:`. The fixer doesn't care which agent wrote the finding — it applies the same mechanical process either way. The orchestrator just passes a different `{{FINDINGS_FILE}}` (`.qa/visual-r1.md` or `.qa/review-r1.md`) and `{{VERIFY_COMMAND}}` (visual tests or typecheck+lint).

---

## The real failure: what happens when the report is incomplete

From the actual `visual-r1.md` produced during the djk.1 run:

```
Fix now:
- [mobile] Shelf grid: chip visual states: expect(received).toBe(expected) —
  programmatic assertion fails before snapshot; no baseline generated
  (acceptance/shelf-grid.spec.ts)
- [tablet] Shelf grid: chip visual states: same failure as mobile
- [desktop] Shelf grid: chip visual states: same failure as mobile
  ...
```

What's missing:
- **No `src/` file path** — fixer has to grep the codebase to find what CSS to change
- **No `Current:` code** — fixer has to read the file and understand the component structure
- **No `Fix:` code** — fixer has to understand the rule, the token system, and write CSS from scratch
- **No `Expected:` / `Received:` values** — fixer has to re-run the test to understand the failure
- **"same failure as mobile" ×5** — fixer has to deduplicate and reason about cross-viewport issues

This report forced the fixer to do full diagnosis — the same work the visual-qa agent should have done. The fixer needed Opus and a large context window just to understand the problem.

---

## What must change in each prompt

### visual-qa-prompt.md — gaps to close

The current prompt at line 135 specifies the format:

```
- <src/file.ext>:<line> `<selector or symbol>`
  Test: "<exact test name>" (<spec-file>:<line>)
  Assertion: `<the expect() call>`
  Expected: <literal value>
  Received: <literal value>
  Cause: [<rule-file> > <section> > <rule>] <one-line explanation>
  Fix: <exact code change — what to replace with what>
```

The format is right but two fields are missing: `Current:` (the code that's there now) and multi-line `Fix:` (when the fix is an addition, not a replacement). And the agent doesn't follow the format — the djk.1 report proves it.

**Changes needed:**

1. **Add `Current:` field** to the output format — the verbatim code at the indicated line, or `/* no matching rule */` if the fix is an addition.

2. **Require `Fix:` to be copy-pasteable code**, not a description. "Add `background-color: var(--shelf-bgColor-accent)`" is too vague — the fixer needs to know *where* to add it (after which line, inside which selector). Show the full CSS rule block.

3. **Deduplicate cross-viewport failures.** When the same root cause fails in all 6 projects, emit ONE finding with a viewport list — not 6 identical entries. The fixer applies one fix; repeating it 6 times wastes tokens and confuses cheap models.

4. **Add enforcement language.** The prompt says "Provide the exact file, line, current code, and replacement code" (line 97) but treats it as guidance, not a hard contract. Add: "A finding missing any required field is invalid. The fixer will skip it."

5. **Add a "reading source" step.** The current diagnosis protocol (Steps 1–3) focuses on reading the *test error* but never says "open the source file to get the `Current:` code." The visual-qa agent must read the source file to provide `Current:` and write the `Fix:`. This is where the cost goes — and it belongs here, not in the fixer.

### review-prompt.md — gaps to close

The current format:

```
- <src/file.ext>:<line> `<selector or symbol>`
  Cause: [<rule-file> > <section> > <rule>] <what's wrong>
  Current: <the problematic code, one line>
  Fix: <the exact replacement>
```

This is closer to correct. The `Current:` field exists. But:

1. **Multi-line fixes.** "one line" is too constraining. Some fixes span multiple lines (e.g. extracting a nested ternary into an if/else). Allow multi-line `Current:` and `Fix:` blocks with indentation.

2. **Ensure `Fix:` is never a description.** "Use `satisfies` instead of `as`" is a description. `Fix: } satisfies BookStatus` is code. The reviewer must write the replacement code, not instructions.

### fix-prompt.md — already mostly right

The current fix prompt says:

```
3. For each finding (under `Fix now:` or `FINDINGS`):
   - Open the file and line indicated in the finding header
   - Apply the exact change from the `Fix:` field — do not reinterpret it
   - Do NOT re-diagnose the issue, run exploratory commands, or create debug test files
```

This is correct. The only addition: **"If a finding is missing `Current:` or `Fix:` fields, skip it and note it as malformed in your commit message."** This creates backpressure on the visual-qa and reviewer agents to produce complete reports.

---

## The five enforcement layers

```
Layer           When                   Who              Reads rules?   Reads code?   Cost
─────────────── ────────────────────── ──────────────── ──────────── ───────────── ──────
1. Acceptance   RED→GREEN (TDD)        Implementer      Yes            Yes           Opus
2. Lint/Static  Before commit          Implementer      No (tooling)   No (tooling)  Free
3. Visual QA    After build            Visual-QA agent  Yes            Yes (source)  Sonnet
   → Fix        After visual report    Fixer agent      NO             Minimal*      Haiku
4. Code Review  After visual fix       Reviewer agent   Yes            Yes (diff)    Sonnet
   → Fix        After review report    Fixer agent      NO             Minimal*      Haiku
```

*Same prompt (`fix-prompt.md`), same role, called twice. Orchestrator passes different `{{FINDINGS_FILE}}` and `{{VERIFY_COMMAND}}`. Fixer reads only the specific file:line from the report. Never reads rule files, never reads the diff, never greps.

### What each layer is responsible for

**Layer 1 — Acceptance tests (implementer, RED→GREEN)**

The acceptance tests ARE the primary enforcement. The implementer (Opus) reads the rules, reads the code, writes the implementation. Most rules are tested here:

- Accessibility: `expectNoA11yViolations()`, `expectFocusVisibleOnTab()`
- Layout: `expectNoHorizontalOverflow()`, `widthSweep()`, column count assertions
- Motion: `readAnimations()`, `setReducedMotion()`, token comparisons
- Stability: `recordLayoutShifts()`, `layoutShift()`, `measureFrames()`
- States: token-vs-computed-style assertions per interactive element
- Visual: `expectScreenshot()` baselines

If a rule can be expressed as a Playwright assertion, it belongs in the acceptance test. The implementer pays the cost of understanding the rule once; after that, the test enforces it mechanically forever.

**Layer 2 — Lint and static analysis (tooling, no agent cost)**

Rules about code structure that a tool can check without understanding intent:

| Tool | Rules enforced |
|------|---------------|
| `tsc --noEmit` | All public params/returns typed, no implicit any |
| ESLint (existing) | `no-explicit-any` |
| ESLint (to add) | `no-nested-ternary`, `naming-convention`, `consistent-type-assertions` |
| CSS lint script (to build) | No raw values, `@keyframes` in `@layer`, animate only transform/opacity, z-index from tokens, `--shelf-` prefix |

These run as part of the implementer's pre-commit step. Zero agent cost — just tooling. If lint fails, the implementer fixes it inline. No report needed.

**Layer 3 — Visual QA (Sonnet, reads rules + source, writes report)**

Catches what the acceptance tests missed or what emerged after implementation:
- Screenshot diffs that reveal visual problems the programmatic tests didn't cover
- State combinations not explicitly tested
- Review of new baselines against rule files

The visual-qa agent reads `ui-base.md` and `ui-project.md`, reads the source CSS/component files, and writes a self-contained report. **This is where the diagnostic cost belongs.**

**Layer 4 — Code Review (Sonnet, reads rules + diff, writes report)**

Catches structural issues not testable at runtime:
- Raw token values in CSS
- Wrong naming conventions
- Unnecessary complexity
- Spec divergence

The reviewer reads `CODING_STANDARDS.md`, the rule files, and the diff. It writes a self-contained report. **This is where the structural diagnostic cost belongs.**

**Layer 5 — Fixer (Haiku, reads only the report)**

One prompt (`fix-prompt.md`), one role, called twice by the orchestrator — once after visual-qa with the visual findings file, once after review with the review findings file. Same mechanical process both times: open file at line, replace `Current:` with `Fix:`, run verify. If verify fails, adapt minimally. Commit.

---

## Rule-by-rule enforcement map

### ui-base.md

| Rule | Primary layer | Backup layer | Enforcement |
|------|--------------|-------------|-------------|
| Every value from a token | Lint (CSS lint script) | Review | Script greps for raw values; reviewer catches semantic misuse |
| Components own no space outside | Review | — | Reviewer checks margin on component roots |
| Interactive states (default/hover/focus/active/disabled) | Acceptance | Visual QA | Per-element computed-style assertions in ticket spec |
| Data views (loading/empty/error/populated) | Acceptance | — | Fixture-based tests per data view |
| No horizontal overflow 320–1440px | Acceptance | — | `widthSweep()` + `expectNoHorizontalOverflow()` |
| Reserved space for late-loading content | Acceptance | — | `layoutShift()` < 0.01 |
| Z-index from tokens only | Lint (CSS lint script) | Review | Script greps for raw z-index |
| Animate only transform/opacity | Lint (CSS lint script) | Review | Script parses transition/animation properties |
| Durations/easing from motion tokens | Acceptance + Lint | — | `readAnimations()` in spec; CSS lint for raw durations |
| Reduced motion: no movement | Acceptance | — | `setReducedMotion()` + assert 0ms durations |
| Exit ≤ enter duration | Lint | — | Compare token values |
| No axe violations | Acceptance | — | `expectNoA11yViolations()` |
| Contrast 4.5:1 / 3:1 | Acceptance | — | axe-core `color-contrast` |
| Pointer targets ≥ 24×24 | Acceptance | — | axe-core `target-size` |
| Focus visible, trapped, returns | Acceptance | Visual QA | `expectFocusVisibleOnTab()` + dialog-specific tests |
| Every control has accessible name | Acceptance | — | axe-core + role-based locators |
| Works at 200% zoom | Acceptance | — | `expectNoHorizontalOverflow()` at narrow widths / zoom project |
| Layout shift < 0.01 | Acceptance | — | `recordLayoutShifts()` → `layoutShift()` |
| ≤ 2 long frames | Acceptance | — | `measureFrames()` |
| Truncated text viewable | Acceptance | — | `?fixture=long` + drawer/tooltip assertion |
| GLOSSARY.md terms | Review | — | Reviewer checks "Avoid" terms |
| `data-dynamic` on changing content | Visual QA | — | Screenshot flakiness reveals missing `data-dynamic` |

### ui-project.md

| Rule | Primary layer | Backup layer | Enforcement |
|------|--------------|-------------|-------------|
| `--shelf-` prefix on all tokens | Lint (CSS lint script) | — | Parse tokens.css |
| Color role tokens exist | Lint (token-check script) | — | Compare table to tokens.css |
| Light + dark via `[data-theme]` | Acceptance | Visual QA | Playwright dark project; screenshots |
| System preference honored | Acceptance | — | `emulateMedia({ colorScheme: 'dark' })` |
| Font/size/weight from tokens | Lint (CSS lint script) | Review | Script greps for raw values |
| Spacing from tokens | Lint (CSS lint script) | Review | Script greps for raw values |
| Radius: card=md, pill=full | Acceptance | Review | `readToken()` vs `getComputedStyle()` |
| Shadow per elevation | Review | — | Reviewer checks token usage |
| Z-index ascending | Lint (token-check script) | — | Parse and verify order |
| Focus ring from tokens | Acceptance | — | `expectFocusVisibleOnTab()` |
| Motion tokens per use-case | Acceptance + Lint | — | `readAnimations()` + CSS lint |
| Reduced motion durations = 0ms | Acceptance | — | `setReducedMotion()` |
| Breakpoints 768/1024 | Acceptance | — | Column count at viewports |
| Toasts: bottom-center, 4s | Acceptance | — | Position + timing assertions |
| Destructive = undo toast | Acceptance | — | No alertdialog, toast with undo |
| Form validation on blur+submit | Acceptance | — | Blur + submit assertions |
| Drawer position per viewport | Acceptance + Visual QA | — | Position + screenshots |

### CODING_STANDARDS.md

| Rule | Primary layer | Backup layer | Enforcement |
|------|--------------|-------------|-------------|
| camelCase / PascalCase | Lint (ESLint) | — | `@typescript-eslint/naming-convention` |
| Named exports | Lint or Review | — | `import/no-default-export` or reviewer |
| No nested ternaries | Lint (ESLint) | — | `no-nested-ternary` |
| No `any` | Lint (ESLint) | — | `@typescript-eslint/no-explicit-any` (active) |
| No `as` casts | Lint (ESLint) | — | `consistent-type-assertions` |
| `satisfies` / `as const` | Review | — | Reviewer checks |
| Public params/returns typed | Lint (ESLint) | — | `explicit-function-return-type` |
| Tests co-located | Review | — | Reviewer checks paths |
| Acceptance tests locked | Hook | — | Sandcastle hook (active) |
| Agent tests in e2e/agent/ | Review | — | Reviewer checks paths |
| Role-based queries only | Lint + Review | — | Grep for `querySelector`/`locator('.')` in tests |
| Token values only in tokens.css | Lint (CSS lint script) | — | Script greps component files |
| @keyframes in @layer | Lint (CSS lint script) | — | Script finds un-nested @keyframes |
| Data through API module | Review | — | Reviewer checks |
| Single responsibility | Review | — | Subjective — reviewer only |
| Composition over inheritance | Review | — | Reviewer checks |

---

## What to build (prioritized)

### Priority 1: Fix the report quality (zero new code, prompt changes only)

The reports are the bottleneck. Fix the visual-qa and review prompts:

1. **Add `Current:` field** to visual-qa output format
2. **Require multi-line `Fix:` blocks** (not descriptions)
3. **Add cross-viewport deduplication** instruction to visual-qa
4. **Add "read source file to get Current/Fix"** step to visual-qa diagnosis
5. **Add "skip malformed findings"** instruction to fix prompt
6. **Test with a replay** (`npm run sandcastle:visual-qa`) to verify report quality

This alone may be enough to move the fixer from Opus to Sonnet, then test Haiku.

### Priority 2: CSS lint script (`scripts/css-lint.mjs`)

Covers ~10 rules from all three files. Runs in implementer pre-commit step. Catches violations before they reach the visual-qa/review layer.

Rules enforced:
- No raw color values outside `tokens.css`
- No raw spacing (px/rem for padding/margin/gap) outside `tokens.css`
- No raw font-size/font-weight outside `tokens.css`
- No raw duration/easing outside `tokens.css`
- No raw z-index (must use `var(--shelf-z-*)`)
- No raw box-shadow (must use `var(--shelf-shadow-*)`)
- `@keyframes` must be inside `@layer`
- `transition`/`animation` properties must be `transform` or `opacity` only

### Priority 3: ESLint config additions

Add to `eslint.config.js`:

```js
rules: {
  'no-nested-ternary': 'error',
  '@typescript-eslint/naming-convention': ['error', /* config */],
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
}
```

### Priority 4: Token existence check (`scripts/token-check.mjs`)

Parse `tokens.css`, verify all tokens from `ui-project.md` table exist, verify `--shelf-` prefix. One-time validation, run in CI.

---

## Rules that cannot be automated

| Rule | Why | Mitigation |
|------|-----|------------|
| GLOSSARY.md vocabulary | Semantic intent | Grep for "Avoid" terms once glossary exists |
| Single responsibility | Subjective | Reviewer only |
| "Explicit over clever" | Subjective | Reviewer only |
| "A state with no test is unfinished" | Meta-process | ui-contract generates complete acceptance criteria |

---

## Measuring success

The fixer-as-cheap-machine constraint is met when:

1. **Fixer token usage drops 3–5x** compared to current Opus runs
2. **Fixer never runs `grep`, `find`, or reads rule files** — only opens files named in the report
3. **Fixer runs on Haiku** for both visual and review findings without quality regression
4. **Visual QA and reviewer token usage stays flat or increases slightly** (they absorb the diagnostic cost)
5. **Total pipeline cost decreases** because two cheap Haiku fixer runs replace two expensive Opus runs

Track by comparing `logRunStats` output before and after prompt changes. The `main.mts` agents to change:

```ts
// Before
const VISUAL_FIXER  = claude("claude-opus-4-8");
const CODE_FIXER    = claude("claude-opus-4-8");

// After (once reports are self-contained)
const FIXER         = claude("claude-haiku-4-5-20251001");
```

Both `timedSandboxRun` calls for visual-fixer and code-fixer use the same `FIXER` agent and the same `fix-prompt.md` — only `{{FINDINGS_FILE}}` and `{{VERIFY_COMMAND}}` differ.
