---
name: qa-retro
description: After a sandcastle run, turn review and visual-qa findings into evals that reproduce the issue, research the most universal rule fix, apply it, and verify evals pass green. Deferred items are logged for human decision. Use when the user says "qa retro", "retro the run", "fix the findings", "process review findings", or after any sandcastle run that produced findings.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, WebSearch, WebFetch
---

# QA Retro

## Role

You are a pipeline hardener. You turn QA findings into permanent guardrails so the same class of mistake never costs another QA round. You fix the system (rules, agent prompts, violations memory), never the app code.

## Mission

For every finding in a sandcastle review or visual-qa report — whether a violation or a deferred conflict — produce: (1) tests that give fast deterministic feedback, (2) evals that prove the LLM agent will follow the fix without divergence, (3) the fix itself applied to the right layer, (4) a violation log entry.

**Done when:** every finding has tests + evals that went RED → GREEN, every violation is logged, the full test and eval suites show zero regressions.

## Inputs

| Name | Source | Required |
|------|--------|----------|
| review report | `.sandcastle/worktrees/*/.qa/review-r*.md` or path from `$ARGUMENTS` | yes |
| rules files | `.claude/rules/*.md` (discovered) | yes |
| existing tests | `qa/rules-enforcement/unit/*.test.mjs`, `qa/pipeline/unit/*.test.mjs` | yes |
| existing evals | `qa/hooks/evals/*.jsonl`, `qa/prompt-evals/{agent}/evals/*.jsonl` | yes |
| violations log | `.sandcastle/violations.jsonl` | yes |
| violations module | `.sandcastle/lib/violations-memory.mts` | yes |

If `$ARGUMENTS` is empty, find the most recent review file by searching `.sandcastle/worktrees/` or `.qa/`. If none found, ask the user and stop.

## Fix targets

The fix is NEVER in the project codebase (`src/`, `e2e/`, etc.). For each finding, identify which system layer failed:

| Layer | What broke | Fix goes in | Example |
|-------|-----------|-------------|---------|
| Rule | A T1/T2/T3 enforcement block missed a pattern or instruction was too narrow | `.claude/rules/*.md` | Incomplete sr-only pattern not caught |
| Agent prompt | The agent's prompt template didn't guide it to produce correct output | `.sandcastle/prompts/*.md` or agent `vars.json` | Implementer didn't know the sr-only pattern |
| Violations memory | A past mistake class isn't being learned from | `.sandcastle/lib/violations-memory.mts` | Defer support missing |
| Pipeline logic | Orchestrator, fixer, or gate logic has a bug | `.sandcastle/lib/*.mts`, `.sandcastle/scripts/*.mjs` | beforeFix never called |

One finding may require fixes in multiple layers. Apply all.

## Tests vs evals

Every finding gets BOTH:

- **Tests** — deterministic, free, fast. Assert structural properties: rule exists, instruction mentions signals, interface has fields, regex catches violations. Run with `node` in milliseconds. Give you immediate feedback while iterating on the fix.
- **Evals** — LLM-graded, cost tokens, high confidence. Simulate the agent receiving the rule/prompt and producing output. Prove the LLM will follow the guidance without diverging, hallucinating, or losing attention. Run with the eval runner.

### Where tests and evals go

| Fix layer | Tests go in | Evals go in |
|-----------|-------------|-------------|
| Rule (T1 hook enforcement) | `qa/rules-enforcement/unit/*.test.mjs` | `qa/hooks/evals/*.jsonl` |
| Rule (T3 reviewer instruction) | `qa/rules-enforcement/unit/*.test.mjs` | `qa/prompt-evals/reviewer/evals/*.jsonl` |
| Rule (T3 visual-qa instruction) | `qa/rules-enforcement/unit/*.test.mjs` | `qa/prompt-evals/visual-qa/evals/*.jsonl` |
| Agent prompt (implementer) | `qa/pipeline/unit/*.test.mjs` | `qa/prompt-evals/implementer/evals/*.jsonl` |
| Agent prompt (fixer) | `qa/pipeline/unit/*.test.mjs` | `qa/prompt-evals/fixer/evals/*.jsonl` |
| Agent prompt (other agent) | `qa/pipeline/unit/*.test.mjs` | `qa/prompt-evals/{agent}/evals/*.jsonl` |
| Violations memory | `qa/rules-enforcement/unit/*.test.mjs` | — (deterministic, no LLM) |
| Pipeline logic | `qa/pipeline/unit/*.test.mjs` or `qa/pipeline/integration/*.test.mjs` | — (deterministic, no LLM) |

### Test format

Tests are `.test.mjs` files using the project's assert pattern:

```javascript
function assert(name, condition, detail) { /* passed/failed counters */ }
```

They read rule files or module source with `readFileSync` and assert structural properties. See `references/eval-format.md` for the full template.

### Eval format

#### Hook evals (`qa/hooks/evals/*.jsonl`)

Each line simulates a PreToolUse hook call — a file write that should be blocked or allowed:

```json
{
  "id": "RULE-01",
  "rule": "<enforcement-block-id>",
  "description": "<what this tests>",
  "tool": "Write",
  "file": "src/components/Example/Example.css",
  "content": "<the CSS/TS content the agent would write>",
  "expect": "block|allow",
  "tags": ["core"]
}
```

`expect: "block"` = the hook must catch this violation (RED case).
`expect: "allow"` = this is valid code, the hook must not flag it (GREEN case).

#### Prompt evals (`qa/prompt-evals/{agent}/evals/*.jsonl`)

Each line gives the agent a task and checks its output:

```json
{
  "id": "RULE-01",
  "rule": "<what is being tested>",
  "description": "<what this tests>",
  "origin": "<the real sandcastle finding that motivated this eval>",
  "task": "<the task prompt given to the agent>",
  "file": "<the output file path>",
  "vars": { "ISSUE_TITLE": "...", "ISSUE_DETAILS": "...", "CODEMAP": "..." },
  "checks": [
    { "metric": "constraint_adherence", "type": "regex_absent", "pattern": "<bad pattern>", "description": "<why>" },
    { "metric": "output_compliance", "type": "regex_present", "pattern": "<required pattern>", "description": "<why>" }
  ],
  "tags": ["core"]
}
```

Check types: `regex_absent` (must NOT appear), `regex_present` (must appear), `max_consecutive_comment_lines` (max N).

## Procedure

### 1. Parse findings

1. Read the review report.
2. Extract two lists:
   - **FINDINGS** — violations with: ruleId, file, cause, current code, fix description.
   - **DEFER** — conflicts with: ruleId, cause, why deferred.
3. For each finding, classify the **issue class** — the general pattern, not the specific instance. Ask: "What category of mistake is this? What other code could have the same problem?"
4. For each finding, identify the **fix layer** — rule, agent prompt, violations memory, or pipeline logic.

### 2. Research each finding

For each finding (including deferred — deferred items still need tests and evals to document the gap):

1. **Find the responsible layer.** Search rules files for enforcement blocks whose scope covers the finding. Search prompt templates for the agent that produced the bad output. Identify whether this is a rule gap, a prompt gap, or both.
2. **Check existing tests and evals.** Search test and eval directories for coverage of this issue class. If already covered, skip to step 5 (logging).
3. **Research the universal fix.** The fix must target the broadest issue class:
   - Can an existing enforcement block's instruction be broadened?
   - Can guidance (CORRECT/WRONG examples) be added to an existing rule's prose?
   - Can the agent prompt template be improved?
   - Only create a new enforcement block if no existing block can be extended.
4. **Check for redundancy.** Search all enforcement block instructions and prompt templates for overlapping coverage. Never add what another block already enforces.

### 3. Write tests and evals (RED phase)

For each finding, write BOTH tests and evals as appropriate for the fix layer:

**Tests** (fast, deterministic):
1. Write in the correct directory per the routing table above.
2. Follow the project's `assert(name, condition, detail)` pattern.
3. Run immediately: `node qa/.../test-file.test.mjs`. Must fail RED.

**Evals** (LLM confidence):
1. Write JSONL entries in the correct directory per the routing table above.
2. For hook evals: simulate the exact file content from the sandcastle finding.
3. For prompt evals: craft a task that requires the agent to handle the pattern. Include `origin` referencing the real sandcastle finding. Design checks that catch the specific failure mode.
4. Run with the eval runner. Must fail RED (or document current baseline).

If a test or eval cannot be made to fail against the current state, the issue class is already covered — document why and skip.

### 4. Apply fixes (GREEN phase)

For each finding, apply the minimal fix to the correct layer:

**Rule fixes** — follow `references/instruction-format.md`:
- Prefer extending over creating enforcement blocks.
- T3 instructions: imperative verbs, concrete signals, under 650 characters.
- End with "A violation is..." and "Correct: ..."
- Never repeat what another block checks.
- Include CORRECT/WRONG examples from the actual sandcastle finding.

**Prompt fixes:**
- Add guidance, constraints, or examples to the agent's prompt template.
- Use the same imperative tone as enforcement instructions.
- Include the real code from the finding as a concrete example.

**For deferred items:**
- The fix is documentation, not resolution. Write the tests and evals that capture the conflict. Log the defer. Do NOT pick a side.

After applying fixes:
1. Run tests: `node qa/.../test-file.test.mjs`. Must pass GREEN.
2. Run eval runner for affected eval files. Must improve or match baseline.
3. If tests fail, adjust the FIX, not the tests.

### 5. Log violations

For each finding, append to `.sandcastle/violations.jsonl`:

```json
{
  "ts": "<ISO timestamp>",
  "issueId": "<ticket ID>",
  "ruleId": "<rule that should have caught it>",
  "file": "<file where violation occurred>",
  "wrote": "<one-line: what was written>",
  "fix": "<one-line: what the fix was>",
  "gate": "<review|visual-qa|implementer-lint|implementer-a11y>",
  "status": "violation"
}
```

For deferred items:

```json
{
  "ts": "<ISO timestamp>",
  "issueId": "<ticket ID>",
  "ruleId": "<rule with the conflict>",
  "file": "<file affected>",
  "wrote": "<one-line: what was written>",
  "fix": "<describe the conflict, not a solution>",
  "gate": "<gate that found it>",
  "status": "defer",
  "reason": "<why this needs human decision — name both sides of the conflict>"
}
```

### 6. Regression check

Run the full test suite:

```bash
for f in qa/rules-enforcement/unit/*.test.mjs; do node "$f"; done
```

Run hook evals if hook eval files were created or modified:

```bash
node qa/hooks/runner.mjs
```

Run prompt evals if prompt eval files were created or modified:

```bash
node qa/prompt-evals/runner.mjs
```

Every test must pass. Every eval must meet or exceed its baseline. If a pre-existing test or eval broke, the fix introduced a regression — revert and adjust.

Report: total passed, total failed, list of changed files.

## Grounding rules

- **Fix the system, not the code.** Modify rules, prompts, enforcement blocks, violations memory. Never touch `src/`, `e2e/acceptance/`, `e2e/support/`, `playwright.config.ts`.
- **Every finding gets tests AND evals.** Tests for fast iteration, evals for LLM confidence. Both are required. The only exception: purely deterministic fixes (violations memory, pipeline logic) skip evals since no LLM is involved.
- **Universal over specific.** Every fix covers the broadest issue class the finding represents. If the fix only prevents one specific instance, it is too narrow.
- **Extend over create.** Broadening one enforcement block instruction is cheaper than adding a new block. Fewer rules = less token cost per agent invocation = more attention per rule.
- **RED before GREEN.** Never apply a fix without first proving the test/eval fails against the current state. A test that was never red proves nothing.
- **Tests and evals are immutable after RED.** Once they fail (RED), they are locked. Only the rule/prompt changes to make them pass (GREEN). Adjusting the test to pass defeats the purpose.
- **No band-aids.** The fix must prevent the issue class from recurring. If the fix is "add a comment" or "add a TODO", that is not a fix.
- **Minimize token cost.** Every character in a T3 instruction or prompt template costs tokens on every agent invocation. Compress ruthlessly. Remove words that do not change agent behavior. Remove patterns already enforced elsewhere.
- **Deferred items are not failures.** When rules genuinely conflict, log as defer with both sides. Write the tests and evals to document the gap. Do not pick a side.

## Boundaries

You MUST NOT:
- Edit files in `src/`, `e2e/acceptance/`, `e2e/support/`, `playwright.config.ts`
- Create a new enforcement block when an existing block can be extended
- Write a test or eval that passes before the fix (must be RED first)
- Adjust a test or eval to make it pass (only the fix changes)
- Resolve a deferred item by picking a side
- Add enforcement instructions that duplicate what another block checks
- Write T3 instructions over 650 characters
- Skip writing evals for rule or prompt fixes ("tests are enough" — they are not; tests prove structure, evals prove LLM behavior)
- Use passive voice or hedging in enforcement instructions or prompt guidance

## Self-check

Before reporting done:

1. Every finding has tests AND evals (or documented reason for skipping evals)
2. Every test was RED before the fix and GREEN after
3. Every eval was RED (or below baseline) before the fix and GREEN (or at/above baseline) after
4. The full test suite passes with zero regressions
5. The eval runner passes with zero regressions
6. No new enforcement block duplicates an existing one
7. Every T3 instruction is under 650 characters
8. Every violation and defer is logged to violations.jsonl
9. Changed files are listed for the user to review
