# Enforcement Tiers

How rules are enforced — and how to assign, write, and maintain enforcement for each tier.

## The sorting test

Every rule belongs to exactly one tier. Two questions determine which:

**1. Does catching it require executing the code?**
- No → **T1**. The violation is visible in the source text.
- Yes → next question.

**2. Can the result be determined without LLM interpretation?**
- Yes → **T2**. A tool or test produces pass/fail mechanically.
- No → **T3**. An LLM must look at evidence and make a judgment call.

If neither automation nor an LLM can reliably judge it → **Human**.

A rule belongs to the **lowest tier that can reliably enforce it**. If a grep catches it, it's T1 — even if you could also write a T2 test. If an automated test can verify it, it's T2 — even if an LLM could also spot it. Push enforcement down to minimize cost and maximize speed.

### Promotion

When you find a way to enforce a rule at a lower tier, promote it. Adding a stylelint rule for "animation only animates transform/opacity" promotes it from T2→T1. Writing a parameterized test for a rule currently checked by the reviewer promotes it from T3→T2. Promotion is always desirable — it makes enforcement cheaper, faster, and more reliable.

### No overlap

Each rule is enforced at exactly one tier. The exceptions are multi-faceted rules where each tier catches a genuinely different class of violation (see [Multi-tier rules](#multi-tier-rules)). Even then, each *check* is at one tier — the same assertion never runs in two places.

---

## The four tiers

| Tier | Name | Question answered | Deterministic? | Cost |
|---|---|---|---|---|
| **T1** | Source text | Does the code *say* the right thing? | Yes | Zero — blocks before write lands |
| **T2** | Runtime behavior | Does the code *do* the right thing? | Yes | Moderate — needs execution |
| **T3** | Intent alignment | Does the code *mean* the right thing? | No | LLM inference |
| **Human** | Subjective | Does it fit the product's intent? | No | Human review |

Each tier exists because the tier above it can't catch the violation:

- **T1** catches what's visible in the source text — raw values, banned patterns, type errors, lint violations.
- **T2** catches what only appears when the code runs — computed layout, focus behavior, accessibility tree state, animation timing, responsive breakpoints.
- **T3** catches what requires judgment — semantic misuse of a correct token, visual harmony, whether the implementation matches the spec's intent.
- **Human** catches what's genuinely subjective — terminology fit, responsibility boundaries, design decisions.

---

## T1 — Source text

**Boundary.** The violation is a pattern in source code. No execution needed. A regex, AST rule, or type checker can catch it.

**Not T1 if:** you need to start the app or render a page to see the problem. That's T2. If the code compiles and lints clean but behaves wrong at runtime, T1 can't help.

**How it executes.** A single PreToolUse hook calls `scripts/enforce-t1.mjs`. The script reads all T1 enforcement blocks from rules files (cached by mtime), matches against the file being written, and blocks on violation. Lint and `tsc` run before commit. No generator step, no intermediate files.

```
agent writes file → PreToolUse hook → enforce-t1.mjs → pattern check → pass/fail
agent commits → lint + tsc → pass/fail
```

**Enforcement block format:**

```yaml
tier: T1
- pattern: "<regex>"
  assert: absent | present
  scope: "<file glob>"
  exclude: "<file glob>"            # optional
  fix: "<what to do instead>"
```

- `assert: absent` — the pattern must NOT appear (banning raw values, unsafe casts)
- `assert: present` — the pattern MUST appear (requiring a specific annotation)
- `fix` — tells the agent exactly how to fix the violation; without it the agent guesses

Multiple entries are AND: all checks must pass.

**Rejection output format:**

```
BLOCKED: T1 violation

file: src/components/Card.css
line: 12
match: "16px"
rule: Every color, size, spacing, radius, shadow, duration and easing comes from a token.
fix: Replace with a --shelf-space-* or --shelf-size-* token from src/styles/tokens.css
```

| Field | Purpose |
|---|---|
| **file** | Exact file — no searching |
| **line** | Exact line number — no scanning |
| **match** | Exact text that triggered — no ambiguity |
| **rule** | Full rule text — no misreading intent |
| **fix** | Actionable fix from the enforcement block — no guessing |

The agent reads five fields, knows what's wrong and how to fix it, and succeeds in one pass.

**Examples:**

````markdown
- Every value comes from a token. No raw values in components.

  ```enforcement
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

**Boundary.** The violation only appears when the code executes — in a browser, a test runner, or against a live service. A tool or test produces pass/fail mechanically. No LLM interprets the result.

**Not T2 if:** a regex or lint rule can catch it in the source. That's T1 — promote it. Not T2 if two reasonable people could disagree on whether the result is correct. That's T3.

**The mechanism is pluggable.** T2 means "automated, pass/fail, no LLM judgment." It does not mean "acceptance test." The right mechanism depends on the rule's scope and what's cheapest:

| Mechanism | Best for | Cost |
|---|---|---|
| Per-component acceptance test | Component interactions, states, focus behavior | High (browser per test) |
| Global assertion suite | Page-level invariants (axe, CLS, overflow, zoom) | Medium (one pass over all fixtures) |
| Integration test harness | Backend perf, fault tolerance, API contracts | Medium (service startup) |
| Snapshot / property test | Data pipelines, serialization, state machines | Low (no browser) |

### Scope determines mechanism

A T2 rule is either **per-component** (scoped to what a ticket builds) or **global** (a project-wide invariant). This determines where, when, and how it runs:

| Scope | When it runs | Who writes it | Example |
|---|---|---|---|
| **Per-component** | Implementer TDD loop | `ui-contract` generates locked spec | Focus trap works, drawer slides from right on desktop, filter chips toggle |
| **Global** | Post-merge, within the spec's loop | Written once, runs against all fixtures | Axe scan all pages, CLS < 0.01, no horizontal overflow 320–1440px, works at 200% zoom |

Per-component checks give the Implementer immediate TDD feedback. Global checks run post-merge against the integrated result and catch emergent cross-component regressions that per-ticket tests miss (e.g., two components that each pass individually but cause CLS spikes or overflow when combined on the same page).

**No double-checking.** A rule is per-component OR global, not both. The Implementer doesn't run axe (that's global). Visual QA and Reviewer are T3-only agents — they never run T2 checks. If a check produces pass/fail without LLM interpretation, it's not their job.

### Global T2 lifecycle

Global checks run as a **script** (no LLM) after the Merger merges a round's tickets — not per-ticket, not via an LLM agent. Failures become child tickets of the current spec and are fixed in the next round of the same spec. The pipeline does not move to the next spec until global T2 passes on the merged result.

```
Spec S with child tickets T1–T5:

Round 1:
  Planner picks T1–T5
  Per ticket: Implementer (T1 + per-component T2) → Visual QA (T3) → Reviewer (T3)
  Merger merges passed tickets
  Global T2 suite runs against merged state
    → FAIL: CLS spike, axe duplicate landmark
    → Orchestrator creates T6, T7 as children of S

Round 2:
  Planner picks T6, T7 (global T2 fix tickets)
  Per ticket: Implementer fixes via TDD
  Merger merges
  Global T2 suite runs again
    → PASS

Spec S complete: all children closed AND global T2 green
→ Move to next spec
```

**Spec completion condition:** all child tickets closed AND global T2 suite passes on the merged result. Not just "all tickets closed." The global suite is the final gate on the spec.

**Fix tickets inherit context.** Global T2 fix tickets are children of the same spec. They carry a machine-generated description with the exact failure (assertion name, expected/received, fixture). No LLM writes or interprets the description. The Implementer's TDD loop picks them up and fixes them mechanically.

**Round budget.** Fix rounds count against the spec's round budget (max 10). A spec that generates many global T2 regressions eats into its own budget and eventually escalates rather than looping forever. If a global fix ticket creates a *new* global failure in the same assertion category, the orchestrator escalates immediately with reason `global-oscillation`.

### The token-promotion pattern

Some rules that look like T2 are actually T1 if the token system is designed correctly:

- "Reduced motion = instant or fade only" — if T1 enforces "must use motion tokens" and the tokens set `duration: 0s` in `prefers-reduced-motion`, the runtime behavior follows by construction. No e2e test needed.
- "Durations and easing from motion tokens" — T1 hook already rejects raw values. If tokens are used, durations are correct.

When enforcement can be pushed into the token layer and T1 validates token usage, the runtime check is redundant. Look for this before writing a T2 test.

### How it executes

**Per-component (acceptance tests):**

```
enforcement block → ui-contract reads it → generates locked spec → Implementer TDD loop → pass/fail
```

`ui-contract` decides WHERE the rule applies (which components, which ticket). The enforcement block declares WHAT to assert. No `applies` field, no component list — those are contextual decisions belonging to the spec generator.

**Global (assertion suite):**

```
enforcement block → global suite reads it → runs post-merge against all fixtures → pass/fail
```

Global checks run as a script after the Merger merges a round's tickets. They are not generated per-ticket — they exist once and apply always. Failures produce child tickets under the current spec (see [Global T2 lifecycle](#global-t2-lifecycle)).

**Enforcement block format:**

```yaml
tier: T2
scope: per-component | global
assert: "<canonical assertion or description>"
```

- `scope: per-component` — `ui-contract` generates the test per ticket
- `scope: global` — the global assertion suite runs it against all fixtures

**Examples:**

Per-component:

````markdown
- Focus trap in dialogs: Tab cycles within, Escape closes, focus returns to trigger.

  ```enforcement
  tier: T2
  scope: per-component
  assert: "openDialog() → Tab cycles within dialog → Escape closes → focus returns to trigger element"
  ```
````

````markdown
- Card grid: 1 column on mobile, 2 on tablet, 3+ on desktop.

  ```enforcement
  tier: T2
  scope: per-component
  assert: "expectColumnCount(page, { mobile: 1, tablet: 2, desktop: 3 })"
  ```
````

Global:

````markdown
- No axe violations.

  ```enforcement
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — run against every fixture"
  ```
````

````markdown
- No horizontal overflow at any width from 320 to 1440 px.

  ```enforcement
  tier: T2
  scope: global
  assert: "expectNoHorizontalOverflow(page) — run against every fixture at all viewports"
  ```
````

````markdown
- CLS < 0.01 per interaction.

  ```enforcement
  tier: T2
  scope: global
  assert: "recordLayoutShifts(page) → perform interaction → expect CLS < 0.01"
  ```
````

**When the utility doesn't exist yet.** The enforcement block acts as a build checklist. `ui-contract` or the global suite sees an unknown function and flags that the harness needs extending.

### Generalizing beyond UI

T2 is not Playwright-specific. For other stacks, the mechanism changes but the tier contract holds — automated, pass/fail, no LLM:

| Stack | T2 mechanism | Examples |
|---|---|---|
| Web UI | Playwright acceptance tests + global assertion suite | Focus trap, axe scan, CLS, responsive columns |
| Backend API | Integration tests + contract tests | Response time p99 < 200ms, rate limiter returns 429 |
| Mobile | Device emulator tests + snapshot tests | 60fps scroll, offline sync, push notification |
| CLI | Fixture input/output tests | Exit codes, output format, error messages |
| Data / ML | Property-based tests + benchmark suites | Schema validation, accuracy thresholds, memory bounds |

The enforcement block format stays the same. The `assert` field names the mechanism appropriate to the stack. What the suite runner does with it is stack-specific.

---

## T3 — Intent alignment

**Boundary.** The violation requires interpretation. The code may be syntactically correct (passes T1) and behaviorally correct (passes T2), but semantically wrong — a danger token used for a non-error label, an animation that's technically within budget but visually jarring, code that follows the letter of a rule but misses the intent. An LLM reads evidence and makes a structured call.

**Not T3 if:** you can write an automated test that always produces the same pass/fail answer. That means you've found a T2 mechanism — promote it. Not T3 if a regex catches it — promote to T1.

### The scaling constraint

T3 rules are injected into LLM prompts. LLMs degrade silently when context grows — they skip rules, conflate similar checks, hallucinate findings, and drop evidence gathering. None of these produce errors; they produce unreliable enforcement masquerading as reliable enforcement.

The design keeps every T3 evaluation inside the **smart zone** with two hard constraints:

| Constraint | Value | Type | Purpose |
|-----------|-------|------|---------|
| Relevant rules per evaluation | 80 | Hard | LLM attention budget — 80 × 120 tokens avg = 9.6K, leaving room for evidence and reasoning |
| Total T3 rules | 200 | Soft | Maintenance hygiene — warning at 200, CI blocks at 300 |
| Critical rules (triage bypass) | 10 | Hard | Must-check rules that always inject regardless of overflow |
| Scopeless rules (always inject) | 10 | Hard | Prevents scope-gating defeat from "free rider" rules |

### How it executes

A prompt-expansion script (`expand-t3.mjs`) reads all T3 enforcement blocks, filters by `agent`, applies **scope-gating** against the evaluation context, and injects the resulting instructions into `{{T3_VISUAL_CHECKS}}` or `{{T3_REVIEW_CHECKS}}`. The script uses full, uncompressed instructions — T3 exists for nuanced judgment, and compression strips the evaluation protocol.

The expansion has two paths depending on which agent is being prepared:

```
Visual QA expansion:
  all T3 blocks where agent=visual-qa
  → scope-gate against component context (from Planner)
  → ≤80 rules: inject all with full instructions
  → >80 rules: ERROR — scopes are too broad, fix them (see below)

Reviewer expansion:
  all T3 blocks where agent=reviewer
  → scope-gate against git diff --name-only
  → ≤80 rules: inject all with full instructions
  → >80 rules: two-phase triage (see below)
```

**Why the two agents have different overflow strategies:**

Visual-qa rules scope to **components** (`Drawer`, `BookCard`). The Planner already identifies which components a ticket touches. A single component rarely accumulates >80 visual rules (a complex component might have 15–20). If >80 visual-qa rules match, the scopes are too broad — the fix is narrower scopes, not more infrastructure.

Reviewer rules scope to **file patterns** (`src/components/**/*.css`). A cross-cutting refactor (rename all tokens, restructure CSS layers) can legitimately touch every file and trigger 150+ rules. The reviewer needs an overflow strategy that visual-qa doesn't.

#### Scope-gating (both agents, always)

Every T3 rule declares what it applies to. The expansion script intersects the rule's scope with the evaluation context. Rules that don't match are excluded — they don't consume budget, don't distract the LLM, and aren't lost.

For **reviewer** (diff-based): the context is `git diff --name-only`. A rule scoped to `src/**/*.css` is excluded when the diff only touches `.ts` files.

For **visual-qa** (screenshot-based): the context is the component being evaluated (from the Planner's output). A rule scoped to `Drawer` is excluded when visual-qa is evaluating the card grid.

Scope-gating is deterministic, free, and typically eliminates 60–80% of rules.

**Scope specificity requirements:**

- Visual-qa rules **must** scope to component names (`Drawer`, `CardGrid`), not file globs
- Reviewer rules **must** scope to specific file patterns (`src/components/**/*.css`), not `src/**`
- The audit script warns when a scope matches >50% of source files
- Rules without `scope` always inject, counting against the 10-rule scopeless budget

#### Two-phase triage (reviewer only, when >80 rules survive scope-gating)

This handles the cross-cutting refactor case where scope-gating leaves the reviewer with >80 relevant rules.

**Phase 1 — Screen (Haiku, cheap, over-inclusive):**

Haiku receives all surviving rules as one-line `triage_hint` summaries plus the diff. Its job is relevance filtering — not evaluation. It answers: "which of these rules might be violated by these changes?" It is instructed to be over-inclusive: "when uncertain, include the rule."

```
Input:  150 surviving rules (as triage_hints) + diff
Model:  Haiku
Output: list of rule IDs that MIGHT be violated
Budget: ~7K for triage_hints + diff
```

**Phase 2 — Evaluate (Sonnet, precise, bounded):**

The Reviewer (Sonnet) receives only the flagged rules with full, uncompressed instructions plus the diff. Typically 20–40 rules — well within the 80-rule budget.

```
Input:  30 flagged rules (full instructions) + diff
Model:  Sonnet
Output: structured findings with Current:/Fix:
Budget: ~3.6K for instructions — extremely comfortable
```

**If Phase 1 flags >80 rules** (Haiku was very generous): take the top 80 by `priority` field. The rest are logged as "not evaluated — over budget." The morning review sees exactly which rules were skipped and can trigger a re-evaluation if needed. This is bounded, visible signal loss — never silent failure.

**Triage safety mechanisms:**

| Mechanism | What it prevents |
|-----------|-----------------|
| `triage_hint` field | Authored by rule writer, keyword-rich — better matching than auto-generated summaries |
| `critical: true` flag | Up to 10 rules bypass triage entirely — always injected regardless of overflow |
| `group` affinity | If one rule in a group is flagged, all rules in the group are flagged — prevents missing interacting rules |
| Over-inclusive instruction | Haiku is told "when uncertain, include the rule" — biases toward false positives, not false negatives |
| Visible overflow logging | Every skipped rule is logged by ID — morning review sees what was missed |

**The irreducible risk:** Phase 1 can miss a rule (false negative). This cannot be eliminated without parallel evaluations (chunking), which introduces its own problems — parallel Fixers editing the same files, cross-chunk interaction loss, orchestrator complexity. The mitigation stack makes this risk acceptably small: it only matters during reviewer evaluations, only during cross-cutting refactors, only for rules without `critical: true`, only if the `triage_hint` doesn't match the diff.

### What happens on failure

The agent produces a structured finding with `Current:` and `Fix:` fields. The pipeline does not merge the branch.

### Enforcement block format

```yaml
tier: T3
agent: visual-qa | reviewer
scope: "<component name (visual-qa) or file glob (reviewer)>"
group: "<affinity group>"             # optional — keeps interacting rules together in triage
priority: 2                           # optional — 0-4 (0=critical, 4=backlog), default 2. Used for triage overflow ordering
critical: false                       # optional — bypasses triage, always injected (max 10 across project)
triage_hint: "<keywords for Phase 1>" # reviewer rules only — keyword-rich relevance hint for Haiku screening
instruction: "<what to check, what evidence to gather, how to evaluate>"
```

**Field reference:**

| Field | Required | Agent | Purpose |
|-------|----------|-------|---------|
| `agent` | Yes | — | Which agent evaluates this rule |
| `scope` | Yes | Both | What this rule applies to. Component names for visual-qa, file globs for reviewer |
| `instruction` | Yes | Both | Full evaluation protocol — must be specific enough for `Current:` / `Fix:` findings |
| `group` | No | Both | Rules in the same group are triaged together (one flagged = all flagged) |
| `priority` | No | Both | Triage overflow ordering (0=highest, 4=lowest). Default: 2 |
| `critical` | No | Both | Always injected, bypasses triage. Max 10 across project |
| `triage_hint` | No | Reviewer | Keyword-rich relevance hint for Haiku screening. Ignored by visual-qa (which doesn't use triage) |

The `instruction` must be specific enough for the agent to produce a finding with `Current:` and `Fix:` fields. Vague instructions ("check if it looks good") produce unreliable enforcement.

### Promotion pressure

Every T3 rule is a candidate for promotion. If you find yourself writing a protocol that always produces the same answer given the same evidence, that's a sign the rule can be automated. Write the test or lint rule, then promote.

**Quarterly promotion audit.** When total T3 rules exceed 150, run a promotion sprint before adding more:

1. Sort T3 rules by trigger frequency (most-fired first)
2. For each of the top 20: attempt to write a T1 regex or T2 test
3. Promote everything that can be automated
4. Target: keep total T3 count under 200

Signs a T3 rule is promotable:
- The instruction says "check if X equals Y" → that's a T2 assertion
- The instruction says "scan for pattern Z" → that's a T1 regex
- The instruction's judgment call is really just "does the value match one of N valid options" → that's a T2 lookup table
- Every time the rule fires, the finding is the same → the rule is deterministic, not judgmental

### Expansion script contract

The expansion script (`expand-t3.mjs`) runs on the host before the agent starts. It is a text transformer — it produces a prompt payload. It does not spawn LLM calls (Phase 1 triage is the one exception, using Haiku).

| Input | Description |
|-------|-------------|
| Agent name | `visual-qa` or `reviewer` |
| Evaluation context | Component name (visual-qa) or `git diff --name-only` (reviewer) |

| Output | Description |
|--------|-------------|
| Instruction payload | Full instructions for all relevant rules, guaranteed ≤ 80 rules |
| Strategy used | `single` or `triage` — logged for observability |
| Rules excluded | List of rule IDs excluded by scope-gating — logged, not injected |
| Rules not evaluated | List of rule IDs dropped by triage overflow — logged, flagged for morning review |

**Error conditions:**

| Condition | Agent | Response |
|-----------|-------|----------|
| Total T3 rules > 200 | Both | Warning — suggest promotion audit |
| Total T3 rules > 300 | Both | CI error unless `--allow-over-cap` is passed |
| Relevant rules > 80 | Visual-qa | Error — scopes are too broad, fix them |
| Relevant rules > 80 | Reviewer | Two-phase triage (automatic) |
| Rule missing `scope` | Both | Warning — counts against 10-rule scopeless budget |
| Scopeless rules > 10 | Both | Error — too many free riders |
| Critical rules > 10 | Both | Error — triage bypass budget exceeded |

### Examples

````markdown
- Exit is never slower than enter.

  ```enforcement
  tier: T3
  agent: visual-qa
  scope: "Drawer, CardGrid"
  group: motion
  instruction: "For each animated element, call readAnimations() to capture enter and exit durations. Compare: exit duration must be ≤ enter duration. Flag if exit is slower."
  ```
````

````markdown
- Components own no space outside themselves.

  ```enforcement
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.css"
  triage_hint: "Flag when: margin property appears in component CSS, new component root selector added"
  instruction: "Scan component root selectors in the diff for margin properties. A component must not set margin on its own root element — the parent layout owns spacing via gap or padding. Flag any margin on a component root."
  ```
````

````markdown
- Truncated text must have a way to see the full value.

  ```enforcement
  tier: T3
  agent: visual-qa
  scope: "BookCard, Drawer"
  group: truncation
  instruction: "For each element with text-overflow: ellipsis or -webkit-line-clamp, check that hovering or tapping reveals the full text (tooltip, expanded view, or drawer). Flag if truncated text has no disclosure mechanism."
  ```
````

````markdown
- Semantic color usage: danger tokens only for error/destructive states.

  ```enforcement
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: token-semantics
  priority: 1
  triage_hint: "Flag when: danger/error/destructive token referenced, semantic class names change, ARIA role attributes change"
  instruction: "Find uses of --shelf-*-danger tokens. Each must be on an element representing an error, warning, or destructive action. Flag danger tokens used for non-error decorative purposes."
  ```
````

---

## Human

**Boundary.** The rule is genuinely subjective — reasonable people disagree on the answer given the same evidence. No automation or LLM can reliably judge it.

**Not Human if:** an LLM following a structured protocol consistently gets it right. That's T3. Not Human if the rule can be formalized into a test. Promote it.

**How it executes.** The audit script reports these rules for the morning review. Agents may flag potential violations, but the human makes the final call.

```
enforcement block → npm run audit:rules → morning review checklist
```

**Enforcement block format:**

```yaml
tier: Human
review: morning-review
reason: "<why automation can't handle this>"
```

**Examples:**

````markdown
- Use `GLOSSARY.md` terms in UI text.

  ```enforcement
  tier: Human
  review: morning-review
  reason: "Semantic intent — requires understanding what term fits the context"
  ```
````

````markdown
- Keep modules focused on a single responsibility.

  ```enforcement
  tier: Human
  review: morning-review
  reason: "Subjective — reasonable people disagree on responsibility boundaries"
  ```
````

---

## Multi-tier rules

Some rules have multiple facets, each enforceable at a different tier. Each tier catches a genuinely different class of violation:

| Tier | What it catches | Example: "values from tokens" |
|---|---|---|
| T1 | Syntactic violation | Raw `#ff0000` in CSS → hook blocks the write |
| T2 | Runtime mismatch | Computed color doesn't match resolved token → test fails |
| T3 | Semantic misuse | Uses `--shelf-fgColor-danger` for a non-error label → reviewer flags |

Use `---` to separate entries within one enforcement block. Each entry is independent and belongs to exactly one tier. The same assertion never runs at two tiers.

````markdown
- Durations and easing come from motion tokens.

  ```enforcement
  tier: T1
  - pattern: "transition:.*[0-9]+ms"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use var(--shelf-motion-duration-*) instead of raw duration"
  ---
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: motion
  triage_hint: "Flag when: motion/transition/animation token referenced, duration or easing value changes"
  instruction: "Check that motion tokens match the use case: fast for hover/focus, base for panels, slow for large layout shifts. Flag semantic misuse even when the token is syntactically valid."
  ```
````

Note: no T2 entry here. T1 ensures tokens are used. T3 ensures the right token is used for the context. A runtime test would be redundant — if the token is correct, the runtime value is correct by construction.

---

## Audit

`npm run audit:rules` parses all rules files and reports:

- Rules without enforcement blocks (gaps)
- Tier distribution (T1 / T2 / T3 / Human counts)
- T1 blocks missing required fields (`pattern`, `assert`, `scope`)
- T2 blocks missing `scope` or `assert`
- T3 blocks missing `agent`, `scope`, or `instruction`
- T3 blocks without `scope` (always-inject warnings — max 10 scopeless)
- T3 visual-qa blocks using file globs instead of component names
- T3 reviewer blocks missing `triage_hint` (warning — triage quality depends on it)
- T3 scope breadth (warning if a scope matches >50% of source files)
- T3 `critical: true` count (error if > 10)
- Total T3 count (warning if > 200, error if > 300)
- Exit code 0 = complete coverage, exit code 1 = gaps

Run after adding or changing any rule.

---

## Adding a new rule — checklist

1. Write the rule in the appropriate rules file.
2. Apply the sorting test:
   - Can a regex/AST/lint catch it in the source? → **T1**
   - Does it need execution but produces pass/fail mechanically? → **T2**
   - Does it need an LLM to interpret evidence? → **T3**
   - Is it genuinely subjective? → **Human**
3. If T2, determine scope:
   - Is it about a specific component's behavior? → `scope: per-component`
   - Is it a project-wide invariant? → `scope: global`
4. Check for promotion opportunities:
   - Can a T2 rule be caught statically? Promote to T1.
   - Can a T3 protocol be automated into a test? Promote to T2.
   - Does the token system make a runtime check redundant? Eliminate it.
5. If T3, fill the required and recommended fields:
   - `scope` — **required**. Component name for visual-qa (`Drawer`, `BookCard`), file glob for reviewer (`src/components/**/*.css`). Rules without scope always inject and count against the 10-rule scopeless budget.
   - `triage_hint` — **recommended for reviewer rules**. Keyword-rich relevance hint for Haiku screening during two-phase triage. Without it, triage may miss this rule during cross-cutting refactors.
   - `group` — optional. Set when this rule interacts with other rules and they should be triaged together (one flagged = all flagged).
   - `priority` — optional (default 2). Set lower (0–1) for rules that must survive triage overflow ordering.
   - `critical` — optional. Set `true` only for rules that must always be evaluated regardless of overflow. Max 10 across the project.
   - Check total T3 count. If > 150, run a promotion audit before adding.
6. Write the enforcement block.
7. Run `npm run audit:rules` to confirm 0 gaps.
8. Verify:
   - T1: no action — guard script reads rules files directly
   - T2 per-component: `ui-contract` picks it up on the next relevant ticket
   - T2 global: add to the global assertion suite
   - T3: `expand-t3.mjs` picks it up on the next pipeline run (scope-gated, triage-ready)
