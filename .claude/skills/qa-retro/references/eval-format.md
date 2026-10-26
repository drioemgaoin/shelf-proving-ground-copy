# Test and eval formats

Every finding produces BOTH tests (fast, deterministic) and evals (LLM confidence). This reference covers all formats.

## Tests (deterministic — `*.test.mjs`)

### Rule tests → `qa/rules-enforcement/unit/`

Assert structural properties of rules files: enforcement blocks exist, instructions mention signals, no redundancy.

```javascript
#!/usr/bin/env node
/**
 * Eval: <issue class name>
 *
 * Reproduces: <the real finding from the sandcastle run>
 * Root cause: <the rule/prompt gap>
 * Fix: <what was changed>
 *
 * Seam: <file being tested>
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) { passed++; }
  else { failed++; failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
}

const rulesFile = readFileSync('.claude/rules/ui-base.md', 'utf8');

// ... assertions ...

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) { console.log(failures.join('\n')); process.exit(1); }
```

### Pipeline tests → `qa/pipeline/unit/` or `qa/pipeline/integration/`

Use Vitest. Test orchestrator logic, prompt expansion, violations memory.

### What to assert in tests

For enforcement block fixes:
- Block exists with correct id, tier, agent, scope, group
- Instruction mentions concrete signal keywords
- Instruction is under 650 characters
- No duplication with other blocks (search for overlapping instruction keywords)

For prompt fixes:
- Template contains the new guidance text
- vars.json has required variables

For violations-memory fixes:
- Interface has required fields
- Formatting logic handles the new case
- Real entries in violations.jsonl validate the format

## Evals (LLM confidence — `*.jsonl`)

### Hook evals → `qa/hooks/evals/`

Each JSONL line simulates a file write that the T1 hook must block or allow:

```json
{
  "id": "<RULE-NN>",
  "rule": "<enforcement-block-id>",
  "description": "<what this tests>",
  "tool": "Write",
  "file": "<path the agent would write to>",
  "content": "<the full file content the agent would produce>",
  "expect": "block|allow",
  "tags": ["core"]
}
```

- `expect: "block"` = RED case — hook must catch this violation.
- `expect: "allow"` = GREEN case — valid code, hook must not flag.
- `content` must be realistic — use the actual code from the sandcastle finding for RED cases.
- Include both RED and GREEN cases. A hook eval with only RED cases has no false-positive coverage.

Optional fields:
- `"known_gap": true` — documents a known limitation of the current hook engine.
- `"gap_fix": "<description>"` — how to close the gap.

### Prompt evals → `qa/prompt-evals/{agent}/evals/`

Each JSONL line gives the agent a task and checks its output:

```json
{
  "id": "<RULE-NN>",
  "rule": "<what is being tested>",
  "description": "<what this tests>",
  "origin": "<the real sandcastle finding — e.g. 'djk.1 implementer: wrote incomplete sr-only pattern'>",
  "task": "<the full task prompt given to the agent>",
  "file": "<the output file path>",
  "vars": {
    "ISSUE_TITLE": "<ticket title>",
    "ISSUE_DETAILS": "<ticket description>",
    "CODEMAP": "<relevant file tree>"
  },
  "checks": [
    { "metric": "constraint_adherence", "type": "regex_absent", "pattern": "<bad pattern>", "description": "<why this should not appear>" },
    { "metric": "output_compliance", "type": "regex_present", "pattern": "<required pattern>", "description": "<why this must appear>" },
    { "metric": "constraint_adherence", "type": "max_consecutive_comment_lines", "max": 1, "description": "<why>" }
  ],
  "tags": ["core"]
}
```

Check types:
- `regex_absent` — pattern must NOT appear in the agent's output (catches the violation class)
- `regex_present` — pattern must appear (proves the agent produced the correct output)
- `max_consecutive_comment_lines` — at most N consecutive comment lines

Design principles:
- `origin` references the real sandcastle finding. This is how evals trace back to the issue.
- `task` must be realistic — craft a scenario where the agent would naturally make the mistake the finding caught. Do not make it obvious.
- Include at least one "control" case (`"expect_clean": true`) — a task where the correct behavior is to NOT apply the constraint, proving the eval does not over-trigger.
- `vars` should mirror the real agent invocation context.

## Naming conventions

| What | Convention | Example |
|------|-----------|---------|
| Test file | Issue class, not specific finding | `sr-only-pattern.test.mjs` not `shelf-live-clip-path.test.mjs` |
| Hook eval file | Enforcement block id | `a11y-css-pattern-completeness.jsonl` |
| Prompt eval file | Rule or behavior name | `comment-clarity.jsonl`, `self-review.jsonl` |
| Eval IDs | `<PREFIX>-NN` | `ACPC-01`, `CC-01`, `RQ-01` |
