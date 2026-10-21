# Gap Format

The gap log is the persistent record of all gaps found across all invocations. It is append-only — entries are never removed or rewritten.

## File location

`.spec-gap-hunter/<spec-basename>/gaps.md` — alongside the manifest and fingerprint files.

## Structure

```markdown
# Gap Log: <spec filename without extension>

Spec: <spec_path>
Total gaps: <count>

---

## SGH-<N>: <the question the spec cannot answer>
- Section: <section-id> (lines <start>-<end>)
- Location: lines <X>-<Y> | missing
- Quote: "<exact spec text>" | N/A — <what is missing>
- Implementation moment: <the exact coding step where the developer is blocked>
- Consequence: <what specifically breaks if they guess the most obvious default>
- Severity: blocking | important | minor
- Fingerprint: <3-5 word topic label>
```

## Field reference

| Field | Type | Description |
|-------|------|-------------|
| ID | `SGH-<N>` | Sequential, never reused. Numbering continues across invocations. |
| Section | string | The manifest section ID and line range where this gap was found. |
| Location | range or `missing` | Specific lines in the spec that create the ambiguity. `missing` when the gap is about something the spec never mentions. |
| Quote | string | Verbatim text from the spec. Copied exactly — no paraphrasing. `N/A` only when the spec is entirely silent on the topic (a genuine omission), followed by a brief explanation of what is missing. |
| Implementation moment | string | The specific point during coding where the developer is blocked or forced to guess. Must name the component, function, or decision point — not a vague description. |
| Consequence | string | What specifically breaks if the developer guesses the most obvious default. Must name the incorrect behavior, data corruption, user-visible bug, or spec violation — not a vague concern. |
| Severity | enum | `blocking`: cannot proceed with implementation until resolved. `important`: will cause rework or a defect if guessed wrong. `minor`: will cause inconsistency between implementers. |
| Fingerprint | string | 3-5 word topic label. Must match exactly one fingerprint in the manifest. Used by subsequent scans to avoid re-finding this gap. |

## Example

```markdown
# Gap Log: rules-enforcement

Spec: docs/rules-enforcement.md
Total gaps: 3

---

## SGH-1: What exit code does apply-t1.mjs use when a rules file contains malformed YAML on first encounter (no cached scope list)?
- Section: tier-1-source-text (lines 499-643)
- Location: lines 96-97
- Quote: "If no cached scope list exists (the file was never successfully parsed), apply-t1.mjs exits with code 2 and blocks all writes"
- Implementation moment: When implementing the mtime cache bootstrap path in apply-t1.mjs — the developer must decide what "blocks all writes" means concretely: does the process exit immediately, or does it continue processing other rules files and only block writes to files matching other files' scopes?
- Consequence: If the developer exits immediately (most obvious default), a single malformed rules file on first run disables ALL enforcement including files governed by other, valid rules files. If they continue processing, the malformed file's scope is unenforceable but other files work — but this contradicts "blocks all writes."
- Severity: important
- Fingerprint: malformed-yaml-no-cache-scope

## SGH-2: How does apply-t2.mjs health-check the dev server during the 30-second startup timeout?
- Section: pipeline-agents-hooks (lines 118-200)
- Location: lines 156-158
- Quote: "if the server does not respond to a health check within 30 seconds"
- Implementation moment: When implementing the dev server startup wait loop in apply-t2.mjs — the developer must choose a health check method (HTTP GET to /, TCP connect, specific endpoint) and a polling interval.
- Consequence: If the developer uses TCP connect (most obvious default), the server might accept connections before it is ready to serve pages, causing Playwright tests to hit a loading state instead of the app. Tests fail intermittently with no clear cause.
- Severity: important
- Fingerprint: dev-server-health-check-method
```

## Rules

- Gap IDs are sequential (`SGH-1`, `SGH-2`, ...) and never reused. Numbering continues from the highest existing ID across invocations.
- The gap log is append-only. Never remove, rewrite, or reorder existing entries.
- Each gap's fingerprint must match exactly one fingerprint in the manifest's section.
- The `Quote` field must be verbatim from the spec — copied, not paraphrased.
- The `Total gaps` count in the header must be updated after each append.
- When creating the gap log for the first time, start with `Total gaps: 0` and no gap entries.
