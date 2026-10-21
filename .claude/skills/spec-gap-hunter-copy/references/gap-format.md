## Impact scale

- **Blocker**: later review cannot be trusted until this is resolved (for example, an undefined core actor or scope).
- **High**: building without an answer will likely cause rework or a defect.
- **Medium**: it will cause inconsistency or confusion.
- **Low**: a clarity issue only.

## Gap entry format

### Title rules

The title is the question the spec cannot answer — the gap's identity. It must be readable without domain knowledge:

- Write it as a question, not a statement or conclusion.
- If it contains domain-specific terms (component names, tier labels, jargon), add a parenthetical definition inline. A reader who has never seen the spec must understand what is being asked.
- Good: "When the Fixer (code-fix agent) creates a T1 (regex hook) violation while fixing a T3 (LLM-reviewed) finding, can it recover?"
- Bad: "T1 violations during Fixer T3 fix phase" (statement, unexplained jargon)
- Bad: "Code-fix agent may violate regex rules — no recovery defined" (conclusion, not a question)

### Field order and purpose

The fields are ordered for a reader scanning top-to-bottom: first understand *what* is being asked and *why it matters*, then see the evidence, then evaluate resolution options.

| Field | Purpose for the reader |
|-------|----------------------|
| Context | Orient me — what part of the system is this about? |
| Impact | Should I care? How urgently? |
| What the spec says | What evidence exists? |
| Why that's insufficient | Why doesn't that evidence answer the question? |
| Possible answers → Recommendation | How do we fix it? |

### Template

```
### GAP-<n>: <the question — see title rules above>

- Parent: GAP-<m> | none          # which earlier gap's resolution spawned this question
- Type: missing | ambiguous | contradictory
- Section: <spec heading + line range, e.g. "Hook behavior (lines 90-95)">
- Context: <1-2 sentences: what actors are involved, what mechanism creates this question. Orient the reader in the system — not why the gap matters (that's Impact), just what is happening so the question makes sense.>
- Impact: blocker | high | medium | low — <one line: what goes wrong if this stays open>
- What the spec says: <factual summary of what the spec states, with line numbers for every claim. Paraphrase with refs, e.g. "Line 93 defines exit code 0 (allow) and exit code 2 (block)." Do not editorialize — save interpretation for the next field.>
- Why that's insufficient:
  - [line X] or [line X vs Y] <proof — what is wrong or missing at that line, tied back to the title question. The reader goes to the cited line, reads the text, and confirms the proof holds.>
  - [line X] <proof>
  - (one proof per bullet — each self-contained and independently checkable)
- Possible answers:
  1. <option>: <consequence and trade-off>
     patch: |
       [after line N of <file>] or [replace lines N-M of <file>]
       <literal spec text to insert — see Patch format below>
     sub-questions:
       - "<sub-question 1>" → "<quote from patch>"
       - "<sub-question 2>" → "<quote from patch>"
     verified: yes | no
     rejection: <what the patch doesn't address — only when verified: no>
  2. <option>: <consequence and trade-off>
     patch: |
       ...
     sub-questions:
       ...
     verified: yes | no
  (2 to 4 options)
- Recommendation: <option> (PROPOSAL, not confirmed — MUST point to a verified: yes answer)
- Reasoning: <why this option>
- Confidence: high | medium | low
- What would change this recommendation: <information or condition>
```

## Patch format

Every possible answer must include a `patch:` field containing the literal spec text to insert or replace. The patch is not a description of the answer — it IS the answer, written in spec language.

### Section anchor

The first line of the patch is a section anchor specifying where the text goes:

- `[after line N of <file>]` — insert after the specified line
- `[replace lines N-M of <file>]` — replace the specified line range

Line numbers reference the spec version noted during setup (`spec_version`).

### Patch requirements

- **Self-contained**: a reader who sees only the patch text and the surrounding spec context must be able to answer the original gap question from the text alone, without reading between the lines.
- **Same terminology**: use the same terms as the gap question and the target spec section. If the question asks about "exit codes" and the patch talks about "return values" without establishing equivalence, a Q&A system searching for "exit codes" will not find the answer.
- **Explicit, not implicit**: every sub-question must have specific words in the patch that answer it. "The system handles this" is implicit. "The system returns exit code 2 and logs the hook name and stderr to the morning review channel" is explicit.

### Self-check (sub-questions → quotes)

After writing each patch, decompose the gap question into atomic sub-questions — every explicit and implied part. For each sub-question, quote the specific words from the patch that answer it. Record this mapping in the `sub-questions:` field. If you cannot produce a quote for any sub-question, the patch is incomplete — rewrite it to include the missing content, then re-verify.

`verified: yes` means every sub-question has a quote. `verified: no` means at least one sub-question is missing, with the gap described in `rejection:`.

### Example

```
### GAP-15: What happens when a hook (pre-write validation script) exits with code 1 (crash/uncaught exception)?

- Parent: none
- Type: missing
- Section: Hook behavior (lines 90-95)
- Context: Hooks are scripts that run before each file write to validate compliance. Exit code 0 means allow, exit code 2 means block. The spec is silent on what exit code 1 (crashes, uncaught exceptions) means.
- Impact: high — a crashing hook could silently allow non-compliant writes (fail-open) or unexpectedly block all writes (fail-closed)
- What the spec says: Line 93 defines exit code 0 (allow) and exit code 2 (block with stderr feedback). No other exit codes are mentioned.
- Why that's insufficient:
  - [line 93] Only exit codes 0 and 2 are defined — exit code 1 (the most common crash/exception code) has no specified behavior
  - [line 93] No statement on whether the system is fail-open (unknown code = allow) or fail-closed (unknown code = block)
- Possible answers:
  1. Fail-closed (any non-zero = block):
     patch: |
       [after line 93 of rules-enforcement.md]
       Exit code 0 means allow. Exit code 2 means block — stderr is shown
       to the agent as the rejection reason. Any other exit code, including
       exit code 1 from crashes or uncaught exceptions, also means block.
       This is fail-closed: a crashing hook stops the write, and the stderr
       output (if any) is shown to the agent.
     sub-questions:
       - "What does exit code 1 mean?" → "exit code 1 from crashes or uncaught exceptions, also means block"
       - "Is the system fail-open or fail-closed?" → "This is fail-closed: a crashing hook stops the write"
       - "What feedback does the agent get?" → "the stderr output (if any) is shown to the agent"
     verified: yes
```

## How the two logs relate

Two files live next to the spec. They serve different purposes and never duplicate each other's job.

| File | Format | Purpose | What goes in |
|------|--------|---------|-------------|
| `<spec-basename>.qa.jsonl` | JSONL | Machine-readable evidence trail | **Every** question, answered or not — the complete record of what was asked, what the spec said, and where |
| `<spec-basename>.gaps.md` | Markdown | Human-readable action list | **Only** unanswered/ambiguous/contradictory questions — the open work that needs a decision |

A question that creates a gap gets written to **both**: a JSONL line in the Q&A log (with `gap_id` set) and a gap entry in the gap log. The Q&A log records the evidence; the gap log tracks the open decision. They link via `gap_id`.

A question that the spec answers fully gets written **only** to the Q&A log. It never touches the gap log.

An off-topic question — one that falls outside the spec's subject matter entirely — gets written **only** to the Q&A log with status `off_topic`. It never creates a gap. The spec is not missing anything; the question simply does not belong to this spec.

## Q&A evidence log format

Every question asked about the spec — whether it was answered or not — gets one JSONL line appended to `<spec-basename>.qa.jsonl` next to the spec. One JSON object per line, no trailing comma.

### Status values

Both skills must use the same status vocabulary in the Q&A log:

| Status | Meaning | Creates a gap? | Used by |
|--------|---------|---------------|---------|
| `answered` | The spec states the answer directly | No | both |
| `answered_by_inference` | The answer follows necessarily from what the spec states, through labelled reasoning | No | spec-qa |
| `partly_answered` | The spec covers some of the question but not all | Yes (the uncovered part) | spec-qa |
| `ambiguous` | The spec allows more than one reasonable reading | Yes | both |
| `contradictory` | Two or more parts of the spec disagree | Yes | both |
| `missing` | The spec says nothing about this question, but it is within the spec's subject matter | Yes | both |
| `off_topic` | The question falls outside the spec's subject matter entirely | No | spec-qa |

spec-gap-hunter classifies questions as `answered`, `missing`, `ambiguous`, or `contradictory`. It does not use `answered_by_inference`, `partly_answered`, or `off_topic` — those are spec-qa distinctions. spec-gap-hunter should never generate off-topic questions in the first place (see scope constraint below).

### Scope constraint

The spec's subject matter is what it explicitly sets out to define — its topic, the components it describes, and the behaviors it specifies. Adjacent systems, upstream dependencies, and downstream consumers are outside scope unless the spec explicitly claims ownership of them.

For example, if the spec defines a submit button on a login form, questions about the button's style, states, placement, label, and accessibility are in scope. Questions about the authentication engine, password policies, session tokens, or input validation rules are off-topic — those belong to a different spec.

- **spec-gap-hunter**: must derive scope from the spec before generating questions. Only ask questions the spec is responsible for answering. Never generate a question about an adjacent system the spec does not own.
- **spec-qa**: when a user's question falls outside the spec's subject matter, classify it as `off_topic`, tell the user, and do not log a gap.

### Example

```jsonl
{"question":"What happens when a user submits an empty form?","status":"answered","answer":"The form shows inline validation errors and does not submit.","evidence":[{"file":"spec.md","line":42,"quote":"Empty submissions are rejected with inline validation errors."},{"file":"spec.md","line_start":55,"line_end":57,"quote":"The form must not submit until all required fields pass validation."}],"reasoning":"Lines 42 and 55-57 together establish that empty forms are blocked by validation.","gap_id":null,"source":"spec-qa","spec_version":"a1b2c3d","timestamp":"2026-10-07T14:30:00Z"}
```

### Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | yes | The question exactly as asked |
| `status` | string | yes | One of the six statuses above |
| `answer` | string or null | yes | Plain-language answer. `null` only when status is `missing` |
| `evidence` | array | yes | Proof items. Empty array `[]` when status is `missing` |
| `evidence[].file` | string | yes | File path relative to the spec directory |
| `evidence[].line` | integer | when single line | Line number (use this OR `line_start`/`line_end`, not both) |
| `evidence[].line_start` | integer | when span | First line of a multi-line quote |
| `evidence[].line_end` | integer | when span | Last line of a multi-line quote |
| `evidence[].quote` | string | yes | Exact text copied from the spec |
| `reasoning` | string | yes | How the evidence supports the answer, or why the spec fails to answer |
| `gap_id` | string or null | yes | `"GAP-<n>"` if a gap was logged for this question, `null` if not |
| `source` | string | yes | `"spec-qa"` or `"spec-gap-hunter"` |
| `spec_version` | string | yes | Short git commit hash, or `"not-in-git"` |
| `timestamp` | string | yes | ISO 8601 UTC timestamp |

### Rules

- Append, never overwrite. The file is an append-only log.
- One JSON object per line. No pretty-printing across lines.
- Before appending, check the file exists. If not, create it (no header needed, JSONL has none).
- Every question gets logged, including answered ones. The value is the complete evidence trail, not just the gaps.
- The `evidence[].quote` must match what you would put in the proof section of the chat answer — same quote, same line number.
- `spec_version` must match the commit hash noted during setup. If the spec changed mid-session, use the version the answer was based on.

## Gap log format

The gap log is **append-and-move, never delete**. Existing gap entries are never removed or overwritten. New gaps are added alongside existing ones. An entry moves between sections only when the user confirms a decision (Open gaps → Decisions) or marks it out of scope (Open gaps → Out of scope). A gap that has been moved to Decisions or Out of scope stays there permanently — it is part of the historical record.

When deduplicating, keep the existing entry and skip the new one — never replace an existing gap with a reformulation.

Keep `<spec-basename>.gaps.md` up to date after every batch and every decision:

```
# Gap log: <spec name>

## Open gaps
<gap entries, ordered by impact>

## Decisions
- GAP-<n>: <decision> (confirmed by user on <date>)

## Out of scope
- GAP-<n>: <question> (marked out of scope on <date>)
```

## Model integration

When a spec model (`<spec-basename>.model.md`) exists, gaps are linked to model cells:

- **Gap creation**: each gap corresponds to a model cell with status `gap`. The gap entry's `Section` field maps to the model cell's `Question`. The gap ID is recorded in the model cell's `Gap` column.
- **Gap settlement**: when a gap is settled (patched and verified), the corresponding model cell is re-verified. If the spec now answers the question → cell status becomes `verified`. If not → cell remains `gap` (settlement verification failed).
- **Out of scope**: when a gap is marked out of scope, the corresponding model cell is set to `verified` (the question is not the spec's responsibility).
- **Source tracking**: the model cell's `Source` column tracks provenance — `build` for Phase A model building, `explore-rN` for Phase B exploration run N.

## Gap creation procedure

Any skill that creates gap entries — whether spec-gap-hunter, spec-qa, or another consumer — MUST follow this procedure.

### 1. Read the gap log

Look for `<spec-basename>.gaps.md` next to the spec. If it does not exist, create it with the gap log structure above.

### 2. Duplicate check (steel-man)

Search the gap log for candidate matches — open gaps, decisions, and out-of-scope items whose question overlaps with the new gap. A duplicate is the same underlying question, even if worded differently.

For every candidate:
1. Quote its title and description verbatim.
2. Steel-man: argue the strongest case why it does NOT cover the new question.
3. If you cannot find a meaningful difference, it is a duplicate.

Vague thematic overlap ("both are about hooks") is not a match — the candidate must answer the same underlying question.

Outcomes:
- Open gap covers the question → skip; report "already logged as GAP-n".
- Decision covers the question → skip; report "already decided as GAP-n". Do not use the decision as proof — it is not part of the spec for answering purposes.
- Out-of-scope covers the question → skip; report "out of scope (GAP-n)".
- No candidate fully covers → proceed to step 3.

### 3. Number the gap

Use the next number after the highest existing GAP number in the whole log, including decisions and out-of-scope items. Never reuse a number.

### 4. Write the entry

Fill every field of the gap entry template above. The recommendation MUST be marked as a proposal, never as confirmed.

### 5. Place the entry

Insert under "Open gaps" using this ordering:

1. **Primary — impact**: blocker first, then high, medium, low.
2. **Secondary — parent grouping**: within the same impact tier, if the gap has a parent that is also in "Open gaps" in that tier, place it immediately after that parent (or after the last existing child of that parent). This keeps family chains together.
3. **Tertiary — gap ID ascending**: among gaps at the same impact level with no parent relationship to each other, order by gap ID (lowest first).
