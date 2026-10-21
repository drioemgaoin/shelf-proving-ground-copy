---
name: rule-creator
description: Create or edit rules with enforcement blocks in any rules file (.claude/rules/, CODING_STANDARDS.md, or project-specific). Use this skill when the user says "rule creator", "create a rule", "add enforcement", "enforce this rule", "add enforcement block", "classify this rule", or when adding, editing, or auditing rules that need enforcement tiers (T1/T2/T3/Human). Works with any stack — the tier system is universal; only the examples adapt.
---

# Rule Creator

You help create and maintain rules with enforcement blocks. Every rule needs two things: the rule text (what to do) and an enforcement block (how the pipeline enforces it). You write both in one pass.

## Discover rules files

Don't assume file names. Every agent harness has a native rules directory (`.claude/rules/`, `.cursor/rules/`, `.codex/rules/`, etc.). On first run, check which one exists and scan for any top-level `CODING_STANDARDS.md`. Then read additional paths from `.sandcastle/config.json` key `rules.extraPaths` (array of globs). If the config file is missing, `rules.extraPaths` defaults to `[]`. List what you find and confirm with the user: "I found these rules files — are there others?"

Throughout this skill, **"rules files"** means whatever set you discovered. Never hardcode paths.

## Why enforcement blocks matter

A rule without an enforcement block is unenforceable — it's prose that agents may or may not follow. The enforcement block tells the pipeline exactly how to check compliance. The system uses four tiers, ordered by cost:

| Tier | Checks with | Cost | Runs when |
|------|-------------|------|-----------|
| T1 | Regex, AST, lint, hooks | Free (tooling) | Pre-commit / pre-write |
| T2 | Automated tests (Playwright, Vitest, pytest, etc.) | Moderate (test runner) | Post-commit / post-merge |
| T3 | LLM agent reads code or screenshots | Medium–High | QA / review phase |
| Human | A person | Highest | Manual review |

The goal is always: **pick the cheapest tier that catches every violation.** Every tier upgrade costs more to run — T3 costs LLM tokens on every QA pass, Human costs a person's attention. Classifying a rule at T1 when it could be T3 is a permanent tax on the pipeline.

## Before you start

1. Read all discovered rules files
2. Count existing enforcement blocks by tier (you need these for budget checks)
3. Note which rules already have blocks and which don't

## The sorting test

If the user states their classification with certainty ("I've already decided it's T3", "just generate the block"), accept it and skip the sorting test for that rule — go straight to block generation. If the user expresses uncertainty ("I think this might be T3?", "this feels like T1"), treat it as a request for guidance and run the sorting test normally. The sorting test exists to help the user decide, not to second-guess a decision they already made. Still run the sorting test independently for any other rules in the same request that the user did not pre-classify.

For each rule, walk through this decision tree with the user. The key question at each step is concrete and specific — answer it honestly before moving to the next.

### Step 1: Can a tool catch it?

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

The test is whether the violation has a **syntactic signature** — a pattern in the source text that is always wrong regardless of context. Many rules that *sound* visual or semantic actually have syntactic proxies (e.g., "animate only transform and opacity" is really "no other properties in transition/keyframes declarations").

- **Yes** → **T1** (deterministic, pre-commit).
  Typical examples across stacks:
  - CSS: raw `px`/`rem`/hex values in component files, missing token prefix
  - TypeScript: `as any`, `export default`, nested ternaries
  - Python: bare `except:`, `type: ignore` without code
  - Go: `interface{}` instead of `any`, unchecked errors
  - General: naming conventions, import order, banned functions
- **Watch for the adjective trap.** Rules containing qualifying adjectives — "descriptive", "meaningful", "appropriate", "clear", "well-structured" — almost always require judgment, not syntax matching. "Use descriptive variable names" *sounds* like a naming convention (T1), but no regex can judge whether `x` is descriptive enough in context. If the rule's core criterion is a quality judgment, it's not T1 — continue down the tree. The test: could a regex flag a *false positive* on perfectly valid code? If yes, the rule needs judgment, not pattern matching.
- **Mostly, but not entirely** → still **T1**, but surface the gap. Some rules have a syntactic proxy that catches the structural violation while leaving a judgment aspect uncovered (e.g., "wrap errors with context" — a linter catches missing `%w`, but not whether the context message is meaningful). Classify the rule at T1 for the enforceable part. Then tell the user what isn't covered and suggest they write a separate rule for the judgment aspect if it matters to their team. One rule, one block — never split a single rule into multiple tiers. **Guard:** this branch only applies when the structural part is independently meaningful — removing the adjective still leaves a real, enforceable rule ("wrap errors" stands alone). If removing the adjective makes the rule vacuous or trivially satisfied ("log errors with sufficient context" → "log errors" is satisfied by any log call), the adjective is the rule's core criterion and the adjective trap takes precedence — continue down the tree.
- **Hard threshold with a soft qualifier** → **T1** on the threshold. When a rule pairs a measurable number with a qualitative intent phrase (e.g., "functions over 50 lines are split into smaller, focused units"), the threshold is the enforceable part and the qualifier describes *why* the team chose that threshold. Classify at T1 for the threshold. Surface the qualifier as a gap — if the team wants "focused" enforced independently, that's a separate rule. Don't let intent language pull a measurable threshold up to T3. Common examples of metric thresholds that are T1: line count limits (`max-lines-per-function`), character count limits, file size limits, nesting depth limits, parameter count limits, cyclomatic complexity — all are mechanically measurable by a linter or AST tool, never T3.
- **No** → continue to Step 2.

### Step 2: Can a test catch it?

Ask: "Can an automated test verify this rule at runtime, without an LLM judging the result?"

The test is whether there's a **deterministic pass/fail assertion** that can run against the rendered output, API response, or runtime behavior.

- **Yes** → **T2** (runtime pass/fail).
  Typical examples:
  - Frontend: axe a11y violations, layout overflow, pointer target size, layout shift, frame budget
  - API: response schema validation, latency budgets, error code contracts
  - General: integration tests, contract tests, performance benchmarks

  Then determine scope:
  - "Is this check specific to individual components — unique thresholds, states, or interactions?" → `scope: per-component`. The test is generated per ticket and runs in the implementer's TDD loop.
  - "Is this a project-wide invariant — the same check everywhere?" → `scope: global`. Written once, runs post-merge against all test fixtures as a script (no LLM).

  A rule is per-component OR global, not both. No double-checking.
- **No** → continue to Step 3.

### Step 3: Does it need LLM judgment?

Ask: "Does checking this rule require reading code or screenshots and making a judgment call?"

- **Yes, and reviewers would converge** → **T3** (LLM-evaluated). Then determine the agent:
  - "Is the violation visible in a screenshot or runtime behavior?" → `agent: visual-qa`
  - "Is the violation in code structure, naming, or style?" → `agent: reviewer`
- **Yes, but reviewers would disagree** → continue to Step 4.
- **No** → continue to Step 4.

The key test between T3 and Human is **reviewer convergence**: if you showed the same code to three experienced reviewers, would they consistently agree on what's a violation? T3 rules have an anchored standard — there's a concrete "what correct looks like" that reviewers converge on (e.g., "skeleton shapes match content layout" — you can see it or you can't). Human rules have a sliding standard — the judgment depends on context, team norms, or personal taste (e.g., "descriptive variable names" — what's descriptive enough varies by reviewer and domain). When the rule's core criterion is a qualifying adjective ("descriptive", "meaningful", "appropriate", "sufficient", "clear") and there's no objective referent that anchors the judgment, it's Human. The adjective trap from Step 1 applies here too: if the adjective resisted T1 because it requires judgment, ask whether that same judgment is stable enough for T3 or whether it shifts between reviewers.

### Step 4: Human only

The rule is inherently subjective, has no stable standard across reviewers, or is meta-process. → **Human**.
Examples: "single responsibility", "explicit over clever", "use glossary terms naturally", "use descriptive variable names".

Present your recommendation with reasoning. If the user disagrees, adjust — they know their codebase better than the decision tree.

## Generating the enforcement block

Once the tier is confirmed, read `references/tier-formats.md` for the exact YAML template and field guidance for that tier. For worked examples showing the full sorting-test-to-block workflow, read `references/worked-examples.md`.

**For T1 blocks:** always reference the specific linter, tool, or AST check that enforces the rule using the `tool` field — e.g., `tool: "errcheck"`, `tool: "ESLint no-unused-imports"`, `tool: "stylelint declaration-no-important"`. This helps teams configure CI and helps future audits. If multiple tools enforce the same rule, list the primary one. The `tool` field is in addition to the `pattern` — include both.

### T3 agent-selection rationale

When a rule is classified T3, include a brief blockquote note immediately after the enforcement block explaining why this rule gets `visual-qa` vs `reviewer`. The note follows the same pattern as gap notes — one or two sentences anchored to the decision criteria from Step 3. Example:

> **Agent:** `visual-qa` — the violation is visible in a screenshot (skeleton shapes vs content layout); code review alone cannot catch it.

> **Agent:** `reviewer` — the violation is in code structure (business logic placement); it is not visible in rendered output.

This rationale helps future audits understand the agent choice and decide whether to reclassify if the project's agent capabilities change.

### T3 instruction checklist

T3 blocks live or die by instruction quality. Before writing any `instruction:` field, include all three parts:

1. **What to look for** — the specific element, screen, or code pattern the agent should examine
2. **What counts as a violation** — the concrete condition that means the rule is broken
3. **What correct looks like** — a brief description of the passing state

A vague instruction like "Check that colors are accessible" will produce vague results. Write: "Check foreground/background color pairs in all text elements. A violation is any pair with contrast ratio below 4.5:1 for normal text or 3:1 for large text. Correct: all pairs meet WCAG AA thresholds."

### Human-tier log bootstrapping

When a rule is classified Human tier, write a `created` entry to `reviews/human-tier-log.jsonl` with the following fields:

- `rule`: the rule text
- `file`: the rules file path
- `reviewedBy`: `"rule-creator"`
- `reviewedAt`: today's date in `YYYY-MM-DD` format
- `scope`: `"initial"`
- `verdict`: `"created"`

Without this entry, `audit:rules` reports an error for the rule immediately.

### T3 instruction YAML format

The `instruction` value in T3 blocks must be a YAML double-quoted scalar (wrapped in `"..."`). Embedded double quotes are escaped with backslash. Multi-line instructions use `\n` within the scalar. Do not use block scalars (`|`, `>`).

### Where to place the block

Append the enforcement block immediately after the rule text, before the next rule or heading. The block uses an `enforcement` code fence — not `yaml`. Parsers key on this fence type.

If the rule is in a bulleted list, indent the block to match:

````markdown
- Rule text goes here.

  ```enforcement
  tier: T1
  - pattern: "..."
    assert: absent
    scope: "..."
    fix: "..."
  ```

- Next rule.
````

If rules are paragraphs or under their own headings, place the block directly after the paragraph.

## Budget checks

After generating any enforcement block, check these budgets **aggregated across all discovered rules files** — not just the file you're editing. Count by grepping every rules file for `tier: T3`, `scope: "*"`, and `triage_exempt: true`. Report the per-file breakdown for **every** discovered rules file (including unchanged files) alongside the aggregated totals — the consumer needs the full picture to understand where budget pressure comes from.

| Budget | Limit | Action |
|--------|-------|--------|
| Total T3 rules | 150 promotion audit, 200 soft cap, 300 hard cap | At 150+, suggest a promotion audit before adding more T3 rules. At 200+, suggest narrowing scopes or promoting to T1/T2. At 300, refuse to add more. |
| Scopeless T3 (reviewer only) | 10 | Reviewer rules missing `scope` count against this budget. VQA rules with `scope: "*"` are correctly formed — they are not scopeless. |
| `triage_exempt` (reviewer only) | 10 | `triage_exempt: true` bypasses triage. Max 10. Not used for VQA. A rule with both `triage_exempt: true` and no `scope` counts against both caps. |

When approaching a budget, suggest concrete mitigation: narrow the scope, split the instruction, or look for a syntactic proxy that would allow T1.

## Rule IDs

Every enforcement block requires an explicit `id` field — it is the first field in the block. Generate the ID using this algorithm:

1. Lowercase the rule's nearest heading
2. Replace spaces with hyphens
3. Truncate to 40 characters
4. Check for collision with all existing `id` values across all discovered rules files
5. On collision, append a numeric suffix (`-2`, `-3`, etc.)

The filename and tier are excluded from the ID — IDs are stable across file moves and tier promotions. Parsers derive a `@<tier>` runtime qualifier (e.g., `motion-tokens@T1`) but this qualifier is never stored in the block.

Write the `id` field explicitly into every enforcement block you generate. Mention the ID to the user so they can reference it in audit and triage tools.

## Batch mode

When the user asks you to add enforcement blocks to all rules in a file:

1. Read each rule and count them. State the total upfront: "I found N rules across these sections."
2. Present your tier recommendation with reasoning, in groups of 3–5
3. Wait for the user to confirm or adjust each group
4. Generate the blocks for confirmed rules
5. Move to the next group
6. **Reconcile.** After all groups are done, count the enforcement blocks you generated. The total must match the rule count from step 1. If it doesn't, find the missing rule — don't just report a wrong total.
7. **Cross-rule consistency check.** Scan for T1 conflicts — overlapping `scope` + same `pattern` + opposite `assert` values — across newly generated blocks AND existing blocks in all discovered rules files. Report conflicts as errors before writing.

This pacing matters — dumping 20 classifications at once overwhelms the user and invites rubber-stamping. Groups of 3–5 keep the conversation focused.

## Adding a new rule

1. **Discover first.** Run the discovery step (if not already done this session) to know which rules files exist and where.
2. **Always** ask the user to confirm which file and which section the rule belongs in — even if the match seems obvious. Suggest the closest thematic match from existing sections. STOP — wait for confirmation before writing.
3. Write the rule text — exactly one sentence, imperative mood. The rule states what's forbidden or required, nothing else. Remediation ("remove before committing", "use X instead") belongs in the enforcement block's `fix` field, not in the rule text. No qualifiers ("should", "try to"), no compound rules. If the user's request covers two distinct checks, split into two rules. Example: "Do not commit `console.log` statements." — not "Do not use console.log for debugging. Remove all console.log calls before committing." (the second sentence is remediation).
4. Run the sorting test — present your tier recommendation and wait for confirmation.
5. Generate the enforcement block.
6. Append both to the correct location.
7. Run budget checks.

## Editing an existing enforcement block

When the user wants to reclassify a rule (e.g., from T3 to T1 because new tooling exists) or update block fields:

1. Read the current block and note its tier.
2. If reclassifying: re-run the sorting test with the user. The new tooling changes the answer to Step 1 — acknowledge this explicitly.
3. Replace the entire enforcement block with the new tier's format. Don't try to patch fields across tier templates — each tier has its own schema.
4. Re-run budget checks. A tier change affects the counts — a T3→T1 promotion frees a T3 slot; a T1→T3 demotion adds one. Report the before and after values for each budget line that changed (total T3, scopeless, triage_exempt), so the consumer sees the impact without doing subtraction.
5. **Verify output.** After generating the modified file, confirm: (a) the old tier's block is completely absent — grep for its unique fields (e.g., `agent:` for T3, `review:` for Human); (b) the new tier's block is present with all required fields. If either check fails, regenerate — do not present partial output.

## Deleting a rule

1. Confirm the rule's `id` with the user.
2. Remove the rule text and its enforcement block from the rules file.
3. Warn if the `id` appears in other rules files or in `reviews/human-tier-log.jsonl` (orphaned references).
4. Verify the block is fully removed by grepping all discovered rules files for the `id`.

## Promotion and demotion

When editing a block and the tier changes, name which signal applies. The five promotion signals are:

| Current → Target | Signal |
|---|---|
| T3 → T2 | Instruction says "check if X equals Y" — write an automated assertion |
| T3 → T1 | Instruction says "scan for pattern Z" — write a regex |
| T3 → T1 | Every finding is the same (deterministic) — write a regex or lint rule |
| T3 → T2 | Judgment is "does value match one of N valid options" — write a lookup-table test |
| T2 → T1 | Token system handles runtime behavior — T1 validates token usage |

**Quarterly audit trigger:** when total T3 > 150, suggest a promotion audit of the top 20 rules by trigger frequency before adding more T3 rules.

Demotion (upward reclassification) follows the same process: re-run the sorting test, replace the block, run budget checks.

## Multi-tier rules

Some rules have facets enforceable at different tiers. Example: "values from tokens" — T1 catches raw values syntactically, T3 catches semantic misuse of a valid token. Each facet is a separate entry within one enforcement block, separated by `---`. Each entry belongs to exactly one tier. The same assertion never runs at two tiers.

When classifying, if you identify multiple facets, present each facet's tier separately during the sorting test. Generate one block with `---`-separated entries. See `references/tier-formats.md` > Multi-tier rules for the format.

## What not to do

- Don't change existing rule text unless it's genuinely ambiguous. Flag it to the user instead.
- Don't generate enforcement blocks without the user confirming the tier. The sorting test is interactive — skipping confirmation trains the user to distrust the output.
- Don't use T3 when T1 or T2 would work. Always look for the syntactic proxy first.
- Don't assume file paths. Discover them every time.
- Don't exceed budget limits silently. Warn explicitly and suggest mitigation.
