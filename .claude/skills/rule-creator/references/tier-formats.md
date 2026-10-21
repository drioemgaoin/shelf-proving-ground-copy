# Enforcement Block Formats

Reference for enforcement block templates. The canonical source is `docs/rules-enforcement.md` (format, execution model, examples) and `architecture.md` (pipeline phases, where each tier runs). This file distills the block formats the skill needs to generate.

All enforcement blocks use the `` ```enforcement `` fence — not `` ```yaml ``. Parsers (`apply-t1.mjs`, `apply-t3.mjs`, the global T2 suite, `audit:rules`) key on this fence type.

---

## T1 — Source text

The violation is a pattern in source code. No execution needed. A regex, AST rule, or type checker can catch it.

**Not T1 if:** you need to start the app or render a page to see the problem. That's T2.

**How it executes.** A PreToolUse hook calls `apply-t1.mjs`, which reads all T1 blocks from rules files, matches against the file being written, and blocks on violation. Lint and `tsc` run before commit.

````
```enforcement
id: "<heading-slug>"                 # required, generated per Rule ID algorithm in SKILL.md
tier: T1
tool: "<linter or checker>"          # optional
- pattern: "<regex>"
  assert: absent | present
  scope: "<file glob>"
  exclude: "<file glob>"            # optional
  strip: comments | strings | comments+strings   # optional
  fix: "<what to do instead>"
```
````

| Field | Guidance |
|-------|----------|
| `tool` | Optional. The AST-based linter or checker that enforces this rule (e.g., `ESLint @typescript-eslint/no-explicit-any`, `stylelint declaration-no-important`, `go vet`). When set and configured in the project, the tool is the primary enforcer; the `pattern` is a fallback. The audit script warns when `tool` is set but the tool isn't in the project's lint config. Always include when a well-known tool exists for the check. |
| `pattern` | Regex that detects the violation. Be specific — false positives erode trust. |
| `assert` | `absent` — the pattern must NOT appear (banning raw values, unsafe casts). `present` — the pattern MUST appear (requiring a specific annotation). |
| `scope` | File glob where the check runs. Narrow beats broad — `src/components/**/*.css` is better than `**/*.css` if the rule only applies to component styles. |
| `exclude` | Optional file glob to exempt from the check (e.g., `src/styles/tokens.css` for raw-value rules). Ask: *are there files where this pattern legitimately appears?* If yes, exclude them. |
| `strip` | Optional. Syntax categories to remove before matching: `comments`, `strings`, or `comments+strings`. Prevents false positives from matches inside comments/strings (`assert: absent`) and false negatives from patterns satisfied by dead text (`assert: present`). Default: none. Ask: *could this pattern appear inside a comment or string literal?* If yes, set `strip` — without it, the regex matches raw file text and will false-positive on commented-out code or string references. |
| `fix` | Tells the agent exactly how to fix the violation. Without it the agent guesses. |

Multiple entries are AND: all checks must pass. Each entry is one `- pattern:` block.

**Rejection output** (what the agent sees when blocked):

```
BLOCKED: T1 violation

file: src/components/Card.css
line: 12
match: "16px"
rule: Every color, size, spacing, radius, shadow, duration and easing comes from a token.
fix: Replace with a --shelf-space-* or --shelf-size-* token from src/styles/tokens.css
```

The agent reads five fields (file, line, match, rule, fix), knows what's wrong and how to fix it, and succeeds in one pass.

**Token-promotion pattern.** Some rules that look like T2 are actually T1 if the token system handles the runtime behavior. Example: "Reduced motion = instant or fade only" — if T1 enforces "must use motion tokens" and the tokens set `duration: 0s` in `prefers-reduced-motion`, the runtime behavior follows by construction. No e2e test needed. Look for this before writing a T2 test.

**Examples:**

````markdown
- Every value comes from a token. No raw values in components.

  ```enforcement
  id: "values-from-tokens"
  tier: T1
  - pattern: "[0-9]+px"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Replace with a --shelf-space-* or --shelf-size-* token from src/styles/tokens.css"
  - pattern: "#[0-9a-fA-F]{3,8}"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Replace with a --shelf-*Color-* token from src/styles/tokens.css"
  ```
````

````markdown
- No `any` types; use `unknown` and narrow.

  ```enforcement
  id: "no-any"
  tier: T1
  - pattern: ": any"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use unknown and narrow with a type guard"
  - pattern: "as any"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use a specific type assertion or unknown"
  ```
````

---

## T2 — Runtime behavior

The violation only appears when the code executes. A tool or test produces pass/fail mechanically. No LLM interprets the result.

**Not T2 if:** a regex or lint rule can catch it in the source — that's T1, promote it. Not T2 if two reasonable people could disagree on whether the result is correct — that's T3.

**Scope determines mechanism.** A T2 rule is either **per-component** or **global**. This determines where, when, and how it runs:

| Scope | When it runs | Who writes it | Example |
|---|---|---|---|
| **Per-component** | Implementer TDD loop | `ui-contract` generates locked spec | Focus trap, drawer direction, filter chips |
| **Global** | Post-merge (script, no LLM) | Written once, runs against all fixtures | Axe scan, CLS < 0.01, no overflow 320–1440px |

A rule is per-component OR global, not both. No double-checking.

**Per-component execution:** `ui-contract` reads the enforcement block and decides WHERE the rule applies (which components, which ticket). The enforcement block declares WHAT to assert. No `applies` field, no component list — those are contextual decisions belonging to the spec generator.

**Global execution:** Runs as a script after the Merger merges a round's tickets. Failures become child tickets under the current spec, fixed in the next round. The pipeline does not move to the next spec until global T2 passes.

````
```enforcement
id: "<heading-slug>"                     # required, generated per Rule ID algorithm in SKILL.md
tier: T2
scope: per-component | global
assert: "<callable (global) or description (per-component)>"
coverage:                                # optional — exhaustive sub-checks
  - "<sub-assertion 1>"
  - "<sub-assertion 2>"
```
````

| Field | Guidance |
|-------|----------|
| `scope` | `per-component`: each component's test suite includes this check (generated by `ui-contract`). `global`: a single cross-cutting suite checks it everywhere. Choose `global` when the check is the same everywhere (axe scan). Choose `per-component` when each component has unique thresholds or behaviors. |
| `assert` | **Global scope:** must be callable — start with a function or helper name, e.g. `expectNoA11yViolations(page)` or `recordLayoutShifts(page) → assert CLS < 0.01`. `audit:rules` rejects descriptive prose for global blocks. If no helper exists yet, name the helper that *should* exist and describe its behavior after `—`. **Per-component scope:** may be descriptive — `ui-contract` reads it to generate the test. |
| `coverage` | Optional list of sub-assertions the generated test must exercise. Each entry is a required test step. The audit script cross-references entries against generated test files; missing entries = warning. Ask: *does this assertion cover multiple distinct behaviors that could independently fail?* If yes, list each as a coverage entry — the audit script checks that generated tests exercise every one. |

**T2 is not Playwright-specific.** For other stacks, the mechanism changes but the tier contract holds — automated, pass/fail, no LLM:

| Stack | T2 mechanism | Examples |
|---|---|---|
| Web UI | Playwright acceptance tests + global assertion suite | Focus trap, axe scan, CLS, responsive columns |
| Backend API | Integration tests + contract tests | Response time p99 < 200ms, rate limiter returns 429 |
| Mobile | Device emulator tests + snapshot tests | 60fps scroll, offline sync, push notification |
| CLI | Fixture input/output tests | Exit codes, output format, error messages |
| Data / ML | Property-based tests + benchmark suites | Schema validation, accuracy thresholds, memory bounds |

**Examples:**

Per-component:

````markdown
- Focus trap in dialogs: Tab cycles within, Escape closes, focus returns to trigger.

  ```enforcement
  id: "focus-trap-dialogs"
  tier: T2
  scope: per-component
  assert: "openDialog() → Tab cycles within dialog → Escape closes → focus returns to trigger element"
  ```
````

Global:

````markdown
- No axe violations.

  ```enforcement
  id: "no-axe-violations"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — run against every fixture"
  ```
````

````markdown
- CLS < 0.01 per interaction.

  ```enforcement
  id: "cls-budget"
  tier: T2
  scope: global
  assert: "recordLayoutShifts(page) → perform interaction → expect CLS < 0.01"
  ```
````

---

## T3 — Intent alignment

The code may be syntactically correct (passes T1) and behaviorally correct (passes T2), but semantically wrong. An LLM reads evidence and makes a structured call.

**Not T3 if:** you can write an automated test that always produces the same pass/fail answer — that's T2, promote it. Not T3 if a regex catches it — that's T1.

**Scaling constraint.** T3 rules are injected into LLM prompts by `apply-t3.mjs`. The expansion script scope-gates rules against the evaluation context and injects relevant instructions. Hard limits:

| Constraint | Value | Type |
|-----------|-------|------|
| Relevant rules per evaluation | 80 | Hard (LLM attention budget) |
| Total T3 rules | 150 (promotion audit warning), 200 (soft cap warning), 300 (hard cap error) | See thresholds |
| `triage_exempt` rules (triage bypass) | 10 | Hard (reviewer only) |
| Scopeless rules (always inject) | 10 | Hard (reviewer only) |

**Scope-gating (both agents, always):**
- **Visual-qa:** context is the component being evaluated (from Planner). Rules scoped to `Drawer` are excluded when evaluating the card grid.
- **Reviewer:** context is `git diff --name-only`. Rules scoped to `src/**/*.css` are excluded when the diff only touches `.ts` files.

Scope-gating is deterministic, free, and typically eliminates 60–80% of rules.

**Scope specificity requirements:**
- Visual-qa rules always use `scope: "*"` (universal). VQA uses group-based chunking, not scope-gating.
- Reviewer rules **must** scope to specific file patterns (`src/components/**/*.css`), not `src/**`
- Reviewer rules without `scope` always inject, counting against the 10-rule scopeless budget

**Two-phase triage (reviewer only, when >80 rules survive scope-gating):**
1. Phase 1 — Haiku screens all surviving rules using `triage_hint` fields (over-inclusive)
2. Phase 2 — Sonnet evaluates only flagged rules with full instructions

````
```enforcement
id: "<heading-slug>"                   # required, generated per Rule ID algorithm in SKILL.md
tier: T3
agent: visual-qa | reviewer
scope: "*"                             # visual-qa: always "*". reviewer: file glob
group: "<affinity group>"              # required for visual-qa, optional for reviewer
priority: 2                            # optional — integer 0-4 (0=critical, 4=backlog), default 2
triage_exempt: false                   # optional — reviewer only, bypasses triage (max 10). Not used for VQA.
triage_hint: "<keywords for Phase 1>"  # reviewer only
exclude: "<file glob>"                 # optional — reviewer only
instruction: "<what to check, what evidence to gather, how to evaluate>"  # YAML double-quoted scalar
```
````

**YAML formatting for `instruction`.** The value must be a YAML double-quoted scalar (wrapped in `"..."`). Embedded double quotes escaped with backslash. Multi-line uses `\n` within the scalar. No block scalars (`|`, `>`).

| Field | Required | Agent | Guidance |
|-------|----------|-------|---------|
| `agent` | Yes | — | `visual-qa` for things visible in a screenshot or runtime behavior. `reviewer` for code structure/style visible in source. |
| `scope` | Yes | Both | VQA: always `"*"` (universal). VQA uses group-based chunking, not scope-gating. Reviewer: file globs (`src/components/**/*.css`). Reviewer rules without scope count against the 10-rule scopeless budget. |
| `instruction` | Yes | Both | Must be a YAML double-quoted scalar. Must include: (1) what to look for, (2) what counts as a violation, (3) what correct looks like. Vague instructions produce vague results. |
| `group` | Yes (VQA) / No (Reviewer) | Both | Semantic grouping key (e.g., `motion`, `tokens`). VQA: required — used as chunking key. Reviewer: optional — triage affinity (when triage flags one rule in a group, all rules in that group are flagged). |
| `priority` | No | Both | Must be an integer 0–4. Non-integer or out-of-range values are errors in `audit:rules`. Default: 2. Used for triage overflow ordering. Set 0–1 for rules where a miss causes serious harm; set 3–4 for cosmetic or low-risk violations. |
| `triage_exempt` | No | Reviewer only | If `true`, bypasses triage — always injected regardless of overflow. Max 10 across project. Not used for VQA. A rule with both `triage_exempt: true` and no `scope` counts against both caps. |
| `triage_hint` | No | Reviewer | Keyword-rich relevance hint for Haiku screening. Without it, triage may miss this rule during cross-cutting refactors. Ignored by visual-qa. |
| `exclude` | No | Reviewer | File glob to exempt from reviewer scope. |

**Examples:**

````markdown
- Truncated text must have a way to see the full value.

  ```enforcement
  id: "truncated-text-full-value"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: truncation
  instruction: "For each element with text-overflow: ellipsis or -webkit-line-clamp, check that hovering or tapping reveals the full text (tooltip, expanded view, or drawer). Flag if truncated text has no disclosure mechanism."
  ```
````

````markdown
- Components own no space outside themselves.

  ```enforcement
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.css"
  triage_hint: "Flag when: margin property appears in component CSS, new component root selector added"
  instruction: "Scan component root selectors in the diff for margin properties. A component must not set margin on its own root element — the parent layout owns spacing via gap or padding. Flag any margin on a component root."
  ```
````

---

## Human — Not automatable

The rule is genuinely subjective — reasonable people disagree on the answer given the same evidence.

**Not Human if:** an LLM following a structured protocol consistently gets it right — that's T3. Not Human if the rule can be formalized into a test — promote it.

**How it executes.** The audit script reports these rules for the morning review. Agents may flag potential violations, but the human makes the final call.

````
```enforcement
id: "<heading-slug>"                   # required, generated per Rule ID algorithm in SKILL.md
tier: Human
review: morning-review
reason: "<why automation can't handle this>"
```
````

| Field | Guidance |
|-------|----------|
| `review` | `morning-review` — the morning review cycle handles these. |
| `reason` | Why this can't be T1/T2/T3. Helps future audits decide whether tooling has caught up and the tier can be promoted. |

**Examples:**

````markdown
- Use `GLOSSARY.md` terms in UI text.

  ```enforcement
  id: "glossary-terms-in-ui"
  tier: Human
  review: morning-review
  reason: "Semantic intent — requires understanding what term fits the context"
  ```
````

---

## Multi-tier rules

Some rules have multiple facets, each enforceable at a different tier. Each tier catches a genuinely different class of violation. Use `---` to separate entries within one enforcement block. Each entry is independent — the same assertion never runs at two tiers.

| Tier | What it catches | Example: "values from tokens" |
|---|---|---|
| T1 | Syntactic violation | Raw `#ff0000` in CSS → hook blocks the write |
| T2 | Runtime mismatch | Computed color doesn't match resolved token → test fails |
| T3 | Semantic misuse | Uses `--shelf-fgColor-danger` for a non-error label → reviewer flags |

````markdown
- Durations and easing come from motion tokens.

  ```enforcement
  id: "motion-tokens"
  tier: T1
  - pattern: "transition:.*[0-9]+ms"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-duration-*) instead of raw duration"
  ---
  id: "motion-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: motion
  triage_hint: "Flag when: motion/transition/animation token referenced, duration or easing value changes"
  instruction: "Check that motion tokens match the use case: fast for hover/focus, base for panels, slow for large layout shifts. Flag semantic misuse even when the token is syntactically valid."
  ```
````

Note: no T2 entry here. T1 ensures tokens are used. T3 ensures the right token is used for the context. A runtime test would be redundant — if the token is correct, the runtime value is correct by construction.
