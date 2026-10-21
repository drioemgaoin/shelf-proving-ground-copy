# The Enforcement Tiers: How Sandcastle Keeps Code Honest

This document explains the four enforcement tiers (T1, T2, T3, Human) and how they fit into the Sandcastle pipeline. By the end you should understand what each tier catches, why it exists at that level, who or what runs it, and how they all work together so that nothing slips through.

---

## The Big Picture

Think of enforcement tiers like layers of defense in a castle (fitting, since the system is called Sandcastle). Each layer catches a different *kind* of mistake, and they're ordered from cheapest/fastest to most expensive/nuanced:

| Tier | Catches | Enforced by | When it runs | Speed |
|------|---------|-------------|--------------|-------|
| **T1** | Mistakes visible in the raw source text | A hook script (`apply-t1.mjs`) | Instantly, before the file is even saved | Milliseconds |
| **T2** | Mistakes that only appear when the code runs | Automated tests (Playwright, axe-core, helpers) | After merge, in the Global T2 suite — and during the implementer's TDD loop for per-component rules | Seconds to minutes |
| **T3** | Mistakes where the code is technically correct but semantically wrong | An LLM agent (visual-qa or reviewer) | During QA gates, after the implementer finishes | Minutes |
| **Human** | Genuinely subjective calls where reasonable people disagree | A human, in the morning review | Next morning | Hours |

The guiding principle is **promote as far up as you can**. If a regex can catch it, it's T1 — don't waste an LLM on it. If an automated test can give a definitive pass/fail, it's T2 — don't ask an LLM to squint at it. T3 is reserved for judgment calls that still follow structured rules. Human is the last resort.

---

## T1 — Source Text ("The Bouncer")

### What it does

T1 catches violations that are visible in the raw source code. It uses regex pattern matching against file contents. No compilation, no rendering, no running the app — just text matching.

Examples of what T1 catches:
- A raw hex color `#ff0000` in a CSS file (should be a design token like `var(--shelf-fgColor-danger)`)
- A hard-coded `16px` instead of a spacing token
- A `z-index: 999` instead of a layering token
- A comment referencing a ticket ID like `// ships in djk.2`
- An edit to a locked file (acceptance tests, screenshot baselines, rule files)

### Why it exists

T1 is the cheapest possible enforcement. It runs in milliseconds. It catches the agent mid-keystroke — the violating code never even lands on disk. This prevents entire categories of errors from entering the codebase at all, which means every downstream tier has less work to do.

Think of it like a spell-checker that underlines the word *before* you finish typing it. You don't need a proofreader (T3) or a focus group (Human) to tell you that "teh" is misspelled.

### Who triggers it

The **Claude Code hook system**. Specifically, a `PreToolUse` hook runs `apply-t1.mjs` every time the agent tries to use the `Edit`, `Write`, or `MultiEdit` tools. The hook intercepts the tool call, inspects the content about to be written, and either allows it (exit 0) or blocks it (exit 2).

### How it works, step by step

1. The agent (implementer, fixer, anyone editing code) calls a tool to write or edit a file.
2. Before the tool executes, the hook fires.
3. `apply-t1.mjs` reads all rules files (`.claude/rules/ui-base.md`, `.claude/rules/ui-project.md`, etc.).
4. It finds every `enforcement` block tagged `tier: T1`.
5. For each T1 block, it checks: does the file being written match the `scope` glob? Is it excluded by the `exclude` glob?
6. If in scope, it applies each regex `pattern` against the file content (optionally stripping comments or strings first via `strip`).
7. If `assert: absent` and the pattern matches — **blocked**. If `assert: present` and the pattern is missing — **blocked**.
8. On a block, the agent sees a structured rejection message:

```
BLOCKED: T1 violation

file: src/components/Card.css
line: 12
match: "16px"
rule: Every color, size, spacing, radius, shadow, duration and easing comes from a token.
fix: Replace with a --shelf-space-* or --shelf-size-* token from src/styles/tokens.css
```

The agent reads the `fix` instruction, corrects the code, and tries again. Usually succeeds on the second attempt.

### What the output looks like

T1 has no separate output file. It's a gate: either the write goes through, or it doesn't. If it blocks, the rejection message is the output.

### Key thing to remember

T1 only sees text. It cannot reason about whether a token is used for the *right purpose* — that's T3. It can only check that a token is used *at all*.

---

## T2 — Runtime Behavior ("The Test Suite")

### What it does

T2 catches violations that only manifest when the code actually executes. The code might look correct in the source — valid tokens, proper structure — but when the browser renders it, something is wrong. T2 uses automated tests that produce a mechanical pass/fail. No LLM interprets the results.

Examples of what T2 catches:
- An axe-core accessibility violation (missing ARIA labels, insufficient contrast)
- Horizontal overflow at 320px viewport width
- Layout shift above 0.01 during an interaction
- Focus trap not working in a dialog (Tab escapes the modal)
- A pointer target smaller than 24x24 CSS pixels
- Long frames (jank) during an animation

### Why it exists

Some rules can't be checked by looking at source text. You *need* to run the code. "Does this dialog trap focus?" requires actually opening the dialog and pressing Tab. "Does this page overflow at 320px?" requires rendering at that width.

But here's the key distinction from T3: **the answer is mechanical**. Either the axe scan finds violations or it doesn't. Either the element's bounding rect is >= 24px or it isn't. There's no judgment, no "it depends." That's why a test — not an LLM — runs it.

### Who triggers it

T2 has **two scopes**, and each has a different trigger:

**Per-component (during development)**
- Triggered by the **implementer agent** during its TDD loop.
- The ticket lists acceptance tests. The implementer writes code to make them pass.
- These tests are generated by the `ui-contract` skill based on T2 enforcement blocks.
- Example: "Focus moves into the drawer on open, Tab is trapped, Escape closes and returns focus."

**Global (after merge)**
- Triggered by the **Sandcastle orchestrator** in Phase 4 (Global T2).
- After all tickets in an iteration are merged into `main`, the orchestrator runs the full T2 suite against every fixture (`default`, `empty`, `error`, `slow`, `long`, `many`).
- If a test fails, the orchestrator creates a bug issue in the tracker, labeled for the next iteration.
- If the bug was previously filed and now passes, it auto-closes.

### How it works, step by step

**Per-component flow:**
1. The `ui-contract` skill reads T2 enforcement blocks scoped to a component.
2. It generates acceptance test files (e.g., `e2e/acceptance/drawer-focus.spec.ts`).
3. These test files are locked — the implementer cannot edit them.
4. The implementer writes code until the tests pass (TDD: red, green, refactor).

**Global T2 flow:**
1. Phase 3 (Merge) finishes — tickets are merged into `main`.
2. Phase 4 starts: `runGlobalT2()` in `.sandcastle/lib/global-t2.mts`.
3. It runs the global test suite (axe scan, overflow sweep, CLS measurement, etc.) across all fixtures and viewports.
4. It loops up to 5 rounds. Each round:
   - Run the suite.
   - If green: done.
   - If failures: file bug issues for new failures, auto-close bugs that now pass.
   - If infrastructure failure (exit 2): escalate immediately.
5. After 5 rounds still red: escalate to human.

### What the output looks like

Per-component: standard Playwright test results (pass/fail per assertion).

Global T2: bug issues in the tracker with titles like `[Global T2] no-horizontal-overflow — long @ mobile-375`.

### Key thing to remember

T2 is **deterministic**. Same code, same result, every time. If a T2 test is flaky, it's a bug in the test, not a tier design problem. The moment an LLM is needed to interpret the result, it's not T2 — it's T3.

---

## T3 — Intent Alignment ("The Reviewer")

### What it does

T3 catches violations where the code is syntactically correct (T1 passed), behaviorally correct (T2 passed), but **semantically wrong**. The code uses a valid token, but the *wrong* token for the context. The animation works, but the exit is slower than the enter. The component is accessible, but the empty state shows a blank div instead of a designed CTA.

Examples of what T3 catches:
- Using `--shelf-fgColor-danger` (red) for a non-error label (semantic misuse)
- Using `--shelf-motion-duration-slow` for a hover effect that should be `--shelf-motion-duration-fast`
- A missing visual state (no disabled treatment on a button)
- An interactive element whose focus ring is hidden behind a sticky header
- A truncated title with no way to read the full text
- A comment that restates the variable name instead of explaining *why*

### Why it exists

There's a whole class of mistakes that no regex and no mechanical test can reliably catch. They require **judgment** — but structured judgment, not subjective opinion. T3 rules give an LLM a specific instruction ("check that motion tokens match the use case"), specific evidence (the diff, the screenshots), and a specific standard ("fast for hover, base for panels, slow for large layout shifts"). The LLM makes a call. It might occasionally be wrong, but it catches things that would otherwise reach a human reviewer.

This is the tier where the system earns its keep. T1 and T2 are table stakes — any CI system can do those. T3 is what makes the automated pipeline competitive with a thorough human code review.

### Who triggers it

The **Sandcastle orchestrator** triggers T3 as two QA gates after the implementer finishes:

1. **Visual QA gate** — for issues that touch UI (`touchesUI: true`).
2. **Code Review gate** — for all issues.

Each gate follows a **check-fix loop**:
- The **checker** (visual-qa agent or reviewer agent) examines the code/screenshots.
- If it finds issues, a **fixer** agent applies the exact fixes.
- The checker re-examines. This loops up to 5 rounds.
- If still failing after 5 rounds: escalate to human.

### How it works, step by step

**Before the gates run — T3 payload generation:**

1. The orchestrator runs `node scripts/apply-t3.mjs <issueId> <diffRef>`.
2. `apply-t3.mjs` reads all rules files and extracts every `enforcement` block tagged `tier: T3`.
3. It splits them by `agent`: visual-qa rules go in one file, reviewer rules in another.
4. **Scope-gating** filters out irrelevant rules:
   - Visual-qa: rules are grouped by `group` (e.g., "motion", "states", "truncation").
   - Reviewer: rules are matched against `git diff --name-only`. A rule scoped to `src/**/*.css` is excluded if the diff only touches `.ts` files.
5. **Budget enforcement**: max 300 total T3 rules, max 80 relevant rules per evaluation. If over budget, a two-phase triage kicks in where a fast model (Haiku) screens rules using `triage_hint` fields, and only flagged rules go to the full evaluator.
6. The filtered rules are written to `.sandcastle/payloads/<issueId>/visual-qa.md` and `reviewer.md`.
7. These payloads are injected into the agent prompts as `{{T3_VISUAL_CHECKS}}` and `{{T3_REVIEW_CHECKS}}`.

**Visual QA gate (if UI was touched):**

1. The visual-qa agent starts the dev server (`npm run dev`).
2. It runs `npm run ui:qa -- --grep "@visual.*@{issueId}"` — exactly once, no re-runs.
3. It reads `.ui-qa/report.json` (Playwright's structured output).
4. For each regression, it classifies: Flaky? Regression? Contract gap?
5. For regressions: it traces to root cause (CSS rule, token, layout issue), checks the finding against the T3 rules from the payload, and writes a diagnosis.
6. Output goes to `.qa/visual-r1.md` with a `PASS`, `FAIL`, or `DEFER` verdict.
7. If `FAIL` with fixable findings: the visual fixer applies exact fixes and commits.
8. The loop repeats (round 2, 3...) until `PASS` or escalation.

**Code Review gate (all issues):**

1. The reviewer agent scans for locked file edits first (immediate violation if found).
2. It reviews the diff against two axes: **Standards** (project coding rules) and **Spec** (does the code match the issue requirements?).
3. It evaluates each T3 rule from the payload against the diff.
4. Output goes to `.qa/review-r1.md` with a `CLEAN`, `FINDINGS`, or `DEFER` verdict.
5. If `FINDINGS`: the code fixer applies fixes, runs verification (`typecheck`, `lint`, `test`, behavioral Playwright tests), and commits.
6. The loop repeats until `CLEAN` or escalation.

**Oscillation detection:** If round N finds the same issue in the same file as round N-1, the system escalates instead of looping forever. This prevents the checker and fixer from disagreeing in circles.

### What the output looks like

Findings files at `.qa/visual-r{round}.md` and `.qa/review-r{round}.md`. Each finding includes:
- A rule reference in brackets: `[.claude/rules/ui-base.md > Values > values-from-tokens]`
- File and line number
- What was found
- The exact fix instruction

### Key thing to remember

T3 is **structured judgment, not opinion**. Every T3 rule has a concrete `instruction` that specifies what to look for, what counts as a violation, and what correct looks like. If the instruction is vague, the results will be vague — that's a rule quality problem, not a tier problem.

---

## Human — Not Automatable ("The Morning Coffee")

### What it does

Human-tier rules cover genuinely subjective decisions where reasonable, informed people would disagree given the same evidence. No amount of AI sophistication makes these automatable — not because the technology isn't good enough, but because the answer genuinely depends on human context, taste, or stakeholder intent.

Examples:
- Does this UI text use the right term from the glossary, or does a synonym read more naturally here?
- Did the agent run exactly the ticket's listed tests — no more, no fewer?
- Did the builder delegate to visual-qa before finishing? (A workflow step visible only in execution logs.)

### Why it exists

The Human tier is the system being honest about its own limits. It would be tempting to throw an LLM at every rule and call it a day, but some checks require understanding intent, context, or nuance that even the best structured prompt can't capture reliably. Forcing these into T3 would produce noisy results — false positives that erode trust and false negatives that provide false confidence.

The `reason` field in each Human-tier block explains *why* automation can't handle it. This isn't just documentation — it's an invitation. If tooling evolves and the reason no longer holds, the rule can be promoted to T3 or even T2.

### Who triggers it

**You** — the human developer — during the morning review. After Sandcastle runs overnight, you review the branch, check every new screenshot, and merge. Human-tier rules are the items on your mental checklist.

The audit script (`bd doctor --check=conventions` or the rules audit) surfaces Human-tier rules so they're visible, but enforcement is manual.

### What the output looks like

Nothing automated. The Human tier is a contract between the system and the developer: "We've automated everything we can. These items are yours."

---

## How the Tiers Work Together

Here's the full picture of a single ticket flowing through the pipeline:

```
┌──────────────────────────────────────────────────────────────────┐
│  Implementer writes code (TDD loop)                             │
│                                                                  │
│  ┌─ T1 ─────────────────────────────────────────────────────┐   │
│  │ Every Edit/Write tool call passes through apply-t1.mjs.  │   │
│  │ Violations are blocked instantly. The agent retries.      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ T2 (per-component) ─────────────────────────────────────┐   │
│  │ The agent runs acceptance tests: npx playwright test -g   │   │
│  │ "<test name>". Tests are locked — can't be edited.        │   │
│  │ Red → write code → green → next test.                     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Implementer signals COMPLETE.                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  T3 payload generation (apply-t3.mjs)                           │
│  Scope-gate + triage → visual-qa.md + reviewer.md payloads      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  T3 — Visual QA gate (if UI changed)                            │
│  Check → Fix → Re-check loop, up to 5 rounds.                   │
│  PASS / DEFER / escalate.                                        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  T3 — Code Review gate (all issues)                             │
│  Check → Fix → Re-check loop, up to 5 rounds.                   │
│  CLEAN / DEFER / escalate.                                       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Merge — push, PR, merge into main, close issue                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  T2 (global) — Post-merge regression suite                      │
│  Axe scan, overflow sweep, CLS, target size — all fixtures.     │
│  Failures become bug tickets for the next iteration.             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Human — Morning review                                         │
│  Review screenshots, check glossary terms, verify workflow.      │
└──────────────────────────────────────────────────────────────────┘
```

### The Promotion Principle

Rules should live at the **highest tier that can reliably enforce them**:

- Can a regex catch it in source text? → **T1**. Don't waste runtime.
- Need to run the code, but the answer is always mechanical pass/fail? → **T2**. Don't waste an LLM.
- Syntactically and behaviorally correct, but an LLM can reliably judge with a structured instruction? → **T3**. Don't waste a human.
- Genuinely subjective, reasonable people disagree? → **Human**. Be honest.

Moving a rule *up* (e.g., T3 → T2) is always a win: faster, cheaper, more reliable. The `reason` field in Human-tier blocks and the `instruction` quality in T3 blocks are designed to make promotion easy when tooling improves.

### Multi-Tier Rules

Some rules have facets at multiple tiers. Each tier catches a genuinely different failure mode of the same concept:

**Example: "Values come from tokens"**

| Tier | What it catches | How |
|------|----------------|-----|
| T1 | Raw `#ff0000` in CSS | Regex blocks the write |
| T3 (reviewer) | Using `--shelf-fgColor-danger` for a non-error label | LLM checks semantic role against the token tables |

T1 ensures tokens are *used*. T3 ensures the *right* token is used. No T2 entry needed — if the token is correct, the runtime value is correct by construction.

**Example: "Focus management"**

| Tier | What it catches | How |
|------|----------------|-----|
| T2 | Focus doesn't move into dialog, Tab escapes, Escape doesn't return focus | Playwright test: mechanical pass/fail |
| T3 (visual-qa) | Focus ring hidden behind a sticky header | LLM examines screenshot after tabbing |

T2 checks the *programmatic* behavior. T3 checks the *visual* result. Both are needed because a focus ring can be programmatically correct but visually occluded.

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Where are the rules defined? | `.claude/rules/ui-base.md` (universal) and `.claude/rules/ui-project.md` (this project) |
| Where does T1 run? | `.claude/hooks/apply-t1.mjs` — a PreToolUse hook |
| Where does T2 (per-component) run? | In the implementer's TDD loop, via Playwright |
| Where does T2 (global) run? | `.sandcastle/lib/global-t2.mts` — Phase 4 of the pipeline |
| Where does T3 payload generation happen? | `scripts/apply-t3.mjs` |
| Where do T3 findings land? | `.qa/visual-r{round}.md` and `.qa/review-r{round}.md` |
| Where does the T3 budget live? | Max 300 total T3 rules, max 80 per evaluation |
| What's the escalation path? | 5 rounds of check-fix → `ready-for-human` label → morning review |
| How do I add a new rule? | Add an `enforcement` block to the appropriate rules file. Choose the tier by asking: can a regex catch it? Can a test catch it? Does it need judgment? |
