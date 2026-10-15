# Rules Enforcement System

How rules are classified, authored with enforcement blocks, and enforced across the Sandcastle pipeline. This document is self-contained: a reader with no prior knowledge of the project can read it top-to-bottom and implement the full solution.

---

## Problem Statement

The system eliminates four failure modes that plague rule-based agent pipelines:

| Failure mode | What goes wrong | How this system prevents it |
|---|---|---|
| **Silent miss** | A rule exists but nothing checks it. The violation ships undetected. | Every rule has an enforcement block. `npm run audit:rules` reports rules without blocks as gaps (exit code 1). No rule is "enforced by convention." |
| **Divergence** | The rule says X, but the enforcement checks Y. The check passes while the actual rule is violated. | The enforcement block lives directly under the rule text in the same file — not in a separate config. One author writes both. The audit script validates that block fields match the tier's requirements. |
| **Hallucination** | An LLM agent invents a violation that doesn't exist, or misreads a rule and flags correct code. | T3 instructions require evidence before judgment — the agent gathers specific data points before making a call. The instruction names what to look for, what counts as a violation, and what correct looks like. T1 and T2 are deterministic — no LLMs. |
| **Lack of attention** | An LLM agent has too many rules in context and silently skips some. | Hard budgets cap rules per LLM call at 90 (80 non-exempt + up to 10 triage-exempt). Overflow triggers group-based chunking (Visual QA) or two-phase triage (Reviewer). Skipped rules are logged by ID — never silently dropped. |

### Stack-agnostic by design

The tier model is universal:

- **T1** (source text) — regex, AST, lint. Works for CSS, TypeScript, Python, Go, Rust, or any language with text patterns.
- **T2** (runtime behavior) — automated tests. Works for Playwright, Vitest, pytest, Go tests, or any pass/fail test runner.
- **T3** (intent alignment) — LLM judgment. Works for any codebase where an agent can read code or screenshots.
- **Human** — manual review. Works everywhere.

Only the examples and tool names adapt to the project. The enforcement block format, the sorting test, the budget system, and the pipeline integration are the same regardless of stack.

---

## Solution Overview

A rule author writes a rule (what to do) and an enforcement block (how to check it) in a markdown rules file. The enforcement block specifies a tier (T1/T2/T3/Human) — chosen via a sorting test that picks the cheapest tier that catches every non-compliance. At runtime, four parsers read these blocks and act on them: `apply-t1.mjs` blocks file writes that violate regex patterns (pre-write hook); `ui-contract` generates locked test specs from T2 blocks (day shift); `apply-t2.mjs` runs the generated global T2 suite post-merge (no LLM); `apply-t3.mjs` injects T3 evaluation instructions into Visual QA and Reviewer agent prompts (prompt expansion). A fifth parser, `audit:rules`, reads all blocks to validate format, counts, and budget compliance. The result: rules that enforce themselves — no manual prompt updates, no configuration files, no silent gaps.

---

## Key Concepts

| Term | Definition |
|---|---|
| **Sandcastle** | An autonomous build pipeline that picks tickets from a tracker (Beads or GitHub), implements them in parallel Docker sandboxes, validates through QA gates, and merges. Runs unattended (the "night shift") via `npm run sandcastle`. Consumer of enforcement blocks. |
| **Implementer** | The agent (Opus) that writes code via TDD. Blocked by T1 hooks; runs T2 per-component acceptance tests. |
| **Visual QA** | An agent (Sonnet) that looks at screenshots and runtime behavior. Enforces T3 visual rules only. Runs only for UI tickets. |
| **Reviewer** | An agent (Sonnet) that reads the code diff. Enforces T3 code rules only. Runs for all tickets. |
| **Fixer** | A mechanical agent that applies fixes from QA/Reviewer findings reports. Never reads rules, never greps, never runs exploratory commands. Each finding in the report is self-contained. |
| **Global T2 suite** | `apply-t2.mjs`, a script (no LLM) that runs post-merge, checking page-level invariants like axe, CLS, overflow across all fixtures and viewports. |
| **PreToolUse hook** | A Claude Code mechanism that intercepts agent tool calls (Edit, Write) before they execute. Exit code 0 = allow, exit code 2 = block (stderr shown to the agent as the rejection reason). Any non-zero exit code means block (fail-closed). |
| **Enforcement block** | A ` ```enforcement ` fence in a markdown rules file containing YAML-like content. The rule text above is the human-readable rule; the block inside is the machine-readable enforcement spec. |
| **Scope-gating** | Filtering rules by file-glob match against the evaluation context (e.g., the git diff). Rules whose scope doesn't match are excluded. Deterministic, free, typically eliminates 60-80% of rules. |
| **Two-phase triage** | A Reviewer-only overflow strategy: Haiku screens rules for relevance cheaply (over-inclusive), then Sonnet evaluates only the flagged subset with full instructions. |
| **Fixtures** | Deterministic test states controlled by a `?fixture=` URL parameter. Valid values: `empty`, `error`, `slow`, `long`, `many`. Default (no param): 5-8 seed books. |
| **Day shift** | The human + Claude interactive session. Specs are written, `ui-contract` generates acceptance tests, tickets are created. |
| **Night shift** | `npm run sandcastle` runs unattended. Picks tickets, implements them, validates through QA gates, merges. |
| **Morning review** | The human reviews merged branches, approves screenshot baselines, triages escalations, and works through the Human-tier rule checklist. |
| **Rule-creator** | The skill (`.claude/skills/rule-creator/SKILL.md`) that helps users create and maintain rules with enforcement blocks. |
| **Pipeline run** | One invocation of `npm run sandcastle` — from Planner start to completion, cost halt, or all-escalated termination. `runId` format: `run-{YYYY-MM-DD}-{NNN}`. |

### Workflow rhythm

The day/night/morning cadence is the default rhythm, not a constraint. When the human is online during a pipeline run, escalations, findings, and Human-tier checklists are visible in real time via the project tracker. "Morning review" is the catchall for anything not triaged in real time. The pipeline does not require the human to be offline during the night shift; it requires only that the human does not modify code that the pipeline is actively building (handled by branch isolation).

### Supply chain

Each parser consumes enforcement blocks produced by the rule-creator skill. The rule-creator is the designed workflow for creating and maintaining blocks; manual authoring is possible but not the primary path.

| Tier | Provider (creates the block) | Consumer (reads and acts on the block) |
|---|---|---|
| T1 | Rule-creator skill | `apply-t1.mjs` (PreToolUse hook) |
| T2 per-component | Rule-creator skill | `ui-contract` per-component mode (generates locked acceptance specs per ticket) |
| T2 global | Rule-creator skill | `ui-contract` global mode (generates `invariants.spec.ts`) |
| T3 | Rule-creator skill | `apply-t3.mjs` (prompt expansion) |
| Human | Rule-creator skill | `audit:rules` (morning review checklist) |

---

## Components and Contracts

### Rules file discovery — `discoverRulesFiles()`

**Purpose:** shared utility that all five parsers call to find the same set of rules files.

**Invocation:** imported as a function by `apply-t1.mjs`, `apply-t2.mjs`, `apply-t3.mjs`, `ui-contract`, and `audit:rules`.

**Algorithm:**

1. Scan `.claude/rules/` (Claude Code native)
2. Scan `.cursor/rules/` (Cursor native)
3. Scan for `CODING_STANDARDS.md` at project root
4. Read additional paths from `.sandcastle/config.json` key `rules.extraPaths` (array of globs)

**Path validation.** Every resolved path is validated before inclusion:

1. The path must be a regular file (directories, device nodes, and other non-file entries are skipped with a warning)
2. The path must resolve to a location within the project root (paths that resolve outside the project root via symlinks or `..` traversal are skipped with a warning)
3. Duplicate paths (same file reached via different globs or symlink chains) are deduplicated by resolved absolute path

**Output contract:**

| Output | Format | Description |
|---|---|---|
| File list | `string[]` | Array of absolute file paths, deduplicated |
| Warnings | stderr | Skipped paths with reason |

**Edge cases:**

| Condition | Behavior |
|---|---|
| `.sandcastle/config.json` missing | `rules.extraPaths` defaults to `[]` (no additional paths) |
| `.sandcastle/config.json` has invalid JSON | Pipeline exits with code 2 (infrastructure failure) |
| A `rules.extraPaths` glob has invalid syntax | Glob skipped with warning. `audit:rules` reports as error. |
| A `rules.extraPaths` glob matches zero files | No warning emitted — zero-match is valid. `audit:rules` reports per-glob match counts. |
| Zero total rules files discovered | No error from discovery itself. Consumers handle this per-tier. |

### Enforcement block parser — `parseEnforcementBlocks()`

**Purpose:** shared utility that parses ` ```enforcement ` fences from markdown files and extracts YAML-like content.

**Invocation:** imported as a function by all five parsers.

**Input contract:**

| Field | Type | Required | Description |
|---|---|---|---|
| `fileContent` | `string` | Yes | Raw markdown file content |
| `filePath` | `string` | Yes | Absolute path (for error reporting) |

**Algorithm:**

1. Scan for ` ```enforcement ` fences in the markdown
2. Extract the content between the opening and closing fences
3. Split by `---` at column 0 (no leading whitespace) to handle multi-tier blocks. A `---` indented inside a YAML value is treated as literal text, not a separator.
4. Parse each segment as YAML
5. Return an array of parsed enforcement entries, each associated with the rule text immediately above the fence

**Output contract:**

| Output | Format | Description |
|---|---|---|
| Blocks | `EnforcementBlock[]` | Array of parsed entries with `id`, `tier`, and tier-specific fields |
| Parse errors | `ParseError[]` | Array of `{ filePath, line, error }` for malformed YAML |

**Edge cases:**

| Condition | Behavior |
|---|---|
| Malformed YAML inside fence | Entry added to parse errors array. Consumer decides how to handle (see malformed YAML handling table below). |
| `---` inside a YAML value (indented) | Treated as literal text, not a separator |
| Multi-tier block with shared `id` | Valid — all entries share the same `id`, qualified at runtime with `@<tier>` |
| Empty fence (no content between markers) | Treated as malformed — added to parse errors |

### `apply-t1.mjs` — T1 source text enforcement

**Purpose:** blocks file writes that violate T1 regex patterns.

**Invocation:** called by the PreToolUse hook. Receives JSON on stdin.

**Input contract (stdin):**

```json
{
  "tool": "Write | Edit",
  "filePath": "/absolute/path/to/file.ext",
  "content": "full file content after the write"
}
```

Claude Code's PreToolUse hook is the reference adapter: it maps its native payload (`tool_name`, `tool_input.file_path`, `tool_input.content`) to this schema before piping to `apply-t1.mjs`. For `Edit` tool calls, the adapter reconstructs the full file content by reading the current file from disk, applying the edit (`old_string` → `new_string`), and sending the result as the `content` field. If the adapter cannot reconstruct the full content (file does not exist on disk for a new file creation via Edit), it sends the `new_string` as content and logs a warning.

**Path resolution.** `apply-t1.mjs` resolves scope and exclude globs relative to the project root (the nearest ancestor directory containing `.git`, falling back to the current working directory). The absolute `filePath` from stdin is converted to a project-relative path before glob matching.

**Execution flow:**

1. Read all T1 blocks from all rules files (cached by mtime + file size)
2. Match file path against each block's `scope`/`exclude`
3. Check for binary content (scan first 8,192 bytes for null bytes — skip binary files with exit 0)
4. Apply `strip` transformations if specified
5. Run regex against file content
6. Report all violations in a single rejection message

**Exit codes:**

| Code | Meaning | Caller action |
|---|---|---|
| 0 | No violation — write allowed | Hook allows the write |
| 2 | Violation found — write blocked | Hook rejects the write, stderr shown to agent |

Exit code 1 is not used by `apply-t1.mjs`. If the process exits with code 1 (uncaught exception, missing dependency), the PreToolUse hook treats it as a block (fail-closed).

**Rejection message format:**

```
BLOCKED: T1 violation

file: src/components/Card.css
line: 12
match: "16px"
rule: Every color, size, spacing, radius, shadow, duration and easing comes from a token.
fix: Replace with a --shelf-space-* or --shelf-size-* token from src/styles/tokens.css
```

When a file triggers multiple violations, `apply-t1.mjs` reports ALL violations in a single rejection message — one `BLOCKED` section per violation.

**Conflicting rules.** `apply-t1.mjs` evaluates all matching T1 blocks independently — if any block's assertion fails, the write is blocked. Two rules with the same pattern, overlapping scope, and opposite assert values (`present` vs `absent`) make the file unwritable by construction. `audit:rules` detects this as an error. `apply-t1.mjs` does not attempt runtime conflict resolution.

**Edge cases:**

| Condition | Behavior |
|---|---|
| Zero rules files discovered (GAP-100) | Log warning to stderr, exit 0 (fail-open). `audit:rules` catches this separately. |
| Invalid regex in block (GAP-101) | Pattern skipped with warning. Other patterns continue. Per-match timeout of 5 seconds — exceeded match treated as violation (exit 2, fail-closed). `audit:rules` reports as error. |
| Malformed YAML in rules file | Fail-closed per file: block ALL writes to files matching ANY `scope` glob from that rules file (using mtime-cached scope list from last successful parse). No cached scope list → exit 2, block all writes. |
| All files have malformed YAML (zero T1 rules survive) | Exit 2 — block all writes. Distinct from zero files discovered (exit 0). |
| Cache scope (GAP-207) | Per-process. Cache key is `mtime + file size`. |
| Mid-run rules edit (GAP-461) | Log warning with file path and timestamps. Continue with cached version — no re-parse mid-run. |
| Invalid glob syntax in scope/exclude (GAP-546) | Block skipped for enforcement (fail-open for that block), warning logged. `audit:rules` reports as error. |
| Unmapped file extension for `strip` (GAP-465) | Stripping skipped (match raw text), warning logged. |
| Unrecognized `strip` value | Treated as `strip: none`, warning logged. `audit:rules` reports as error. |
| Binary file detected | All T1 patterns skipped (exit 0), debug log emitted. |

### `ui-contract` — T2 test generation

**Purpose:** generates locked Playwright test specs from T2 enforcement blocks.

**Invocation:** skill run during the day shift. Two modes.

**Per-component mode (ticket-driven):**

1. Scan rules files for `tier: T2` + `scope: per-component` blocks
2. Determine which components a ticket touches using: (a) ticket metadata for explicitly named components; (b) keyword-match against known component names in `src/components/`; (c) if ambiguous, ask the user to confirm (GAP-104)
3. Generate locked Playwright specs in `e2e/acceptance/`
4. Validate that all referenced helpers exist at generation time; block generation and report missing function name if a helper is missing

**Global mode (rule-driven):**

1. Scan rules files for `tier: T2` + `scope: global` blocks
2. Read each block's callable `assert` value
3. Generate `e2e/global/invariants.spec.ts` with one assertion per block against every fixture × every viewport
4. Commit generated file to git

**Overwrite behavior (GAP-116).** When a test file already exists at the target path, `ui-contract` overwrites it — no `.bak`, no prompt. The file is in git, so the previous version is recoverable.

**Test locking mechanism (GAP-105).** Acceptance tests in `e2e/acceptance/` are locked via a T1 hook enforcement rule: a `pattern: "."` / `assert: absent` block scoped to `e2e/acceptance/**` blocks all writes to that directory.

**Output contract:**

| Output | Format | Description |
|---|---|---|
| Per-component specs | `e2e/acceptance/*.spec.ts` | Locked Playwright specs per ticket |
| Global suite | `e2e/global/invariants.spec.ts` | Single suite with one assertion per T2 global block × fixture × viewport |

### `apply-t2.mjs` — Global T2 runner

**Purpose:** runs the generated `e2e/global/invariants.spec.ts` post-merge.

**Invocation:** `node apply-t2.mjs` with no arguments, from project root.

**Execution flow:**

1. Start dev server (default `http://localhost:5173`, 30-second startup timeout with health check)
2. Locate `e2e/global/invariants.spec.ts` (hardcoded path)
3. Run via `npx playwright test` against every fixture × every viewport
4. Read T2 global blocks from rules files to validate drift (every block's `assert` has a matching assertion in the test file)

**Exit codes:**

| Code | Meaning | Caller action |
|---|---|---|
| 0 | All assertions pass (vacuously true if zero tests) | Spec completion check |
| 1 | One or more assertions failed | Orchestrator creates child bug tickets |
| 2 | Infrastructure failure (dev server didn't start, test file missing, compilation failure) | Escalate as `global-infra-failure` |

**Edge cases:**

| Condition | Behavior |
|---|---|
| Dev server doesn't start within 30 seconds | Exit 2. No retry within script; orchestrator handles. |
| Test file missing | Exit 2 |
| Test compilation failure (GAP-463) | Exit 2 (infrastructure), not exit 1 (assertion). Fix: re-run `ui-contract` in global mode. |
| Zero test cases in file | Exit 0. Warning logged. `audit:rules` separately reports when zero T2 global blocks exist. |
| Drift detected (block assert not in test file) | Warning to stderr. Continue running existing tests. Surfaced in morning review via `npm run review`. |

**Canonical viewport list (GAP-103):** `320px` (mobile), `768px` (tablet), `1280px` (desktop).

### `apply-t3.mjs` — T3 prompt expansion

**Purpose:** reads all T3 enforcement blocks, filters by agent, and produces instruction payloads injected into agent prompt templates.

**Invocation:** `node apply-t3.mjs <issueId> <diffRef>`. Missing arguments → exit 2.

**Execution flow:**

1. Read all T3 blocks from all rules files
2. Filter by `agent` field (`visual-qa` or `reviewer`)
3. **Visual QA path:**
   - All rules have `scope: "*"` (universal)
   - Total rules ≤ 80 → one payload file
   - Total rules > 80 → one payload file per group, each chunk ≤ 80
   - Any single group > 80 → error (exit 1)
4. **Reviewer path:**
   - Intersect each rule's `scope` with `git diff --name-only`
   - Rules whose scope doesn't match are excluded (logged to `triage-exclusions.jsonl`)
   - Non-exempt surviving rules ≤ 80 → one payload with full instructions
   - Non-exempt surviving rules > 80 → two-phase triage (see Reviewer overflow)
   - Triage-exempt rules always injected (bypass triage, outside 80 budget)
5. Write payload files to `.sandcastle/payloads/{ticketId}/`
6. Clear target directory before writing (remove stale payloads)

**Exit codes:**

| Code | Meaning | Caller action |
|---|---|---|
| 0 | Payload(s) produced successfully | Orchestrator substitutes into prompt templates |
| 1 | Budget limit exceeded (group > 80 or total > 300) | Orchestrator halts pipeline with `rule-budget-exceeded` |
| 2 | Infrastructure failure (rules files unreadable, YAML parse error in all files, missing arguments) | Per-ticket: one retry in fresh container, then escalate `infra-failure` |

**Placeholder-to-agent mapping:**

| `agent` field value | Placeholder | Agent |
|---|---|---|
| `visual-qa` | `{{T3_VISUAL_CHECKS}}` | Visual QA (Sonnet) |
| `reviewer` | `{{T3_REVIEW_CHECKS}}` | Reviewer (Sonnet) |

If no blocks exist for an agent, the literal string `"No T3 rules apply to this evaluation."` is used. An unexpanded placeholder literal or empty string are never valid outputs.

**Token-size guardrails:**

| Limit | Scope | Mechanism |
|---|---|---|
| 500 tokens per instruction | Audit-time (soft) | `audit:rules` warns. Estimated via whitespace-split word count × 1.3. |
| 30,000 tokens per payload | Runtime (hard) | `apply-t3.mjs` measures with `tiktoken` (fallback: word count × 1.3 if tiktoken unavailable). Auto-chunks on exceed. |

**Chunking on token overflow:**

- **Visual QA:** each group becomes its own chunk (1:1). Multiple small groups are never merged. If a single group exceeds 30K, it is split by priority within the group.
- **Reviewer:** chunks built greedily by priority (highest first), respecting group boundaries. Rules in the same group are never split across chunks. Findings merged across chunks.

**Edge cases:**

| Condition | Behavior |
|---|---|
| Unrecognized `agent` value (GAP-462) | Block skipped with warning. `audit:rules` reports as error. |
| Out-of-range `priority` (not 0-4 or not integer) | Default (2) used, warning logged. `audit:rules` reports as error. |
| Zero matching rules (GAP-110) | Literal `"No T3 rules apply to this evaluation."` injected. |
| `git diff --name-only` failure (GAP-304) | Fail open — scope-gating skipped, every rule included. Warning logged. |
| `tiktoken` fails to load | Fall back to word-count heuristic, warning logged. |

### `audit:rules` — validation script

**Purpose:** parses all rules files and validates enforcement block format, counts, and budget compliance.

**Invocation:** `npm run audit:rules`.

**Rule detection.** A "rule" in markdown is any top-level bullet in a rules file. Non-rule content (explanations, context) must use paragraphs, headings, or blockquotes — not bullets. The `[context]` escape hatch excludes contextual bullets: the bullet must start with the literal string `- [context] ` (lowercase, brackets, trailing space).

**Checks performed:**

**Coverage:**
- Rules without enforcement blocks (gaps — error)
- Tier distribution (T1/T2/T3/Human counts)

**All tiers:**
- Missing `id` field (warning for legacy blocks, error for new blocks)
- Duplicate `id` values across different rules files or within the same file in separate enforcement fences (error). Multi-tier rules within the same `---`-separated fence share `id` — not duplicates.
- Unrecognized `tier` value (error — valid values: `T1`, `T2`, `T3`, `Human`)
- Malformed YAML in enforcement fence (error with file, line, error message)

**T1:**
- Missing required fields: `pattern`, `assert`, `scope`, `fix` (error)
- `tool` set but tool not in project lint config (warning)
- Invalid regex pattern (error)
- `scope` glob without extension filter — can match binary files (warning)
- Invalid glob syntax in `scope` or `exclude` (error)
- Unrecognized `strip` value (error)
- Cross-rule conflicts: overlapping scope + same pattern + opposite assert values (error)

**T2:**
- Missing `scope` or `assert` (error)
- Per-component `coverage` entries not in generated tests (warning)
- Per-component rules with zero generated test files (staleness warning)
- Global scope block with descriptive (non-callable) assert (error)
- Global block's `assert` value not found in `invariants.spec.ts` (drift warning)

**T3:**
- Missing `agent` or `instruction` (error)
- Unrecognized `agent` value (error — valid values: `visual-qa`, `reviewer`)
- Visual-qa blocks missing `group` (error)
- Visual-qa blocks with scope other than `"*"` (error)
- Visual-qa group > 80 rules (error)
- Reviewer blocks missing `scope` (warning — counts against 10-rule scopeless budget)
- Reviewer scopeless > 10 (error)
- Reviewer missing `triage_hint` (warning)
- Reviewer scope matches > 50% of git-tracked files without `exclude` (warning)
- `triage_exempt: true` count > 10 (error)
- Total T3 > 150 (warning), > 200 (warning), > 300 (error)
- `instruction` lacking "each", "every", or "all" (warning — advisory, not semantic)
- Single `instruction` exceeding 500 tokens (warning)
- `priority` value outside 0-4 or non-integer (error)
- Tier misclassification candidate: T3 instructions with deterministic-check language (warning — promotion-candidate)

**Human:**
- No review entry in `reviews/human-tier-log.jsonl` (error)
- Only a `created` entry with no subsequent review (warning)
- Not reviewed in current spec cycle (warning)

**Exit codes:**

| Code | Meaning |
|---|---|
| 0 | All checks pass (complete coverage, no errors). Warnings alone do not trigger exit 1. |
| 1 | Any error found |

### Report contract (Finding format)

**Purpose:** every finding from Visual QA or the Reviewer is self-contained so the Fixer can apply it without reading rules.

**Required fields:** `file:line`, `Cause`, `Current`, `Fix`, `Verify`.

**Optional fields:** `Test`, `Assertion`, `Expected`, `Received` (informational — present for T2-relayed findings, not required for T3 judgment findings).

**Format:**

```
- src/file.ext:42 `.selector-or-symbol`
  Test: "exact test name" (spec-file.ts:136)
  Assertion: `expect(...).toBe(...)`
  Expected: rgb(186, 108, 79)
  Received: rgb(255, 255, 255)
  Cause: [rule-file > section > rule] one-line explanation
  Current: <verbatim code at that line>
  Fix: <exact replacement code, copy-pasteable>
  Verify: "<shell command that exits 0 on success>"
```

**Multi-target findings:** each target gets its own `file:line` + `Current` + `Fix` block:

```
- src/components/Card.css:12 `.card`
  Cause: [ui-base > tokens > values-from-tokens] raw px value
  Current: margin: 16px;
  Fix: margin: var(--shelf-space-400);
  - src/components/Card.tsx:8 `Card`
    Current: style={{ padding: '16px' }}
    Fix: style={{ padding: 'var(--shelf-space-400)' }}
  Verify: "npm run typecheck && npm run lint"
```

**Finding validation rules.** A finding is valid if:

1. All required fields are present and non-empty: `file:line` (matches `<path>:<number>`), `Cause` (matches `[<rule-file> > <section> > <rule>] <explanation>`), `Current` (non-empty), `Fix` (non-empty), `Verify` (non-empty, parses as shell command)
2. Multi-target findings: each sub-target has its own `file:line`, `Current`, and `Fix`
3. `Fix` is not identical to `Current` (a no-op fix is malformed)

Findings that fail any check are malformed — skipped with a warning including the failing check and the finding's `file:line`.

**Partial malformation.** When a report has valid and malformed findings, the Fixer applies all valid findings and skips malformed ones. The `malformed-report` escalation triggers only when ALL findings fail validation.

### Fixer — mechanical fix applicator

**Purpose:** applies fixes from gate finding reports. Never reads rules, never greps, never runs exploratory commands.

**Behavioral protocol:**

**Patch model.** The Fixer matches each finding by `Current` text content, not by line number — `file:line` is a hint for fast lookup, not a contract. If the verbatim `Current` text is not at the indicated line, the Fixer searches the full file. If no match is found (content mutated by an earlier fix), the finding transitions to `blocked`. Within a single file, findings are processed in reverse line order to minimize staleness from earlier fixes shifting line numbers.

**Cross-file processing order.** Findings are processed in report order (top to bottom). Priority order: `priority` field (0-4) from the T3 block whose rule ID appears in the finding's `Cause` field (lower number = higher priority). T2-relayed findings default to priority 2. Tiebreaks: file path alphabetical order. Within each file: reverse line order.

**Iteration definition.** One Fixer iteration = one finding attempt (read Current → apply Fix → run Verify). A T1 rejection during Fix application counts as a sub-attempt within the same iteration. The 3-T1-rejection cap limits sub-attempts per finding.

**Commit behavior.** The Fixer creates a git commit after each successfully verified finding. Commit message format: `fix(<gate>-r<round>): <one-line summary from Cause field>`. Git commit failure: retry once after 2-second wait. Second failure: escalate as `infra-failure` without reverting (Verify passed — code is correct). Finding remains in `applied` state.

**Verify timeout.** Each Verify command has a maximum execution time of 120 seconds (configurable via `.sandcastle/config.json` key `fixer.verifyTimeout`). Exceeded → SIGTERM, then SIGKILL after 5 seconds. Treated as verify failed; changes reverted.

**T1 rejection cap per finding.** A single finding gets at most 3 T1 rejections before the Fixer abandons it:

1. Finding escalated as `t1-conflict` — conflict between T3 finding's fix and T1 enforcement rule
2. Escalation includes both the T3 finding and the T1 rule
3. Fixer moves to next finding. The ticket can still close when the human resolves the conflict.

`t1-conflict` is a per-finding escalation — it does NOT add an `escalation:t1-conflict` label to the ticket. Instead, the finding is recorded in ticket notes with `t1-conflict:<rule-id>@<agent>:` prefix and transitions to `settled` state.

**Revert cascade check.** After any revert, the Fixer re-runs Verify for all previously-applied findings in the same file. If a previously-applied fix now fails verification, that finding transitions to `reverted`. The cascade is single-pass and bounded to at most N re-verifications (N = applied findings in file). Findings that fail during cascade do not trigger another cascade pass.

**Partial revert failure (GAP-460).** If the Fixer cannot revert all targets of a multi-target finding, the finding is escalated as `infra-failure`.

**File-not-found.** If the target file does not exist on disk, the finding transitions to `blocked`.

**Edge cases:**

| Condition | Behavior |
|---|---|
| `Current` text not at indicated line | Search full file |
| `Current` text not found anywhere | Finding transitions to `blocked` |
| Target file deleted | Finding transitions to `blocked` |
| Verify fails | Revert all changes for that finding, run revert cascade, move to next finding |
| Verify times out (>120s) | Kill, treat as verify failed |
| Git commit fails once | Retry after 2-second wait |
| Git commit fails twice | Escalate `infra-failure`, finding stays `applied` |
| 3 T1 rejections on same finding | Escalate `t1-conflict`, finding transitions to `settled` |
| Partial revert failure | Escalate `infra-failure` |
| All findings malformed | Escalate `malformed-report` |

### Prompt expansion pipeline

**Purpose:** three-stage sequential expansion produces the final agent prompt from template + inputs.

**Prompt templates** live in `.sandcastle/prompts/` with one file per agent role: `implementer.prompt.md`, `visual-qa.prompt.md`, `reviewer.prompt.md`, `fixer.prompt.md`. Missing template → exit 2.

**Stage 1: `{{VAR}}` substitution.** Recognized variables from a whitelist:

| Variable | Source | Content |
|---|---|---|
| `{{ISSUE_ID}}` | Orchestrator | Ticket identifier |
| `{{ISSUE_TITLE}}` | Tracker API | Ticket title |
| `{{ISSUE_BODY}}` | Tracker API | Ticket description |
| `{{ISSUE_LABELS}}` | Tracker API | Comma-separated label list |
| `{{CODEMAP}}` | Planner | Structural summary of relevant codebase |
| `{{DIFF_REF}}` | Orchestrator | Git diff range |
| `{{FIX_HISTORY}}` | Orchestrator | Fixer commit messages from prior rounds (empty in Round 1) |

`{{T3_VISUAL_CHECKS}}` and `{{T3_REVIEW_CHECKS}}` are reserved for Stage 3. Unrecognized `{{VAR}}` patterns are left as literal text.

**Stage 2: `` !`cmd` `` shell expansion.** Runs on host. Failure handling (GAP-466): non-zero exit or timeout (30-second default, configurable via `pipeline.shellTimeout`) → replaced with empty string, warning logged. Prompt proceeds with less context, not corrupted context.

**Stage 3: T3 rule injection.** `apply-t3.mjs` produces payloads for `{{T3_VISUAL_CHECKS}}` and `{{T3_REVIEW_CHECKS}}`.

Stages execute sequentially (1 → 2 → 3), single-pass — no stage's output is re-expanded by a later stage. Expanded prompts saved to `.sandcastle/logs/{ticketId}/{phase}.prompt.md` for inspection and replay.

**Fix history collection.** The orchestrator collects `{{FIX_HISTORY}}` via: `git log --oneline --grep="^fix(" <gate-start-HEAD>..HEAD`.

### `npm run review` — morning review command

**Purpose:** single report aggregating all pending human review items.

| Source | What it checks | How |
|---|---|---|
| Escalated tickets | `escalation:*` labels in tracker | Tracker API query |
| Human-tier checklist | Rules needing human review | `audit:rules` Human-tier output |
| Per-finding conflicts | `t1-conflict` entries in ticket notes | Tracker API notes search |
| Triage overflow | Skipped rule IDs from latest pipeline run | Parse `.sandcastle/logs/*/overflow-skipped.jsonl` |
| Screenshot baselines | New or changed screenshots | `git diff --name-only -- e2e/__screenshots__/` |

Exit 0 = nothing needs review. Exit 1 = items pending.

---

## Format Schemas

### T1 enforcement block

**Purpose:** machine-readable spec for source-text pattern checks. Produced by rule-creator, consumed by `apply-t1.mjs`.

**Fields:**

| Field | Type | Required | Valid values | Default | Description |
|---|---|---|---|---|---|
| `id` | string | Yes | `<heading-slug>` (max 40 chars) | Auto-generated | Stable unique identifier |
| `tier` | string | Yes | `T1` | — | Always `T1` |
| `tool` | string | No | Linter rule name | — | AST-based linter that is primary enforcer. `pattern` becomes fallback. |
| `pattern` | string | Yes | Valid regex | — | Regex that detects the violation. Multiple `- pattern:` entries are AND. |
| `assert` | string | Yes | `absent`, `present` | — | `absent` = pattern must NOT appear. `present` = pattern MUST appear. |
| `scope` | string | Yes | File glob | — | Where the check runs. Narrow is better. |
| `exclude` | string | No | File glob | — | Files exempted from the check |
| `strip` | string | No | `comments`, `strings`, `comments+strings` | none | Remove syntax categories before matching |
| `fix` | string | Yes | Free text | — | Tells the agent exactly how to fix the violation |

**Example:**

````markdown
- No `any` types; use `unknown` and narrow.

  ```enforcement
  id: "no-any"
  tier: T1
  tool: "ESLint @typescript-eslint/no-explicit-any"
  - pattern: ":\\s*any\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: comments+strings
    fix: "Use unknown and narrow with a type guard"
  - pattern: "as any"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    strip: comments+strings
    fix: "Use a specific type assertion or unknown"
  ```
````

### T2 enforcement block

**Purpose:** machine-readable spec for runtime behavior checks. Consumed by `ui-contract` (per-component or global).

**Fields:**

| Field | Type | Required | Valid values | Default | Description |
|---|---|---|---|---|---|
| `id` | string | Yes | `<heading-slug>` | Auto-generated | Stable unique identifier |
| `tier` | string | Yes | `T2` | — | Always `T2` |
| `scope` | string | Yes | `per-component`, `global` | — | Determines when, where, and how it runs |
| `assert` | string | Yes | Callable (global) or description (per-component) | — | The assertion or helper to call. Global scope: must be callable. Per-component: may be descriptive. |
| `coverage` | string[] | No | Sub-assertion descriptions | — | Sub-assertions the generated test must exercise |

**Assert format constraint for global scope.** T2 global blocks must use a callable assert value (function or helper name), not a description. `audit:rules` validates this.

**Examples:**

Per-component:

````markdown
- Focus trap in dialogs: Tab cycles within, Escape closes, focus returns to trigger.

  ```enforcement
  id: "focus-trap-dialogs"
  tier: T2
  scope: per-component
  assert: "openDialog() -> Tab cycles within dialog -> Escape closes -> focus returns to trigger element"
  coverage:
    - "Tab forward cycles within dialog"
    - "Shift+Tab backward cycles within dialog"
    - "Escape closes dialog"
    - "Focus returns to trigger element after close"
  ```
````

Global:

````markdown
- No axe violations.

  ```enforcement
  id: "no-axe-violations"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) -- run against every fixture"
  ```
````

### T3 enforcement block

**Purpose:** machine-readable spec for LLM-evaluated intent alignment checks. Consumed by `apply-t3.mjs`.

**Fields:**

| Field | Type | Required (VQA) | Required (Reviewer) | Valid values | Default | Description |
|---|---|---|---|---|---|---|
| `id` | string | Yes | Yes | `<heading-slug>` | Auto-generated | Stable unique identifier |
| `tier` | string | Yes | Yes | `T3` | — | Always `T3` |
| `agent` | string | Yes | Yes | `visual-qa`, `reviewer` | — | Which agent evaluates this rule |
| `scope` | string | Always `"*"` | Recommended | File glob | — | VQA: universal. Reviewer: missing scope triggers warning, counts against 10-rule scopeless budget. |
| `instruction` | string | Yes | Yes | YAML double-quoted scalar | — | Full evaluation protocol: (1) what to look for, (2) what counts as a violation, (3) what correct looks like |
| `group` | string | **Yes** | Optional | Group name | — | VQA: chunking key. Reviewer: triage affinity (if Haiku flags any rule in a group, all rules in that group promoted to Phase 2). |
| `priority` | integer | Optional | Optional | 0-4 | 2 | 0 = critical, 4 = backlog. Used for triage overflow ordering. |
| `triage_exempt` | boolean | Not used | Optional | `true`, `false` | `false` | Reviewer only. Bypasses triage. Max 10 across project. Does not count toward 80-rule non-exempt budget. |
| `triage_hint` | string | Not used | Recommended | Keywords | — | Relevance hint for Haiku during two-phase triage |
| `exclude` | string | Not used | Optional | File glob | — | Files excluded from reviewer scope |

**YAML formatting for `instruction`.** The value must be a YAML double-quoted scalar (wrapped in `"..."`). Embedded double quotes escaped with backslash. Multi-line instructions use `\n` within the scalar.

**Examples:**

Visual QA:

````markdown
- Exit is never slower than enter.

  ```enforcement
  id: "exit-not-slower"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: motion
  instruction: "For each animated element, call readAnimations() to capture enter and exit durations. Compare: exit duration must be <= enter duration. Flag if exit is slower."
  ```
````

Reviewer:

````markdown
- Components own no space outside themselves.

  ```enforcement
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  exclude: "src/styles/tokens.css"
  triage_hint: "Flag when: margin property appears in component CSS, new component root selector added"
  instruction: "Scan component root selectors in the diff for margin properties. A component must not set margin on its own root element -- the parent layout owns spacing via gap or padding. Flag any margin on a component root."
  ```
````

### Human enforcement block

**Purpose:** machine-readable spec for rules requiring human judgment.

**Fields:**

| Field | Type | Required | Valid values | Default | Description |
|---|---|---|---|---|---|
| `id` | string | Yes | `<heading-slug>` | Auto-generated | Stable unique identifier |
| `tier` | string | Yes | `Human` | — | Always `Human` |
| `review` | string | Yes | `morning-review` | — | The review cycle that handles these |
| `reason` | string | Yes | Free text | — | Why this can't be T1/T2/T3. Helps future promotion audits. |

**Example:**

````markdown
- Keep modules focused on a single responsibility.

  ```enforcement
  id: "single-responsibility"
  tier: Human
  review: morning-review
  reason: "Subjective -- reasonable people disagree on responsibility boundaries"
  ```
````

### Multi-tier enforcement block

**Purpose:** rules with facets enforceable at different tiers. Each entry catches a genuinely different class of violation.

`---` separates entries within one enforcement fence. Each entry is independent and belongs to exactly one tier. The `---` is recognized as a separator only at column 0.

All entries share the same `id` value. Parsers qualify with `@<tier>` at runtime (e.g., `motion-tokens@T1`). The `@tier` qualifier is never stored in the block.

**Example:**

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

**Cross-tier context during enforcement.** When T1 blocks a write, the rejection message contains only T1 information. The agent does not see related T3 entries. T3 evaluates the corrected code later in the pipeline.

### Rejection message format

**Purpose:** what the agent sees when `apply-t1.mjs` blocks a write. Produced by `apply-t1.mjs`, consumed by the agent.

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| Header | `BLOCKED: T1 violation` | Yes | Fixed prefix |
| `file` | Path | Yes | Relative file path |
| `line` | Integer | Yes | Line number of match |
| `match` | String | Yes | Matched text |
| `rule` | String | Yes | Rule text |
| `fix` | String | Yes | How to fix |

### Malformed YAML handling

**Purpose:** defines how each parser responds to unparseable YAML inside enforcement fences.

| Parser | On malformed YAML |
|---|---|
| `apply-t1.mjs` | **Fail-closed per file.** Block ALL writes to files matching ANY `scope` glob from that rules file (using mtime-cached scope list from last successful parse). No cached scope → exit 2, block all writes. |
| `ui-contract` | **Skip block with warning.** Other blocks in the same file proceed. |
| `apply-t2.mjs` (Global T2) | **Skip block with warning.** Valid blocks proceed. |
| `apply-t3.mjs` | **Skip block with warning.** Other blocks in same file included. |
| `audit:rules` | **Report as error.** File, line, specific YAML error message. Exit 1. |

---

## State Machines

### Finding lifecycle

Every finding moves through a defined state machine. A finding is always in exactly one state.

**States:**

| State | Meaning | Entry condition |
|---|---|---|
| `pending` | Reported by a gate, not yet processed | Gate emits finding in its report |
| `applied` | Fixer wrote the fix and verify passed | Verify exits 0 after applying Fix |
| `reverted` | Fixer applied fix but verify failed; changes rolled back | Verify exits non-zero; Fixer undoes changes |
| `settled` | Fixer intentionally skipped the finding and recorded rationale | Fixer adds `settled` tracker label + rationale in ticket notes |
| `blocked` | Finding cannot be applied — `Current` text not found | Verbatim `Current` text not found in file |

**Transitions:** `pending` → `applied` | `reverted` | `settled` | `blocked`. No other transitions are valid. A `reverted` or `blocked` finding is re-detected with fresh content in the next gate round (new `pending` finding). A `settled` finding is not re-raised — the gate checks the `settled` tracker label.

**Invariants:**

- A finding is always in exactly one state
- Only `pending` transitions to other states
- `applied`, `reverted`, `settled`, `blocked` are terminal within a round

**Settlement atomicity.** The `settled` tracker label is authoritative — it controls the pre-filter. Rationale in ticket notes is best-effort context. Label write succeeds + rationale fails → finding settled, missing rationale logged as warning. Rationale succeeds + label fails → finding NOT settled. Fixer retries label write once before abandoning settlement.

**`t1-conflict` suppression.** After 3 T1 rejections, the Fixer transitions the finding to `settled` with `t1-conflict:<rule-id>@<agent>:` prefix in notes. The pre-filter reads both `settled:` and `t1-conflict:` entries.

**Per-finding settlement tracking.** Settlement is per-finding (per rule ID + agent), not per-ticket. The `settled` label on the ticket signals at least one finding is settled. Specific settled rule IDs recorded in notes with `settled:<rule-id>@<agent>:` prefix. The pre-filter strips findings only when both rule ID and agent match.

**Enforcement mechanism:** The orchestrator reads finding states from `finding-states.jsonl` and settled labels from the tracker before each gate invocation. The pre-filter suppresses settled findings in prompt expansion (Stage 3). The Fixer queries `finding-states.jsonl` by `state` and `fileLine` for revert cascade checks.

### Ticket statuses

The pipeline assumes three statuses from the external tracker:

| Status | Meaning | Set by |
|---|---|---|
| `open` | Available for pickup | Re-queue, ticket creation |
| `in_progress` | Claimed by an agent | Planner assigns ticket to Implementer |
| `closed` | Work complete, verified | Merger after all gates pass |

Any non-`open` non-`in_progress` non-`closed` status is opaque — the pipeline does not select those tickets.

**Labels.** Tickets entering the pipeline must carry the `Sandcastle` label. The Planner selects only `open` tickets with `Sandcastle`. Pipeline labels are additive-only: the pipeline adds labels (`escalation:<reason>`, `settled`, `bug`) but never removes them except during re-queue (removes only `escalation:<reason>`).

### Gate verdicts

| Verdict | Meaning |
|---|---|
| `PASS` | Evaluated, no violations found |
| `FAIL` | Evaluated, violations found (findings list required) |
| `DEFER` | Insufficient evidence to evaluate (screenshots failed, dev server didn't start) |
| `FAIL` with zero findings | Malformed report — escalate immediately |
| Unparseable output | Treat as `DEFER`. Escalate with `gate-defer`. Raw output preserved. |

---

## Entity Lifecycle Operations

### Rules

| Operation | Supported | Component | Notes |
|---|---|---|---|
| Create | Yes | Rule-creator skill | Interactive day shift. Sorting test + enforcement block generation. |
| Read | Yes | All five parsers | `discoverRulesFiles()` + `parseEnforcementBlocks()` |
| Update | Yes | Rule-creator skill | Reclassify, edit instruction, change scope |
| Delete | Yes | Rule-creator skill | Remove rule + block, warn on orphaned references |
| Promote | Yes | Rule-creator skill | Move to cheaper tier (T3→T2, T3→T1, T2→T1) |
| Demote | Yes | Rule-creator skill | Move to higher tier when enforcement becomes inadequate |

### Findings

| Operation | Supported | Component | Notes |
|---|---|---|---|
| Create | Yes | Gate agents (Visual QA, Reviewer) | Gate emits finding in report |
| Read | Yes | Fixer, orchestrator | Finding report, `finding-states.jsonl` |
| Apply | Yes | Fixer | Patch model: Current → Fix → Verify |
| Settle | Yes | Fixer | `settled` label + rationale in notes |
| Un-settle | Yes | Human (manual) | Remove notes entry + label if no others remain |
| Block | Yes | Fixer | Current text not found |
| Revert | Yes | Fixer | Verify failed → rollback |

### Tickets

| Operation | Supported | Component | Notes |
|---|---|---|---|
| Create | Yes | `to-tickets`, Global T2 child bug creation | Day shift (to-tickets), night shift (Global T2 bugs) |
| Read | Yes | Planner, orchestrator | Tracker API |
| Claim | Yes | Planner | Set `in_progress` |
| Close | Yes | Merger | After all gates pass |
| Escalate | Yes | Orchestrator | Add `escalation:<reason>` label |
| Re-queue | Yes | Human (manual) | Remove escalation label, return to `open` |

---

## Record Schemas

### `gate-verdicts.jsonl`

**Format:** JSONL (append-only)

**Location:** `.sandcastle/logs/{ticketId}/gate-verdicts.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | Yes | Pipeline run identifier |
| `ticketId` | string | Yes | Ticket identifier |
| `gate` | string | Yes | `visual-qa` or `reviewer` |
| `round` | integer | Yes | Gate round number |
| `verdict` | string | Yes | `PASS`, `FAIL`, or `DEFER` |
| `findingCount` | integer | Yes | 0 for PASS/DEFER, positive for FAIL |
| `timestamp` | string | Yes | ISO 8601 |

**Example:**

```json
{ "runId": "run-2026-10-12-001", "ticketId": "beads-42", "gate": "visual-qa", "round": 1, "verdict": "PASS", "findingCount": 0, "timestamp": "2026-10-12T03:14:00Z" }
```

### `finding-states.jsonl`

**Format:** JSONL (append-only)

**Location:** `.sandcastle/logs/{ticketId}/finding-states.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | Yes | Pipeline run identifier |
| `findingId` | string | Yes | Compound key: `<file:line>\|<ruleId>` |
| `ruleId` | string | Yes | Qualified rule ID (e.g., `no-outer-margin@T3`) |
| `fileLine` | string | Yes | Source location (e.g., `src/components/Card.css:12`) |
| `state` | string | Yes | `applied`, `reverted`, `settled`, `blocked` |
| `previousState` | string | Yes | State before this transition |
| `round` | integer | Yes | Gate round number |
| `gate` | string | Yes | `visual-qa` or `reviewer` |
| `timestamp` | string | Yes | ISO 8601 |
| `detail` | string | No | Revert reason, settlement rationale, or block reason |

**Example:**

```json
{ "runId": "run-2026-10-12-001", "findingId": "src/components/Card.css:12|no-outer-margin@T3", "ruleId": "no-outer-margin@T3", "fileLine": "src/components/Card.css:12", "state": "applied", "previousState": "pending", "round": 2, "gate": "visual-qa", "timestamp": "2026-10-12T03:14:00Z", "detail": "" }
```

**JSONL recording for settlement.** The entry is written only after the tracker label write succeeds. If label write fails and finding remains `pending`, no `settled` entry is written.

### `cycle-signatures.jsonl`

**Format:** JSONL (append-only)

**Location:** `.sandcastle/logs/{runId}/cycle-signatures.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | Yes | Pipeline run identifier |
| `signature` | object | Yes | `{ testName, filePath }` — the cycle detection key |
| `ticketId` | string | Yes | Scoped per ticket |
| `recurrence` | integer | Yes | Count at time of observation (1 = first recurrence) |
| `round` | integer | Yes | Pipeline round number |
| `timestamp` | string | Yes | ISO 8601 |

**Example:**

```json
{ "runId": "run-2026-10-12-001", "signature": { "testName": "Drawer > focus trap > Tab cycles within dialog", "filePath": "src/components/Drawer.tsx" }, "ticketId": "beads-42", "recurrence": 1, "round": 3, "timestamp": "2026-10-12T03:14:00Z" }
```

### `overflow-skipped.jsonl`

**Format:** JSONL (append-only)

**Location:** `.sandcastle/logs/{runId}/overflow-skipped.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleId` | string | Yes | Qualified rule ID |
| `agent` | string | Yes | `reviewer` |
| `reason` | string | Yes | `count-overflow`, `token-overflow`, or `triage-phase2-cap` |
| `runId` | string | Yes | Pipeline run identifier |

### `triage-exclusions.jsonl`

**Format:** JSONL (append-only)

**Location:** `.sandcastle/logs/{runId}/triage-exclusions.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleId` | string | Yes | Qualified rule ID |
| `runId` | string | Yes | Pipeline run identifier |
| `diffRef` | string | Yes | Commit range Haiku triaged |
| `ticketId` | string | Yes | Ticket identifier |

### `triage-misses.jsonl`

**Format:** JSONL (append-only)

**Location:** `reviews/triage-misses.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleId` | string | Yes | Qualified rule ID |
| `runId` | string | Yes | Pipeline run identifier |
| `diffRef` | string | Yes | Commit range |
| `detectedIn` | string | Yes | `manual-review` or `subsequent-run` |

### `human-tier-log.jsonl`

**Format:** JSONL (append-only)

**Location:** `reviews/human-tier-log.jsonl`

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `rule` | string | Yes | Rule text |
| `file` | string | Yes | Rules file path |
| `reviewedBy` | string | Yes | Reviewer identity |
| `reviewedAt` | string | Yes | Date in `YYYY-MM-DD` format |
| `scope` | string | Yes | Spec issue ID from tracker |
| `verdict` | string | Yes | `pass`, `fail`, `defer`, or `created` |

`verdict` is a closed enum. `pass` and `fail` count as "reviewed." `defer` = acknowledged but not reviewed. `created` = bootstrapping state from rule-creator.

**New rule bootstrapping.** Rule-creator writes a `created` entry at creation time with `reviewedBy: "rule-creator"` and `scope: "initial"`. The entry upgrades to a proper verdict when a human acts on it.

---

## Algorithms and Processing Rules

### The sorting test — classifying a rule

**Purpose:** assigns every rule to exactly one tier. Used by the rule-creator skill interactively.

**Input:** a rule's text and the user's domain knowledge.

**Steps:**

1. **Q1: Source text.** The non-compliance is in what the code SAYS — can a tool see it in the source text without executing anything? If yes → T1.
2. **Q2: Runtime behavior.** The non-compliance is in what the code DOES — can a test catch it with deterministic pass/fail? If yes → T2 (then: per-component or global?).
3. **Q3: Intent alignment.** The non-compliance is in what the code MEANS — does it require interpretation, and would three reviewers converge? If yes → T3 (then: visual-qa or reviewer?).
4. **Q4: Subjective.** The non-compliance is in what the code SHOULD BE — genuinely subjective? → Human.

**Output:** tier assignment (T1, T2, T3, or Human) with agent selection for T3.

**Edge cases:**

| Condition | Behavior |
|---|---|
| Token-promotion trap | A rule that looks like T2 is actually T1 if the token system handles runtime behavior by construction. Check before writing a T2 block. |
| Adjective trap | Qualifying adjectives ("descriptive", "meaningful") without objective referent → Human, not T3. |

**The golden rule:** assign the lowest tier that reliably catches every non-compliance. No overlap — each rule is enforced at exactly one tier (except multi-tier rules where each tier catches a genuinely different class).

**Completeness guarantee.** SAYS / DOES / MEANS / SHOULD BE covers every possible non-compliance. No fifth case.

### Strip engine — comment and string removal

**Purpose:** removes syntax categories from file text before regex matching. Used by `apply-t1.mjs`.

**Input:** file content, file extension, strip mode.

**Steps:**

1. Map file extension to syntax: `.css` → `/* */`; `.ts`/`.tsx` → `//`, `/* */`, string literals
2. Apply removal based on mode:
   - `comments` — line and block comments
   - `strings` — string literals (single, double, template)
   - `comments+strings` — both
3. Return stripped text for regex matching

**Edge cases:**

| Condition | Behavior |
|---|---|
| Unmapped extension (GAP-465) | Skip stripping (match raw text), warning logged |
| Unrecognized strip value | Treat as `strip: none`, warning logged |
| `strip: none` or omitted | Match raw text (default) |

### Two-phase triage (Reviewer overflow)

**Purpose:** when non-exempt Reviewer rules exceed 80 after scope-gating, cheaply screen for relevance. Used by `apply-t3.mjs`.

**Input:** all non-exempt surviving rules + git diff.

**Steps:**

1. **Phase 1 (Haiku, cheap):** send all non-exempt surviving rules as one-line `triage_hint` values + diff. Output: list of rule IDs that MIGHT be violated (over-inclusive). Haiku is told "when uncertain, include the rule."
2. **Group expansion:** for each flagged rule with a `group` field, expand to include all rules in the same group (even if Haiku didn't flag them individually).
3. **Phase 2 (Sonnet, precise):** send flagged + group-expanded rules with full instructions + diff. If expanded set > 80: take top 80 by priority (tiebreak: rule ID lexicographic), log the rest.
4. Triage-exempt rules always injected (bypass Phase 1 and Phase 2 cap).
5. Max payload: 80 non-exempt + up to 10 exempt = 90 ceiling.

**Edge cases:**

| Condition | Behavior |
|---|---|
| Phase 1 flags zero rules | Log triage anomaly warning (suspicious on large diffs). Proceed with triage-exempt only. |
| Expanded set > 80 | Take top 80 by priority. Log skipped rules to `overflow-skipped.jsonl`. |
| Zero non-exempt rules survive scope-gating | Run with triage-exempt only. Zero exempt also → skip Code Gate entirely, log skip. |

### Finding processing order

**Purpose:** determines the order the Fixer processes findings.

**Input:** gate report.

**Steps:**

1. Sort by `priority` field from T3 block's rule ID (lower = higher priority). T2-relayed findings default to priority 2.
2. Tiebreak within same priority: file path alphabetical order.
3. Within each file: reverse line order (process from bottom to top to minimize staleness).

### Rule ID generation

**Purpose:** produces stable unique identifiers for enforcement blocks. Used by rule-creator.

**Input:** rule heading text.

**Steps:**

1. Lowercase the heading
2. Replace spaces with hyphens
3. Truncate to 40 characters
4. Check for collision with existing IDs across all rules files
5. On collision: append numeric suffix (`-2`, `-3`, etc.)

The filename and tier are excluded — IDs are stable across file moves and promotions. The `@<tier>` qualifier is derived at runtime, never stored.

### Cycle detection

**Purpose:** detects findings stuck in fix-break-fix loops. Used by the orchestrator.

**Input:** failure signatures across pipeline rounds.

**Steps:**

1. Track signatures as `(full test name, file path, ticket ID)` — scoped per ticket
2. On 2nd recurrence: run LLM cycle-detection check (feeds original failure, each fix attempt's diff, new failure). Timeout: 30 seconds. Any non-success outcome (malformed response, API error, timeout) → treat as cycle detected (fail-closed).
3. If cycle detected → escalate finding as `spec-exhaustion`
4. On 3rd recurrence → escalate unconditionally
5. Loop continues fixing remaining findings

**Recovery:** `.sandcastle/logs/` is a host-mounted volume. On restart, orchestrator re-reads `cycle-signatures.jsonl` for current `runId`, filters by `runId`, groups by `signature` + `ticketId`, takes max `recurrence`. Lines that fail JSON parsing are discarded with warning.

---

## Pipeline / Execution Flow

```
OUTER LOOP (no hard round cap — terminates on completion, escalation, or cost ceiling)
│
├─ Phase 1: Planner (Opus, 1 iteration)
│   Reads backlog, builds dependency graph, selects unblocked tickets.
│   Selects only `open` tickets with `Sandcastle` label.
│
├─ Phase 2: Implementer (Opus, up to 100 iterations) — per ticket, parallel
│   T1 enforcement: PreToolUse hook → apply-t1.mjs
│   T2 per-component: locked acceptance specs from e2e/acceptance/ (TDD loop)
│   Exhaustion: 100 iterations → escalate `implementer-exhaustion`. Do NOT proceed to gates.
│
├─ Phase 3: Visual Gate (UI tickets only, max 3 rounds)
│   Visual QA (Sonnet) + Fixer loop (up to 20 iterations per round)
│   Escalation blocks Phase 4 progression.
│
├─ Phase 4: Code Gate (all tickets, max 3 rounds)
│   Reviewer (Sonnet) + Fixer loop (up to 20 iterations per round)
│   Escalation blocks Phase 5 progression.
│
├─ Phase 5: Merger (Opus, up to 3 iterations)
│   Merges all passed branches. Conflict resolution via semantic understanding.
│   T1 hooks active during merge. Full test suite after resolution.
│
└─ Global T2 suite (script, no LLM)
    Runs post-merge against every fixture × every viewport.
    Fail → creates child bug tickets. Hard round limit: 5.
    Spec complete when: all tickets closed AND global T2 green.
```

### Routing criteria

| Decision point | Criteria | Data source |
|---|---|---|
| Ticket enters pipeline | Status `open` + `Sandcastle` label | Tracker API |
| Skip Phase 3 | No `ui` label on ticket | Tracker API |
| Fixer stops | 20 iterations exhausted in current round | Iteration counter |
| Oscillation | Same `file:line` + same Cause category in rounds N and N-1 | Gate verdicts + finding reports |
| Reviewer scope narrowing | Round 2+: only Fixer's changes since previous round | Git diff |
| Two-phase triage activates | Non-exempt surviving rules > 80 | `apply-t3.mjs` count |
| Global T2 child bug creation | Assertion fails for fixture × viewport | Playwright test output |
| Global T2 auto-close | Previously-failing assertion now passes | Test output vs open child tickets |
| Spec completion | All child tickets closed AND global T2 green | Tracker + test output |

### Phase details

**Phase 1: Planner.**

Dependencies derived from tracker's native mechanism: Beads uses `--parent=<id>`, GitHub uses issue body references. A ticket is "unblocked" when all dependencies are `closed`.

| Failure mode | Behavior |
|---|---|
| Zero eligible tickets | Exit 0, log message |
| Tracker API failure | Exit 2, infrastructure crash recovery |
| Cyclic dependencies | Exclude cyclic tickets, proceed with acyclic. All cyclic → zero eligible. |

**Phase 2: Implementer.** Max 4 concurrent (configurable via `.sandcastle/config.json` key `implementer.parallelism`). Each runs in its own Docker container with an independent codebase copy. File-level race conditions impossible. Conflicts detected at merge (Phase 5).

Agent escalation signal: Implementer writes to `.sandcastle/signals/{ticketId}/escalation.json`. Orchestrator checks after each iteration.

**Phase 3: Visual Gate.** Round 1: Visual QA evaluates. PASS → Phase 4. FAIL → Fixer. Round 2: re-run full suite. Same signature as round 1 → oscillation → escalate. Round 3: re-run. Still failing → escalate `gate-exhaustion`.

Settlement read timing: pre-filter reads settlement state at prompt expansion time (Stage 3). Phases execute sequentially — Phase 3 settlements visible to Phase 4.

Phase 3 escalation (GAP-458): ticket does NOT proceed to Phase 4 or 5. Remains `in_progress` with escalation label.

**Phase 4: Code Gate.** Same structure as Phase 3. Round 1: Reviewer reviews full branch diff. Round 2+: narrowed diff (Fixer's changes only). Empty narrowed diff (all findings settled/blocked/reverted) → re-run full branch diff instead. Phase 4 escalation: ticket does NOT proceed to Phase 5.

**Phase 5: Merger.** Resolves conflicts semantically. T1 hooks active. Full test suite: `npm run typecheck && npm run lint && npm test && npm run e2e`. Exhaustion: merge non-conflicting branches, escalate conflicting ones.

Merger eligibility: Phase 4 PASS + Phase 3 PASS (if `ui` label). No active `escalation:*` label.

**Global T2 suite.** Post-merge. Hard round limit: 5 → escalate `global-oscillation`. Child bug ticket title: `[Global T2] {assertion name} — {fixture} @ {viewport}`. Deduplication: title-based. Labels: `bug`, `Sandcastle`. No `ui` label — skip Phase 3. Auto-close when assertion passes.

### Tier enforcement during Fixer's work

| Tier | Enforced? | How |
|---|---|---|
| T1 hooks | Yes | PreToolUse fires on every write |
| T1 lint/typecheck | Yes | Fixer's verify command |
| T2 tests | Yes | Fixer's verify command |
| T3 judgment | No | Caught in next gate round |

T3 is excluded to keep the Fixer cheap (Haiku target). The gate loop catches T3 regressions.

---

## Budget and Limits

| Limit | Value | Type | Applies to | Action |
|---|---|---|---|---|
| Non-exempt rules per LLM call | 80 | Hard | Both agents | Overflow strategy activates |
| Total per Reviewer call (non-exempt + exempt) | 90 | Derived hard | Reviewer | Enforced by 80 + 10 caps |
| Rules per visual-qa group | 80 | Hard | Visual QA | Split group or promote rules |
| Scopeless reviewer rules | 10 | Hard | Reviewer | Add scope or promote |
| Triage-exempt rules | 10 | Hard | Reviewer | Demote lowest miss-rate exempt rule |
| Total T3 rules | 150 | Soft (warning) | Both | Suggest promotion audit |
| Total T3 rules | 200 | Soft (warning) | Both | Suggest narrowing |
| Total T3 rules | 300 | Hard (CI error) | Both | Refuse new T3 rules |
| Single T3 instruction token size | 500 | Soft (warning) | Both | Tighten instruction |
| Assembled T3 payload token size | 30K | Hard (runtime) | Both | `apply-t3.mjs` auto-chunks |
| Implementer iterations | 100 | Hard | Implementer | Escalate `implementer-exhaustion` |
| Fixer iterations per gate round | 20 | Hard | Fixer | Unfixed findings carry forward |
| Gate rounds | 3 | Hard | Both gates | Escalate `gate-exhaustion` |
| Global T2 rounds | 5 | Hard | Global T2 | Escalate `global-oscillation` |
| Merger iterations | 3 | Hard | Merger | Escalate `merge-failure` |
| T1 rejections per finding | 3 | Hard | Fixer | Escalate `t1-conflict` |
| Agent context window | 100K tokens | Hard | All agents | Escalate `context-exceeded` |
| Pipeline cost ceiling | $50 | Hard (configurable) | Pipeline | Full halt `pipeline-budget-exceeded` |
| Verify timeout | 120 seconds | Hard (configurable) | Fixer | Kill + treat as verify failed |
| Shell expansion timeout | 30 seconds | Hard (configurable) | Prompt expansion | Replace with empty string |
| Dev server startup timeout | 30 seconds | Hard | Global T2 | Exit 2 |
| Regex match timeout | 5 seconds | Hard | `apply-t1.mjs` | Treat as violation (fail-closed) |
| Lock file staleness | 4 hours | Soft | Pipeline | Stale lock replaced |

All budget limits are inclusive — a count at the limit is valid; exceeding it triggers the action.

**Double-counting.** A rule with both `triage_exempt: true` and no `scope` counts against both the 10-exempt cap and the 10-scopeless cap.

---

## Configuration

| Key | Default | Valid values | On invalid |
|---|---|---|---|
| `rules.extraPaths` | `[]` | Array of globs | Invalid JSON → exit 2. Missing key → default. |
| `pipeline.costCeiling` | `$50` | Positive number | Invalid JSON → exit 2. Missing key → default. |
| `implementer.parallelism` | `4` | Positive integer | Invalid JSON → exit 2. Missing key → default. |
| `pipeline.backpressure` | `{ "maxConcurrent": 4, "minDiskMB": 500 }` | Object with both keys | Invalid JSON → exit 2. Missing key → default. |
| `pipeline.shellTimeout` | `30000` (30s) | Positive integer (ms) | Invalid JSON → exit 2. Missing key → default. |
| `fixer.verifyTimeout` | `120000` (120s) | Positive integer (ms) | Invalid JSON → exit 2. Missing key → default. |

Config file: `.sandcastle/config.json`. Optional. Missing file → all defaults. Invalid JSON → pipeline exit 2. Missing key → default for that key.

---

## Error Handling and Escalation

| Trigger | Escalation type | Action | Who resolves |
|---|---|---|---|
| Gate used all 3 rounds without PASS | `gate-exhaustion` | Tag ticket, attach evidence | Human reviews finding history |
| Same file:line + Cause category in consecutive rounds | `oscillation` | Tag ticket | Human resolves conflicting fixes |
| Agent exceeded 100K tokens | `context-exceeded` | End session, preserve applied fixes | Human splits ticket |
| All findings malformed OR FAIL with zero findings | `malformed-report` | Tag ticket | Human fixes agent prompt |
| Merger exhausted 3 iterations | `merge-failure` | Merge non-conflicting, tag conflicting | Human resolves merge |
| Resource exhaustion (concurrent agents, disk, rate limits) | `backpressure` | Pause or escalate | Human waits or increases capacity |
| Global T2 assertion recurs after fix | `global-oscillation` | Tag ticket after 5 rounds | Human fixes root cause |
| Cumulative LLM spend ≥ cost ceiling | `pipeline-budget-exceeded` | Full pipeline halt, label all in-flight tickets | Human adjusts ceiling or splits work |
| Implementer uses all 100 iterations | `implementer-exhaustion` | Do not proceed to gates | Human re-scopes ticket |
| Implementer detects wrong test or broken toolchain | `agent-escalation` | Immediate escalation | Human fixes test/tool |
| Spec-level cycle detection (2nd recurrence) | `spec-exhaustion` | LLM check, then escalate | Human fixes manually or updates spec |
| Docker/agent/network crash on 2nd attempt | `infra-failure` | Tag ticket | Human investigates infrastructure |
| 3 T1 rejections on same finding | `t1-conflict` | Per-finding: notes entry, finding settled | Human adjusts T1 or T3 rule |
| Gate returned DEFER | `gate-defer` | Tag ticket | Human investigates evidence collection |
| `apply-t2.mjs` exit 2 | `global-infra-failure` | Tag ticket | Human fixes dev server/test file |
| `apply-t3.mjs` exit 1 (budget exceeded) | `rule-budget-exceeded` | Full pipeline halt | Human reduces T3 rule count |

**Re-queue** = remove escalation label, return ticket to `open`, let next pipeline run pick it up.

**Un-settling (GAP-459).** Human removes `settled:<rule-id>@<agent>:` notes entry. If no other settled entries remain, removes `settled` label. Next pipeline run re-raises the finding.

**Concurrent run prevention.** Lock file at `.sandcastle/pipeline.lock` with `runId`. Existing lock < 4 hours old → exit 0 with message. Lock > 4 hours → stale, replaced. Removed at completion. Best-effort — not race-safe on networked filesystems.

---

## Metadata Storage Model

| Metadata | Storage | Rationale |
|---|---|---|
| Gate verdicts | `.sandcastle/logs/{ticketId}/gate-verdicts.jsonl` | High cardinality; queried by orchestrator and morning review |
| Finding states | `.sandcastle/logs/{ticketId}/finding-states.jsonl` | High cardinality; queried by Fixer and morning review |
| Settlement rationale | Tracker: `settled` label + notes | One per finding; queried by label filter and pre-filter |
| Escalation evidence | Tracker comment + `.sandcastle/logs/{ticketId}/` | One per escalation; comment for triage, filesystem for full chain |
| t1-conflict findings | Tracker: ticket notes | One per finding; queried by notes search |
| Review verdicts | `reviews/human-tier-log.jsonl` | Many per spec cycle; queried by `audit:rules` |
| Triage misses | `reviews/triage-misses.jsonl` | Many per run; queried by `audit:rules` |
| Triage exclusion lists | `.sandcastle/logs/{runId}/triage-exclusions.jsonl` | One per run; queried by triage-miss detection |
| Overflow-skipped rule IDs | `.sandcastle/logs/{runId}/overflow-skipped.jsonl` | One per run; queried by morning review |
| Cycle detection signatures | `.sandcastle/logs/{runId}/cycle-signatures.jsonl` | Append-only during run; survives restart |
| Expanded prompts | `.sandcastle/logs/{ticketId}/{phase}.prompt.md` | One per phase per ticket |

**Decision rule:** tracker (labels, notes, comments) for low-cardinality human-queried data. JSONL files for high-cardinality script-queried data.

**JSONL field naming convention.** All schemas use camelCase. The ticket identifier field is `ticketId` in all schemas.

---

## Testing Decisions

### Seam locations

| Seam | What it tests | Type |
|---|---|---|
| PreToolUse hook stdin/stdout | `apply-t1.mjs` receives JSON, exits 0 or 2 | Unit — existing pattern in `scripts/test-hooks.mjs` |
| `apply-t3.mjs` CLI interface | Takes `(issueId, diffRef)`, produces payload files, exits 0/1/2 | Integration — file I/O + budget |
| `apply-t2.mjs` CLI interface | Starts dev server, runs invariants.spec.ts, exits 0/1/2 | Integration — Playwright runner |
| `audit:rules` CLI interface | Scans rules files, exits 0 or 1 | Integration — parse + validate |
| `discoverRulesFiles()` utility | Shared discovery returns same file set for all parsers | Unit — pure function |
| `parseEnforcementBlocks()` utility | Parses fences, handles `---` separators, malformed YAML | Unit — pure function |
| Prompt expansion pipeline | 3-stage expansion produces correct prompt | Integration — stages 1→2→3 |
| Finding validation | Valid/malformed classification | Unit — pure function |
| Fixer patch model | Current-text matching, reverse-line-order, revert cascade | Unit — deterministic logic |

### What makes a good test for this system

Tests simulate the stdin/stdout contract: provide input (JSON on stdin for hooks, files on disk for parsers), assert exit code and output (stderr messages, generated files, payload directories). The existing hook test harness (`scripts/test-hooks.mjs`) establishes the pattern.

### Edge cases that MUST be covered

- Malformed YAML in enforcement fences (each parser's behavior)
- Zero rules files discovered
- Binary file detection
- Multi-tier block parsing with `---` at column 0 vs indented
- T1 conflicting rules (overlapping scope, opposite assert)
- Token budget overflow (>30K tokens triggers chunking)
- Finding validation (all malformed vs mix of valid/malformed)
- Fixer revert cascade (applied fix breaks overlapping earlier fix)
- Settlement atomicity (label succeeds + rationale fails, and vice versa)
- Cycle detection recovery from crash (truncated JSONL lines)

---

## The Rule-Creator Skill — Agentic Flow

The rule-creator skill (`.claude/skills/rule-creator/SKILL.md`) creates and maintains rules with enforcement blocks. Interactive, run during the day shift.

**Steps:**

1. **Discover rules files** — scan for harness rules directory and `CODING_STANDARDS.md`. Confirm with user.
2. **Inventory existing blocks** — count by tier for budget checks.
3. **Accept user input** — new rule, existing rule needing enforcement, or batch request.
4. **Run sorting test (interactive)** — walk Q1-Q4, present recommendation, wait for confirmation. Exception: user states classification with certainty → skip.
5. **Determine T3 agent** — visual-qa (visible in screenshot) or reviewer (code structure). Include rationale blockquote.
6. **Read tier format reference** — `references/tier-formats.md` for exact template.
7. **Generate enforcement block** — per-tier specifics for fields.
8. **Place block** — after rule text, ` ```enforcement ` fence, indented for bulleted lists.
9. **Run budget checks** — T3 counts across all files. Report per-file breakdown.
10. **Batch mode** — count rules upfront, groups of 3-5, reconcile M+K=N, cross-rule consistency check.
11. **Editing existing blocks** — re-run sorting test, replace block (targeted for multi-tier), re-run budgets, verify.
12. **Deleting a rule** — confirm ID, remove text + block, warn on orphaned references, verify.

---

## Promotion — Moving Rules to Cheaper Tiers

| Current → Target | Promotion signal | Action |
|---|---|---|
| T3 → T2 | Instruction says "check if X equals Y" | Write an automated assertion |
| T3 → T1 | Instruction says "scan for pattern Z" | Write a regex |
| T3 → T1 | Every finding is the same (deterministic) | Write a regex or lint rule |
| T3 → T2 | Judgment is "does value match one of N valid options" | Write a lookup-table test |
| T2 → T1 | Token system handles runtime behavior | T1 validates token usage |

Quarterly promotion audit when total T3 > 150: sort by trigger frequency, attempt to automate top 20.

Demotion (upward reclassification) follows the same process: re-run sorting test, replace block, run budget checks.

---

## Out of Scope

- Automated morning review (agentic baseline approval, escalation triage, Human-tier promotion) — design direction, not a commitment.
- CI-native job locking for distributed environments — `pipeline.lock` is best-effort.
- Rule authoring outside the rule-creator skill — manual authoring is possible but not the designed path.
- Cross-project rule sharing — rules are per-project.
- Runtime rule hot-reloading — rules are read-only during a pipeline run.

---

## Open Questions

None. All decisions in the input document have been resolved (104 decisions, 0 open gaps per the spec-gap-hunter record).
