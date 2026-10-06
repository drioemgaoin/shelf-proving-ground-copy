# Sandcastle Pipeline Architecture

## Table of Contents

- [Overview](#overview)
- [Infrastructure](#infrastructure)
  - [Tracker integration](#tracker-integration)
  - [Docker sandbox](#docker-sandbox)
  - [Prompt expansion](#prompt-expansion)
  - [Logging and stats](#logging-and-stats)
- [Prerequisites](#prerequisites)
- [Phase 1: Planner](#phase-1-planner)
- [Phase 2: Implementer](#phase-2-implementer)
  - [Rules enforced](#rules-enforced) (T1 hooks, T1 lint/tsc, T2 per-component acceptance tests)
- [Phase 3: Visual Gate](#phase-3-visual-gate-ui-tickets-only) (UI tickets only)
  - [3a. Visual QA](#3a-visual-qa) — [Rules enforced](#rules-enforced-1) (T3 judgment only)
  - [3b. Fixer](#3b-fixer-after-visual-qa)
- [Phase 4: Code Gate](#phase-4-code-gate-all-tickets) (all tickets)
  - [4a. Reviewer](#4a-reviewer) — [Rules enforced](#rules-enforced-t3--judgment-via-structured-assertion-protocols) (T3 judgment)
  - [4b. Fixer](#4b-fixer-after-review)
- [Fixer (shared role)](#fixer-shared-role)
  - [Report contract](#report-contract-both-gates)
- [Phase 5: Merger](#phase-5-merger)
- [Global T2 suite](#global-t2-suite)
- [Enforcement Philosophy](#enforcement-philosophy)
  - [Rules requiring human judgment](#rules-requiring-human-judgment)
  - [Escalation path](#escalation-path)
- [Replay and debugging](#replay-and-debugging)

---

## Overview

Sandcastle is an autonomous build pipeline that takes tickets from a DAG-based tracker (Beads or GitHub), implements them in parallel Docker sandboxes, validates the work through two QA gates, and merges the results. It loops until the backlog is drained.

Three nesting levels control the pipeline:

```
OUTER LOOP (max 10 rounds per spec)
│
├─ Planner (1 run, Opus)
│
├─ per ticket (parallel):
│  │
│  ├─ Implementer (up to 100 iterations, Opus)
│  │   └─ T1 hooks + lint/tsc + per-component T2 acceptance tests (TDD loop)
│  │
│  ├─ Visual Gate — UI tickets only (max 3 rounds):
│  │  └─ Visual QA (up to 10 iter, Sonnet) → Fixer (up to 20 iter, Opus→Haiku)
│  │     T3 only — judgment on screenshots, motion, product patterns
│  │
│  ├─ Code Gate — all tickets (max 3 rounds):
│  │  └─ Reviewer (1 iter, Sonnet) → Fixer (up to 20 iter, Opus→Haiku)
│  │     T3 only — judgment on code semantics, spec compliance
│  │
│  └─ escalate if gate exhausts rounds or oscillates
│
├─ Merger (up to 3 iterations, Opus)
│
├─ Global T2 suite (script, no LLM)
│  ├─ PASS → spec complete (if all tickets closed), or next round
│  └─ FAIL → create fix tickets as children of the spec → next round
│
└─ more unblocked tickets or global T2 fix tickets? → loop
```

- **Outer loop** — drains a spec's tickets. Each round, the Planner picks all unblocked tickets, they execute in parallel, the Merger integrates, the global T2 suite validates the merged result, and newly unblocked tickets (or global T2 fix tickets) feed the next round. A spec is complete when all its child tickets are closed AND global T2 passes on the merged result. Per-ticket status is ephemeral — reset each round. The persistent state is in the tracker (open/closed/labels), not the orchestrator.
- **Gate loops** — each gate (Visual, Code) runs up to 3 rounds of QA→Fixer. If the QA agent finds issues, the Fixer applies them; the QA agent re-checks. Escalates after 3 rounds or on oscillation. Both gates run T3 checks only — no T2 work.
- **Global T2 suite** — runs after the Merger as a script (no LLM). Validates page-level invariants (axe, CLS, overflow, zoom) on the merged result. Failures become child tickets of the current spec, fixed in the next round. See [Global T2 suite](#global-t2-suite).
- **Agent iterations** — per-run tool call budget. The Implementer gets 100 (TDD loop), the Fixer gets 20 (fix + verify loop), QA agents get 1–10 (diagnosis is bounded).
- **Context limit** — the orchestrator checks token usage after each agent iteration. If context exceeds 100K tokens, the agent is killed, partial work is preserved on the branch, and the ticket is escalated. Applies generically to all agent invocations (only Implementer and Fixer are likely to trigger it).

**Five roles, four prompts.** Planner, Implementer, Visual QA, Reviewer, and Fixer. The Fixer is a single role with a single prompt (`fix-prompt.md`) — it handles both visual and code review findings. The orchestrator calls it twice per ticket with different `{{FINDINGS_FILE}}` and `{{VERIFY_COMMAND}}` values.

**Cost model.** Diagnosis is expensive; applying a prescription is cheap. The pipeline pushes all diagnostic work into the QA agents (Sonnet) and the Implementer (Opus). The Fixer is a mechanical applicator — target is Haiku.

| Role | Model | Reads rules? | Reads code? | Cost |
|---|---|---|---|---|
| Planner | Opus | No | No (reads DAG) | Low (1 run) |
| Implementer | Opus | Yes | Yes (TDD loop) | High, justified |
| Visual QA | Sonnet | Yes | Yes (source) | Medium, justified |
| Reviewer | Sonnet | Yes | Yes (diff) | Medium, justified |
| Fixer | Opus\* | No | Minimal\*\* | Cheap (target: Haiku) |
| Merger | Opus | No | No | Low (up to 3 iterations) |

\* Currently Opus, goal is Haiku once reports are self-contained. The 20-iteration budget enforces this — if reports are truly self-contained, 20 is sufficient. If agents consistently need more, the report contract is broken.
\*\* Opens only the specific `file:line` from the report. Never reads rule files, never greps.

---

## Infrastructure

### Tracker integration

The orchestrator is tracker-agnostic. Six commands are configured at the top of `main.mts`:

| Command                | Beads                                | GitHub equivalent                                          |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `VIEW_TASK_COMMAND`    | `bd show <ID>`                       | `gh issue view <ID>`                                       |
| `LIST_READY_COMMAND`   | `bd ready --json --label=Sandcastle` | `gh issue list --label=Sandcastle --state=open --json ...` |
| `CLOSE_TASK_COMMAND`   | `bd close <ID> --reason="..."`       | `gh issue close <ID> --comment="..."`                      |
| `COMMENT_TASK_COMMAND` | `bd update <ID> --notes "<COMMENT>"` | `gh issue comment <ID> --body "<COMMENT>"`                 |
| `CREATE_BUG_COMMAND`   | `bd create --type=bug ...`           | `gh issue create --label=bug ...`                          |
| `LABEL_TASK_COMMAND`   | `bd label add <ID> ready-for-human`  | `gh issue edit <ID> --add-label ready-for-human`           |

Tickets form a DAG. The Planner picks the next ready ticket(s) by:

1. Querying the tracker for all open tickets
2. Filtering to tickets whose blockers are all closed
3. Filtering to tickets that are unclaimed
4. Sorting by priority (then by creation date as tiebreaker)
5. Selecting all unblocked tickets with no mutual dependencies for parallel execution in the same round

### Docker sandbox

Each ticket gets its own sandbox (Docker container with a bind-mounted git worktree). A warm image pre-bakes `node_modules` and `.beads` so containers start in 2–3s.

**Sandbox lifecycle:**

1. `createSandbox()` — creates a worktree on `sandcastle/issue-{id}` branch, starts container
2. `onSandboxReady` hooks — symlink node_modules from warm image, init beads, set backpressure baseline
3. Agents run inside the container sequentially (Implementer → Visual QA → Fixer → Reviewer → Fixer)
4. `sandbox.close()` — stops container, worktree persists for merge phase

**Overlay mode** (`--overlay`): copies uncommitted host files (prompts, rules, hooks, skills, tests) into worktrees, hiding them from git with `skip-worktree`. Used during development to iterate on prompts without committing.

**Worktree exclusions**: tracked files agents don't need (human docs, IDE configs) are removed on sandbox start. List is in `WORKTREE_EXCLUDE` in `main.mts`.

### Prompt expansion

Three-stage expansion happens on the host before the agent runs:

1. `{{VAR}}` substitution — planner output, issue details, codemap, etc.
2. `` !`cmd` `` shell expansion — runs on host (e.g., `git log`, `git diff`) so the agent gets pre-computed context
3. T3 rule injection — `expand-t3.mjs` scope-gates T3 enforcement blocks against the evaluation context and injects the relevant instructions into `{{T3_VISUAL_CHECKS}}` or `{{T3_REVIEW_CHECKS}}`. For visual-qa, scope-gating uses the component context from the Planner. For reviewer, it uses `git diff --name-only`. If >80 reviewer rules survive scope-gating (cross-cutting refactors), the script runs a two-phase triage: Haiku screens rules for relevance, then only flagged rules are injected with full instructions. See `enforcement-tiers.md` > T3 for the full design.

Expanded prompts are saved to `.sandcastle/logs/{issueId}/{phase}.prompt.md` for inspection and replay.

### Logging and stats

Every agent run is timed and logged with token usage, cache stats, context window size, and estimated cost. The `logRunStats` function derives pricing from model name patterns — adding a new model/provider requires only adding a row to `MODEL_PRICING`.

A "smart zone" flag warns when context exceeds 100K tokens.

---

## Prerequisites

The pipeline assumes enforcement infrastructure exists before it runs. This section is the implementation spec — each subsection describes exactly what to create and how to verify it works. Missing items mean the corresponding rules are unenforced — the pipeline won't fail, it will silently skip enforcement.

**Current state:** `.claude/hooks/guard.mjs` (contract protection hook) and the T2 test harness already exist. The items below marked **TODO** must be implemented before the pipeline enforces the full rule set.

### T1 — Deterministic (blocks before code lands)

#### PreToolUse hooks — TODO

Add 5 PreToolUse entries to `.claude/settings.json` under `hooks.PreToolUse`. Each entry runs a small shell command that greps the file content being written. Exit code 2 blocks the write; stderr is shown to the agent as the rejection reason.

The existing `guard.mjs` hook (contract protection) must remain as-is. Add the new hooks as separate entries in the same `PreToolUse` array.

**Hook format** (each is one entry in the `PreToolUse` array):

```jsonc
{
  "matcher": "Edit|Write|MultiEdit",
  "hooks": [{
    "type": "command",
    "command": "<shell one-liner that exits 2 on violation>"
  }]
}
```

The hook receives JSON on stdin with `tool_input.file_path` and `tool_input.new_string` (for Edit) or `tool_input.content` (for Write). The command must parse these to check the content being written.

**Hooks to implement:**

| # | Hook | Files | Rejects when | Allows | Error message must say |
|---|---|---|---|---|---|
| 1 | Raw values | `src/**/*.css` (not `tokens.css`) | Content contains raw `px`, `rem`, or hex color (`#[0-9a-fA-F]{3,8}`) values | `var(--shelf-*)` references, `0px`, values inside `tokens.css` | "Use a token from tokens.css. See ui-base.md > Values." |
| 2 | `any` type | `src/**/*.ts`, `src/**/*.tsx` | Content contains `: any`, `<any>`, `as any` | `unknown`, type guards | "No `any` types. Use `unknown` and narrow. See CODING_STANDARDS.md > TypeScript." |
| 3 | Unsafe `as` | `src/**/*.ts`, `src/**/*.tsx` | Content contains `as <Identifier>` type assertions | `as const`, `satisfies` | "No unsafe `as` casts. Use `satisfies` or a type guard. See CODING_STANDARDS.md > TypeScript." |
| 4 | Token namespace | `src/**/*.css` (not `tokens.css`) | Content contains `--` custom property not prefixed `--shelf-` | `var(--shelf-*)`, standard CSS properties | "All custom properties must use the `--shelf-` prefix. See ui-project.md > Namespace." |
| 5 | z-index | `src/**/*.css` | Content contains `z-index:` with a raw number instead of `var(--shelf-z-*)` | `z-index: var(--shelf-z-*)` | "Use `var(--shelf-z-*)` tokens for z-index. See ui-project.md > Spacing, radius, elevation." |

**Implementation approach:** Each hook can be a standalone Node script in `.claude/hooks/` (e.g., `check-raw-values.mjs`) or an inline shell command. A script is preferred for testability. The script reads JSON from stdin, extracts `file_path` and the content being written, applies the regex, and exits 0 (allow) or 2 (block with stderr message).

**Verify:** For each hook, attempt an Edit that violates the rule (e.g., write `color: #ff0000` in a component CSS file). The hook must reject it. Then attempt a valid edit (e.g., `color: var(--shelf-fgColor-default)`). The hook must allow it.

#### Lint configuration

**ESLint (`eslint.config.js`) — TODO: add rules.** The config exists but only uses `recommended` presets. Add these rules:

```js
rules: {
  // ... existing rules ...
  'camelcase': ['error', { properties: 'never', ignoreDestructuring: true }],
  'no-nested-ternary': 'error',
  'no-restricted-syntax': ['error', {
    selector: 'ExportDefaultDeclaration',
    message: 'Use named exports. See CODING_STANDARDS.md > Style.'
  }],
}
```

Note: `camelcase` enforces camelCase for variables/functions. PascalCase for components is already enforced by `react-refresh/only-export-components`. If a dedicated naming-convention plugin is needed (e.g., `@typescript-eslint/naming-convention`), install it.

**Verify:** Create a test file with `export default function foo() {}`, a nested ternary `a ? b ? c : d : e`, and a `snake_case` variable. Run `npm run lint`. All three must error.

**Stylelint — TODO: install and configure.** Stylelint is not installed. Steps:

1. Install: `npm install -D stylelint stylelint-config-standard`
2. Create `.stylelintrc.json`:

```json
{
  "extends": "stylelint-config-standard",
  "rules": {
    "at-rule-no-unknown": [true, { "ignoreAtRules": ["layer"] }],
    "property-no-unknown": true
  },
  "overrides": [
    {
      "files": ["src/**/*.css"],
      "rules": {
        "comment-empty-line-before": null
      }
    }
  ]
}
```

3. Add a custom plugin or rule to enforce: (a) `@keyframes` must be inside `@layer`, (b) animation properties may only animate `transform` and `opacity`. If no off-the-shelf stylelint rule covers these, write a local plugin in `scripts/stylelint/` or enforce them via the PreToolUse hooks instead.
4. Update `"lint"` in `package.json` to `"eslint . && stylelint 'src/**/*.css'"`. No separate `lint:css` script — the pipeline only calls `npm run lint`.

**Verify:** Create a CSS file with `@keyframes spin { ... }` outside any `@layer`. Run `npm run lint`. It must error.

**TypeScript (`tsconfig.json`) — DONE.** `"strict": true` is already enabled.

### T2 — Runtime behavior (pass/fail, no LLM)

T2 has two scopes. Per-component checks run in the Implementer's TDD loop. Global checks run post-merge as a script. Both are automated pass/fail — no LLM interprets the result. See `enforcement-tiers.md` for the full tier model.

#### Test harness (`e2e/support/`) — DONE

All required utilities exist in `e2e/support/ui.ts`:

| Capability | Function | Used by | Status |
|---|---|---|---|
| axe-core integration | `AxeBuilder` from `@axe-core/playwright` | Global T2 suite | Done |
| CLS measurement | `recordLayoutShifts`, `layoutShift` | Global T2 suite | Done |
| Long frame detection | `measureFrames` (> 50ms gaps) | Global T2 suite | Done |
| Viewport overflow check | `expectNoHorizontalOverflow` | Global T2 suite | Done |
| 200% zoom check | Via Playwright "zoom-200" project | Global T2 suite | Done |
| Fixture system | `?fixture=` parameter in app code | Both | Done |

#### Per-component: Acceptance test specs (`e2e/acceptance/`)

Generated per ticket by the `ui-contract` skill. Each spec is a locked file the Implementer reads but cannot modify. The specs exercise per-component T2 rules (states, focus behavior, responsive layout, product patterns).

**Dependency:** `ui-contract` must run for each ticket *before* the pipeline picks it up. This happens during the day shift (spec → contract → tickets workflow).

#### Global: Assertion suite — TODO

A script that runs all global T2 checks against every fixture on the merged branch. Runs post-merge, not per-ticket. Uses the test harness utilities above. Failures produce child tickets under the current spec.

**To implement:** a Playwright spec file (e.g., `e2e/global/invariants.spec.ts`) that iterates over all fixtures and viewports, running axe, CLS, overflow, zoom, and long-frame checks. A runner script (`scripts/global-t2.mjs`) starts the dev server, runs this spec, and outputs machine-readable failure descriptions for the orchestrator to create tickets from.

#### Playwright configuration — DONE

| Item | File | Status |
|---|---|---|
| Project setup | `playwright.config.ts` | Done — mobile (375×812), tablet (768×1024), desktop (1280×800) |
| Color schemes | `playwright.config.ts` | Done — includes "dark" project with `colorScheme: 'dark'` |
| Tag conventions | `playwright.config.ts` | Done — `@visual`, `@layout`, `@a11y`, `@motion`, `@stability`, `@perf` tags routed by grep |
| Screenshot baselines | `e2e/__screenshots__/` | Initial baselines created on first run; merged baselines are the ground truth |
| Report output | `.ui-qa/report.json` | Produced by `scripts/ui-qa/run.mjs` (`npm run ui:qa`), not by Playwright directly |

### T3 — Judgment (structured assertion protocols)

T3 enforcement is injected into agent prompts by `expand-t3.mjs` at expansion time. Rules are authored as enforcement blocks in rules files (see `enforcement-tiers.md` > T3) and automatically scope-gated against the evaluation context — no manual prompt updates needed when rules change.

| Agent | Injection target | Scope-gating context | Overflow strategy |
|---|---|---|---|
| Visual QA | `{{T3_VISUAL_CHECKS}}` | Component name from Planner | Error if >80 — fix scopes |
| Reviewer | `{{T3_REVIEW_CHECKS}}` | `git diff --name-only` | Two-phase triage (Haiku screen → Sonnet eval) |

**Constraints enforced by `expand-t3.mjs`:**
- Max 80 relevant rules per evaluation (hard — LLM attention budget)
- Max 10 scopeless rules (hard — prevents scope-gating defeat)
- Max 10 `critical: true` rules (hard — triage bypass budget)
- Total T3 rules: warning at 200, CI error at 300

**Dependency:** `expand-t3.mjs` must exist and be called during prompt expansion (stage 3). Rules files must contain properly formatted enforcement blocks. The audit script (`npm run audit:rules`) validates block format, scope specificity, and budget compliance.

### Host dependencies (not in the repo)

These must be available on the machine running the pipeline:

| Dependency | Used by | Check |
|---|---|---|
| Node.js (≥ 18) | Everything | `node --version` |
| Python 3 | `codemap-tool/codemap-gen.py` (codemap generation for Implementer) | `python3 --version` |
| Docker | Sandbox containers | `docker info` |
| `bd` (Beads CLI) | Tracker commands in `main.mts` | `bd --version` |
| Dolt | Beads storage backend | `dolt version` |

### Bootstrapping checklist

Before running the pipeline on a new project or after adding rules:

```
[ ] PreToolUse hooks in .claude/settings.json — 5 regex hooks (raw values, any, as, namespace, z-index)
[ ] ESLint config — camelcase, no-nested-ternary, no default exports
[ ] Stylelint installed and configured — @keyframes in @layer, transform/opacity only
[ ] tsconfig.json — strict mode enabled [DONE]
[ ] e2e/support/ — axe, CLS, long frames, viewport, zoom utilities [DONE]
[ ] playwright.config.ts — viewports, color schemes, tag conventions, report output [DONE]
[ ] Fixture system — ?fixture= parameter wired to deterministic API states [DONE]
[ ] Global T2 suite — e2e/global/invariants.spec.ts + scripts/global-t2.mjs [TODO]
[ ] expand-t3.mjs — T3 expansion script with scope-gating + triage [TODO]
[ ] T3 enforcement blocks — all T3 rules as enforcement blocks in rules files with scope, triage_hint [TODO]
[ ] visual-qa-prompt.md — contains {{T3_VISUAL_CHECKS}} placeholder for injection [DONE]
[ ] review-prompt.md — contains {{T3_REVIEW_CHECKS}} placeholder for injection [DONE]
[ ] Host deps — Node, Python 3, Docker, bd, Dolt installed
[ ] Smoke test: run pipeline on a single ticket, verify all tiers catch violations
```

---

## Phase 1: Planner

Reads the backlog, builds a dependency graph, and selects all unblocked tickets for parallel execution in the current round.

**Prompt:** `plan-prompt.md`<br/>
**Model:** Opus<br/>
**Iterations:** 1<br/>
**Input:** Pre-expanded list of ready issues (from `LIST_READY_COMMAND` run on host)<br/>
**Output:** `<plan>` JSON block validated against a Zod schema

### What it does

1. Receives the full list of ready issues as JSON
2. Builds a dependency graph — issue B is blocked by A if B requires code A introduces, they touch overlapping files, or B depends on a decision A establishes
3. Selects all unblocked issues for parallel execution
4. For each issue, assigns:
   - `id` and `title` — from the tracker
   - `branch` — deterministic: `sandcastle/issue-{id}` (so re-planning preserves accumulated progress)
   - `touchesUI` — whether the Visual Gate should run (hint: `ui` label)
   - `scope` — glob pattern for codemap generation (e.g., `src/**`, `src/api.ts,src/fixtures.ts`)

### Output schema

```ts
{
  issues: Array<{
    id: string;
    title: string;
    branch: string;
    touchesUI: boolean;
    scope: string; // defaults to "src/**"
  }>;
}
```

If no issues are unblocked, outputs `{"issues": []}` and the run exits.

### Single mode

`--single` flag: only the first unblocked issue is picked, then the pipeline stops after that round.

---

## Phase 2: Implementer

Builds the feature using strict TDD — picks one acceptance test at a time, writes the minimum code to pass it, and repeats until the ticket is done.

**Prompt:** `implement-prompt.md`<br/>
**Model:** Opus<br/>
**Iterations:** up to 100<br/>
**Input:** Issue details (pre-expanded on host), codemap (generated on host), coding standards, recent commits<br/>
**Output:** Commits on the issue branch

### What it does

Implements the ticket using strict TDD:

1. Reads the locked acceptance spec for the ticket (`e2e/acceptance/`)
2. Picks one test, writes the minimum code to pass it, runs it
3. Repeats until all ticket tests pass
4. Pre-commit checks: `npm run typecheck && npm run lint && npm run test`
5. Commits with prefix `RALPH:`

### Boundaries

| Category                        | Rule                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| **Opaque** (don't read or edit) | `e2e/support/`, `scripts/ui-qa/`, `playwright.config.ts`, config files |
| **Locked** (read only)          | `e2e/acceptance/`                                                      |
| **Forbidden commands**          | `npm run ui:qa`, any `@visual` tagged test, issue tracker commands     |
| **No exploration**              | Don't browse file tree, read configs, or search for tooling            |

### Codemap

Generated on the host before the agent runs, using `codemap-gen.py` with the scope from the planner. Provides file structure and function signatures so the agent skips file exploration. Tests are included in the codemap only if the issue mentions tests.

### Rules enforced

The Implementer enforces rules at two tiers: T1 (deterministic, blocks before code lands) and T2 per-component (acceptance tests, pass/fail at runtime). It does not run global T2 checks — those run post-merge. See `enforcement-tiers.md` for the full tier model.

#### T1 — PreToolUse hooks (reject file writes via grep/regex)

| Hook            | What it blocks                                                 | Rule source                                  |
| --------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Raw values      | `px`/`rem`/hex color values in component CSS (must use tokens) | `ui-base.md` > Values                        |
| `any`           | Explicit or implicit `any` in TypeScript                       | `CODING_STANDARDS.md` > TypeScript           |
| Unsafe `as`     | Type assertions (must use `satisfies` or `as const`)           | `CODING_STANDARDS.md` > TypeScript           |
| Token namespace | CSS custom properties missing `--shelf-` prefix                | `ui-project.md` > Namespace                  |
| z-index         | Raw z-index values (must use `var(--shelf-z-*)`)               | `ui-project.md` > Spacing, radius, elevation |

Zero-cost enforcement — the write is rejected before it happens.

#### T1 — Lint and type-check (run before commit)

| Check          | What it catches                                                 | Rule source                                               |
| -------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Lint/stylelint | `@keyframes` outside `@layer`, non-transform/opacity animations | `CODING_STANDARDS.md` > Components, `ui-base.md` > Motion |
| Lint/ESLint    | camelCase/PascalCase violations, nested ternaries               | `CODING_STANDARDS.md` > Style                             |
| `tsc --strict` | Missing parameter/return types, implicit `any`                  | `CODING_STANDARDS.md` > TypeScript                        |

#### T2 per-component — Acceptance tests (pass/fail at runtime, TDD loop)

These are per-component checks generated by `ui-contract` as locked specs. The Implementer runs them during TDD. Global T2 checks (axe, CLS, overflow, zoom) run post-merge as a separate suite — not here.

| Rule                                                                 | Rule source                        |
| -------------------------------------------------------------------- | ---------------------------------- |
| Interactive states (default, hover, focus-visible, active, disabled) | `ui-base.md` > States              |
| Data view states (loading, empty, error, populated)                  | `ui-base.md` > States              |
| Focus visible, not hidden under sticky elements                      | `ui-base.md` > A11y                |
| Focus trap in dialogs, return to trigger on close                    | `ui-base.md` > A11y                |
| Responsive grid columns (1 mobile, 2 tablet, 3+ desktop)             | `ui-project.md` > Viewports        |
| Light and dark color modes                                           | `ui-project.md` > Color roles      |
| Toasts: bottom-center, 4s, auto-dismiss                              | `ui-project.md` > Product patterns |
| Destructive confirmations: inline undo via toast                     | `ui-project.md` > Product patterns |
| Form validation: blur + submit, error below field                    | `ui-project.md` > Product patterns |
| Drawer: right on desktop, bottom on mobile                           | `ui-project.md` > Product patterns |
| Dialog: centered, focus-trapped, Escape closes                       | `ui-project.md` > Product patterns |

Note: "Reduced motion" and "durations/easing from motion tokens" are enforced via T1 (token usage) + token design (tokens handle reduced-motion). See the token-promotion pattern in `enforcement-tiers.md`.

### Backpressure hook

A baseline is established on sandbox start. The hook tracks file changes and blocks further writes if the agent is producing too much churn without test progress.

### Escalation

When a test looks wrong or the toolchain breaks (not the agent's code):

1. Comment on the issue using the standard escalation template (see [Escalation path](#escalation-path))
2. Label it `ready-for-human`
3. Optionally create a bug issue for tooling problems
4. Stop

Escalated tickets remain open and `in_progress` in the tracker. Their dependents stay blocked in the DAG. When a human resolves the escalation (removes `ready-for-human`, unclaims the ticket), it re-enters the pipeline automatically on the next run — no manual re-labeling needed.

---

## Phase 3: Visual Gate (UI tickets only)

Runs only when `touchesUI: true`. Two sub-phases that loop up to 3 rounds.

### 3a. Visual QA

Runs the visual test suite, triages failures, and diagnoses each regression to its root cause in source code or rule files. Produces a self-contained findings report the Fixer can apply mechanically.

**Prompt:** `visual-qa-prompt.md`<br/>
**Model:** Sonnet<br/>
**Iterations:** up to 10<br/>
**Input:** Branch, issue details, findings file path<br/>
**Output:** Findings file (`.qa/visual-r{N}.md`)

#### What it does

1. Starts the dev server (`npm run dev &`)
2. Runs the filtered visual test command (from issue's "Run visual" line) — exactly once
3. Reads `.ui-qa/report.json` for structured results
4. Triages each result:
   - **Flaky** (`"flaky"` in report): noted, not blocking (Playwright retries handle it)
   - **Regression** (`"unexpected"`): real failure, diagnose using protocol below
   - **Contract gap**: test itself is wrong, note but don't fix

#### Diagnosis protocol (for each regression)

**Step 1 — Capture failure values:** Read `error` field from report. Record expected/received verbatim. One extra command allowed per finding if error is truncated.

**Step 2 — Identify root cause:** Follow the decision tree:

| Category                    | Check                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot diff             | Compare actual vs expected, trace to CSS rule or markup                                                                                                  |
| Programmatic value mismatch | Walk through: user-agent styles → CSS transitions → specificity → `@layer` ordering → token resolution → property mismatch → browser color normalization |
| UI rule compliance          | Check against `ui-base.md` and `ui-project.md` for missing states, a11y violations, layout rules, motion rules, budget overruns                          |

**Step 3 — Classify:** `Fix now` (root cause in `src/`), `DEFER` (root cause in locked files or needs design decision).

#### Rules enforced

The Visual QA agent enforces **T3 only** — judgment via structured assertion protocols. It does not run T2 checks. Automated pass/fail checks (axe, CLS, overflow, zoom) are global T2 — they run post-merge as a script, not through an LLM agent. See `enforcement-tiers.md` for the tier model and [Global T2 suite](#global-t2-suite) for the post-merge step.

**T3 — Judgment (structured assertion protocols):**

| Rule                                                                        | Rule source                        |
| --------------------------------------------------------------------------- | ---------------------------------- |
| Exit never slower than enter                                                | `ui-base.md` > Motion              |
| Truncated text has a way to see full value                                  | `ui-base.md` > Content             |
| `data-dynamic` on content that changes per run                              | `ui-base.md` > Content             |
| Screenshot diffs and state combinations                                     | —                                  |
| Product patterns (toasts, drawer, dialog, forms, destructive confirmations) | `ui-project.md` > Product patterns |

Non-visual rules (token naming, values, layer order) are the Reviewer's responsibility.

#### Output format

Three possible outputs:

- `PASS` — all tests passed
- `FAIL` + `Fix now:` block — regressions the Fixer can address in `src/`
- `DEFER` — all failures are in locked files or need human judgment

#### Budget

Stay under 50K tokens. Read script output, not raw reports. Open at most 12 images.

### 3b. Fixer (after Visual QA)

**Prompt:** `fix-prompt.md`<br/>
**Model:** Opus (target: Haiku)<br/>
**Iterations:** up to 20<br/>
**Verify command:** `npm run typecheck && npm run lint && npm run test && npx playwright test --grep "@{escapedId}"`

See [Fixer](#fixer-shared-role) below.

### Gate logic

```
for round 1..3:
  run Visual QA → writes .qa/visual-r{N}.md
  if PASS → break, proceed to Code Gate
  if DEFER → escalate issue, break
  if round == 3 → escalate, break
  run Fixer with visual findings
```

Before each Visual QA round, `test-results/` is archived to `test-results-visual-qa-r{N}` for debugging.

---

## Phase 4: Code Gate (all tickets)

Runs for every ticket that produced commits, regardless of `touchesUI`. UI tickets pass through both gates because Visual QA validates runtime behavior (does it look and work right?) while the Reviewer validates the source code (is it well-written?).

### 4a. Reviewer

Reviews the branch diff for coding standards violations and spec divergence. Produces a self-contained findings report the Fixer can apply mechanically.

**Prompt:** `review-prompt.md`<br/>
**Model:** Sonnet<br/>
**Iterations:** 1<br/>
**Input:** Branch diff, issue details, prior fix history, findings file path<br/>
**Output:** Findings file (`.qa/review-r{N}.md`)

#### What it does

Reviews the git diff against two axes:

1. **Standards axis** — Does the code follow `CODING_STANDARDS.md`?
2. **Spec axis** — Does the code do what the issue asked for?

Does NOT check runtime-only rules (States, Accessibility floor, Budgets) — those are Visual QA's responsibility.

#### Rules enforced (T3 — judgment via structured assertion protocols)

| Rule                                              | Rule source                                        |
| ------------------------------------------------- | -------------------------------------------------- |
| Token naming and values match role                | `ui-project.md` > Color roles, Typography, Spacing |
| Layer order follows token hierarchy               | `ui-project.md` > Spacing, radius, elevation       |
| Components own no outside space (margin on roots) | `ui-base.md` > Values                              |
| Focus ring uses `--shelf-focusRing` tokens        | `ui-project.md` > Focus                            |
| Motion tokens used for correct purposes           | `ui-project.md` > Motion                           |
| Named exports over default exports                | `CODING_STANDARDS.md` > Style                      |
| Unit tests co-located with source                 | `CODING_STANDARDS.md` > Testing                    |
| Tests use role/accessible name, not CSS selectors | `CODING_STANDARDS.md` > Testing                    |
| Agent-written tests go in `e2e/agent/`            | `CODING_STANDARDS.md` > Testing                    |
| Data access through async API module              | `CODING_STANDARDS.md` > Architecture               |
| Locked paths untouched (contract protection)      | `CODING_STANDARDS.md` > Testing                    |
| Spec compliance (code does what issue asked)      | —                                                  |

#### Contract protection

Scans diff for changes to locked paths. Reverts any violations:

- `e2e/acceptance/` — only new baseline PNGs allowed, no `.ts` changes
- `e2e/support/`, `scripts/ui-qa/`, `playwright.config.ts`, `.claude/` — must be untouched

#### Narrowing scope across rounds

- Round 1: reviews the full branch diff (`main...branch`)
- Round 2+: reviews only the Fixer's changes (`pre-fixer-SHA...branch`) so the Reviewer doesn't re-discover issues it missed in round 1 — guaranteeing convergence

#### Prior fix dispositions

A finding the Fixer intentionally skipped or traded off is settled. The Reviewer does not re-raise it. Conflicting rules → DEFER.

Fix history is passed via `{{FIX_HISTORY}}` — extracted from Fixer commit messages (naturally compressed, ~50–80 tokens per round).

#### Output format

Three possible outputs:

- `CLEAN` — no issues found
- `FINDINGS` + per-finding blocks — actionable issues the Fixer can address
- `DEFER` — all findings are in locked files or need human judgment

### 4b. Fixer (after Review)

**Prompt:** `fix-prompt.md`<br/>
**Model:** Opus (target: Haiku)<br/>
**Iterations:** up to 20<br/>
**Verify command:** `npm run typecheck && npm run lint && npm run test && npx playwright test --grep "@{escapedId}"`

The verify command is now universal across both gates — it includes visual tests so the Fixer empirically detects cross-gate conflicts. If a review fix breaks a visual test, the Fixer reverts that fix and notes it in the commit message as "conflicting with visual test." This disposition becomes part of the fix history and the Reviewer will not re-raise it.

See [Fixer](#fixer-shared-role) below.

### Gate logic

```
reviewBase = "main"
fixHistory = ""
for round 1..3:
  run Reviewer with reviewBase → writes .qa/review-r{N}.md
  if CLEAN → break, proceed to Merger
  if DEFER → escalate issue, break
  if round >= 2 and findings overlap with previous round → oscillation detected, escalate, break
  if round == 3 → escalate, break
  capture branch HEAD as reviewBase (for narrow diff next round)
  run Fixer with review findings
  append Fixer commit message to fixHistory
```

#### Oscillation detection

Oscillation is detected by comparing structured fields, not raw text. A finding on the same `file:line` with the same `Cause:` category (e.g., `[ui-project.md > Motion > tokens]`) in consecutive rounds is oscillation — the Reviewer and Fixer are fighting. The orchestrator escalates instead of looping.

A new finding at a *different* line in the same file, even with a similar description, is progressive discovery (deeper review) — not oscillation.

---

## Fixer (shared role)

Applies fixes from a QA findings report — opens each file at the indicated line, makes the prescribed change, and verifies. Never reads rules or investigates; operates purely on the report.

**Prompt:** `fix-prompt.md` (one prompt, used twice)<br/>
**Model:** Opus (target: Haiku)<br/>
**Iterations:** up to 20

### What it does

1. Reads the findings file (`.qa/visual-r{N}.md` or `.qa/review-r{N}.md`)
2. If `PASS`, `CLEAN`, or `DEFER` — does nothing
3. For each finding:
   - Opens the file at the line indicated
   - Applies the exact change from `Fix:` — does not reinterpret
   - If line numbers shifted, adapts minimally
4. Runs verification:
   - `npm run typecheck 2>&1`
   - `npm run test 2>&1`
   - The gate-specific verify command
5. If verification fails: reads full error, diagnoses, fixes, re-runs. If failure is in a locked file, stops and notes it.
6. Commits with prefix `RALPH: fix QA round`

### The key constraint

The Fixer never reads rules, never greps, never runs exploratory commands. It operates solely on the report. If the report is incomplete (missing `Current:` or `Fix:` fields), the finding is skipped and noted as malformed.

This is what enables the Haiku target — the diagnostic cost is paid upstream by Visual QA and Reviewer.

### Report validation

Before invoking the Fixer, the orchestrator validates the findings file against a Zod schema. Every finding must have the required fields (`file:line`, `Current:`, `Fix:`, and the file must exist). Malformed findings are dropped with a log warning.

If the QA agent reported a non-clean verdict (FAIL/FINDINGS) but all findings are malformed after validation, the orchestrator escalates the ticket — this is not a silent PASS. The escalation reason is `malformed-report`.

### Report contract (both gates)

Every finding must be self-contained:

```
- src/file.ext:42 `.selector-or-symbol`
  Test: "exact test name" (spec-file.ts:136)
  Assertion: `expect(...).toBe(...)`
  Expected: rgb(186, 108, 79)
  Received: rgb(255, 255, 255)
  Cause: [rule-file > section > rule] one-line explanation
  Current: <verbatim code at that line>
  Fix: <exact replacement code, copy-pasteable>
```

| Field                         | Why the Fixer needs it                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `src/file.ext:line`           | Opens this file at this line. No grep needed.                         |
| `selector or symbol`          | Confirms it's at the right spot (guard against line drift)            |
| `Test:` with spec `file:line` | Can re-run just this test to verify                                   |
| `Assertion:`                  | Understands what's being checked                                      |
| `Expected:` / `Received:`     | Knows the target value and current wrong value                        |
| `Cause: [rule ref]`           | Audit trail for humans (not needed by Fixer)                          |
| `Current:`                    | The exact code at that line — no investigation needed                 |
| `Fix:`                        | The exact replacement code, copy-pasteable — no rule knowledge needed |

The Reviewer's findings are often simpler (single-line substitutions) but the contract is identical.

---

## Phase 5: Merger

Merges all completed issue branches into the current branch, resolves conflicts, confirms tests pass, and closes the corresponding tracker issues.

**Prompt:** `merge-prompt.md`<br/>
**Model:** Opus<br/>
**Iterations:** up to 3<br/>
**Input:** List of passed branches, list of issues with titles, close command template

### What it does

1. Merges all passed branches into the current branch
2. Resolves any conflicts
3. Runs tests to confirm everything works together
4. Closes the corresponding issues via `CLOSE_TASK_COMMAND`

### Which branches are passed

Only branches with status `passed` (all gates returned PASS/CLEAN) are sent to the Merger. The orchestrator maintains a per-ticket status enum per round:

| Status | Meaning | Goes to Merger? |
|---|---|---|
| `passed` | All gates passed | Yes |
| `escalated` | A gate exhausted rounds, oscillated, or deferred | No |
| `killed` | Agent exceeded 100K tokens | No |

Branches that produced no commits are also excluded. The status enum is ephemeral — reset each round.

### Retry strategy

The Merger retries with deterministic branch rotation on failure:

- **1 branch:** no merge needed, skip
- **2+ branches:** up to 3 iterations. Each iteration resets to a clean state and merges in a rotated order (A→B→C, then B→C→A, then C→A→B). If all iterations fail, escalate all tickets in the round with reason `merge-failure`.

Issues are only closed *after* tests pass on the merged branch. If the merge succeeds but tests fail, no issues are closed — all tickets are escalated.

After merging, if more tickets remain in the DAG, the outer loop goes back to Phase 1 (Planner picks the newly unblocked tickets).

---

## Global T2 suite

Runs after the Merger as a script — no LLM. Validates page-level invariants on the merged result that per-ticket sandboxes can't catch (each sandbox sees a partial page; the merged branch has the full page).

**What it runs:**

| Check                                   | Rule source            | Tool                         |
| --------------------------------------- | ---------------------- | ---------------------------- |
| No axe violations                       | `ui-base.md` > A11y    | axe-core                     |
| Contrast 4.5:1 body, 3:1 large/UI       | `ui-base.md` > A11y    | axe-core                     |
| Pointer targets ≥ 24×24 CSS px          | `ui-base.md` > A11y    | axe-core / target-size check |
| Every control has accessible name       | `ui-base.md` > A11y    | axe-core                     |
| CLS < 0.01 per interaction              | `ui-base.md` > Budgets | CLS measurement              |
| ≤ 2 long frames per animation           | `ui-base.md` > Budgets | Performance measurement      |
| No horizontal overflow 320–1440px       | `ui-base.md` > Layout  | Viewport overflow check      |
| Works at 200% zoom                      | `ui-base.md` > A11y    | Viewport check at 200%       |
| Late-loading content has reserved space | `ui-base.md` > Layout  | CLS measurement (indirect)   |

These were previously listed under Visual QA's T2 checks. They moved here because they are automated pass/fail (T2) — no LLM interprets the result. Running them through a Sonnet agent was paying for judgment on an exit code.

**How it executes:**

```
Merger completes → orchestrator runs global T2 script → script starts dev server, runs checks against all fixtures → exit code
```

The script runs Playwright with the global assertion suite against every fixture (`default`, `empty`, `error`, `slow`, `long`, `many`). Each check produces pass/fail with a machine-readable failure description (assertion name, expected, received, fixture, viewport).

**On failure:**

1. For each failure, the orchestrator creates a child ticket under the current spec:
   - Type: `bug`
   - Title: `"Global T2: {assertion} failed on {fixture} at {viewport}"`
   - Description: machine-generated with exact failure details — no LLM writes or interprets it
   - Label: `Sandcastle` (so the Planner picks it up)
2. These tickets enter the next round of the same spec
3. The Implementer fixes them via normal TDD — the global assertion is the test
4. After merge, the global T2 suite runs again

**Spec completion condition:** all child tickets closed AND global T2 suite passes on the merged result. The pipeline does not move to the next spec until this gate is green.

**Oscillation:** if a global fix ticket creates a new global failure in the same assertion category, the orchestrator escalates immediately with reason `global-oscillation`.

**Round budget:** global T2 fix rounds count against the spec's max 10 rounds. A spec that generates many global regressions eats into its own budget and eventually escalates.

---

## Enforcement Philosophy

Classification follows the sorting test in `enforcement-tiers.md`: **can a regex catch it → T1; does it need execution but produces pass/fail → T2; does it need LLM judgment → T3**. Each rule is assigned to exactly one tier. No tier overlap — an LLM agent never runs T2 checks, and a script never makes T3 judgment calls.

| Tier | Where it runs | How | Executor | Cost |
|---|---|---|---|---|
| **T1 Source text** | Implementer (Phase 2) | PreToolUse hooks, lint, `tsc` — blocks before it lands | Scripts, tools | Free |
| **T2 Per-component** | Implementer (Phase 2) | Acceptance tests — pass/fail in TDD loop | Test runner | Moderate (browser) |
| **T2 Global** | Post-merge (between Merger and next round) | Global assertion suite — axe, CLS, overflow, zoom | Script, no LLM | Low (one pass) |
| **T3 Judgment** | Visual QA (Phase 3) + Reviewer (Phase 4) | Structured assertion protocols — evidence-based, not vibes | LLM agents | Sonnet |
| **Human** | Morning review | Approves baselines, triages escalations | Human | Human |

Key design principle: **T2 checks never flow through an LLM agent.** If a check produces pass/fail without interpretation, it runs as a script or test — paying an LLM to read an exit code is wasted cost. Visual QA and Reviewer exist for T3 only.

### Rules requiring human judgment

| Rule                                | Source                               | Why                 | Mitigation                                           |
| ----------------------------------- | ------------------------------------ | ------------------- | ---------------------------------------------------- |
| GLOSSARY.md vocabulary              | `ui-base.md` > Content               | Semantic intent     | Grep for "Avoid" terms once glossary exists          |
| Single responsibility               | `CODING_STANDARDS.md` > Architecture | Subjective          | Reviewer flags, human decides                        |
| Explicit over clever                | `CODING_STANDARDS.md` > Style        | Subjective          | Reviewer flags, human decides                        |
| Prefer composition over inheritance | `CODING_STANDARDS.md` > Architecture | Subjective          | Reviewer flags, human decides                        |
| A state with no test is unfinished  | `ui-base.md` > States                | Meta-process        | `ui-contract` generates complete acceptance criteria |
| Approve new screenshot baselines    | —                                    | Intent verification | Morning review of `e2e/__screenshots__/`             |

### Escalation path

When the pipeline cannot resolve an issue, it escalates using a structured comment template:

```
[ESCALATION: <reason>] Phase: <phase>, Round: <round>. Progress: <progress>. <details>.
See .sandcastle/logs/<issueId>/<phase>.log
```

**Reason enum:**

| Reason | Trigger |
|---|---|
| `gate-exhaustion` | A gate used all 3 rounds without PASS/CLEAN |
| `oscillation` | Same `file:line` + `Cause:` category raised in consecutive rounds |
| `context-exceeded` | Agent exceeded 100K tokens |
| `malformed-report` | QA reported findings but all failed Zod validation |
| `merge-failure` | Merger exhausted all iterations |
| `backpressure` | Backpressure hook blocked the agent and it couldn't make progress |
| `global-oscillation` | Global T2 fix ticket created a new global failure in the same assertion category |
| `agent-escalation` | Implementer detected a wrong test or broken toolchain |

**On escalation:**

1. Comments on the issue using the template above
2. Labels it `ready-for-human`
3. Stops processing that ticket (other tickets continue)
4. The ticket's branch is preserved with partial work
5. The ticket remains open and `in_progress` — dependents stay blocked in the DAG

---

## Replay and debugging

### Replay scripts

| Script                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `replay.mts`           | Re-run the full pipeline on existing worktrees |
| `replay-visual-qa.mts` | Re-run only Visual QA on a branch              |
| `replay-review.mts`    | Re-run only Reviewer on a branch               |
| `replay-fix.mts`       | Re-run only Fixer with a findings file         |
| `reset.mts`            | Reset worktrees to a clean state               |

### Log artifacts

All artifacts land under `.sandcastle/logs/{issueId}/`:

- `{phase}.prompt.md` — the fully expanded prompt (both stages applied)
- `{phase}.log` — full LLM output (when `--verbose`)
- `.qa/visual-r{N}.md` — Visual QA findings per round
- `.qa/review-r{N}.md` — Reviewer findings per round
- `test-results-{phase}-r{N}/` — archived Playwright artifacts per round

### CLI flags

| Flag        | Effect                                                          |
| ----------- | --------------------------------------------------------------- |
| `--single`  | Process only the first unblocked issue, then stop               |
| `--verbose` | Stream full LLM output to log files                             |
| `--overlay` | Copy uncommitted host files into worktrees (prompt development) |
