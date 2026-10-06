# Rule Creator Transcript

## Task

Classify and add enforcement blocks for three rules in `api-standards.md`:
1. "Every endpoint responds within 200ms at p95 under normal load"
2. "Error messages should be helpful and suggest next steps to the caller"
3. "Reject unknown fields in request bodies (strict mode)"

## Discovery

Rules files found in `.claude/rules/`:
- `ui-project.md`
- `ui-base.md`
- `visual-rules.md`
- `code-quality.md`
- `team-standards.md`

Existing enforcement block counts:
- T3: 3 (all in `visual-rules.md`)
- Scopeless T3 (`scope: "*"`): 0
- Critical T3: 0

## Sorting Test — Group 1 (3 rules)

### Rule 1: "Every endpoint responds within 200ms at p95 under normal load"

**Step 1 — Can a tool catch it?** No. Response latency is a runtime characteristic; no regex or static analysis can measure it.

**Step 2 — Can a test catch it?** Yes. A load/performance test can measure p95 latency for each endpoint and assert it falls under 200ms. This is a deterministic pass/fail assertion against runtime behavior.

**Classification: T2**

**Rule ID:** `api-standards:performance:T2`

---

### Rule 2: "Error messages should be helpful and suggest next steps to the caller"

**Step 1 — Can a tool catch it?** No. "Helpful" is a qualifying adjective (adjective trap). No regex can judge whether an error message is helpful or suggests appropriate next steps.

**Step 2 — Can a test catch it?** No. There is no deterministic assertion for "helpfulness."

**Step 3 — Does it need LLM judgment?** The core criterion is the adjective "helpful," which has no objective anchor. Different reviewers would disagree on what makes a message helpful in a given context. The adjective trap from Step 1 carries through: if "helpful" resisted T1 because it requires judgment, that same judgment is too unstable for T3 — it shifts between reviewers.

**Step 4 — Human only.** The rule is inherently subjective.

**Classification: Human**

**Rule ID:** `api-standards:error-handling:Human`

---

### Rule 3: "Reject unknown fields in request bodies (strict mode)"

**Step 1 — Can a tool catch it?** Not reliably. You could grep for schema validation configuration, but whether strict mode is actually enforced at runtime depends on the validator setup, middleware ordering, and framework behavior. A static pattern would miss many violation forms.

**Step 2 — Can a test catch it?** Yes. An integration test can send a request body containing unknown/extra fields and assert the server returns a 400 or 422 rejection. This is a deterministic pass/fail.

**Classification: T2**

**Rule ID:** `api-standards:validation:T2`

---

## Blocks Generated

All three enforcement blocks were appended to their respective rules in the output file. See `api-standards.md` in this directory.

## Budget Check (Post-Change)

No T3 rules were added, so all budgets remain unchanged.

| Budget | Current | Limit | Status |
|--------|---------|-------|--------|
| Total T3 | 3 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

### Per-file breakdown

| File | T3 count | Scopeless T3 | Critical T3 |
|------|----------|--------------|-------------|
| `.claude/rules/visual-rules.md` | 3 | 0 | 0 |
| `.claude/rules/ui-project.md` | 0 | 0 | 0 |
| `.claude/rules/ui-base.md` | 0 | 0 | 0 |
| `.claude/rules/code-quality.md` | 0 | 0 | 0 |
| `.claude/rules/team-standards.md` | 0 | 0 | 0 |
| `api-standards.md` (working copy) | 0 | 0 | 0 |
