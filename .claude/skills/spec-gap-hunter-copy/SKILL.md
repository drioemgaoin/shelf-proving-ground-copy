---
name: spec-gap-hunter-copy
description: Nothing
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Bash
---

# Spec Gap Hunter

<critical>
## Hard constraints

- MUST answer questions ONLY from the text of the spec; cite the exact section.
- NEVER fill a gap with common sense, industry convention, or your own assumption. A gap you fill silently is a gap you hide.
- NEVER edit the spec BEFORE user confirmation. After a decision is confirmed, you MUST apply the patch, verify it, and update the gap log — see Settlement phase.
- NEVER remove or overwrite existing gap log entries — append-and-move only.
- A recommendation is a proposal, not a fact. NEVER write it into the spec or treat it as settled until the user confirms it.
- You MAY trace a recommendation's downstream implications as CONDITIONAL gaps, marked with `Parent: GAP-N`. If the parent is rejected or answered differently, discard or re-derive the conditional gap. This is not "building on assumptions" — it is mapping the decision tree so the user sees the full frontier.
- Confirmed decisions count as part of the spec from that point on.
- MUST derive scope from the spec before generating questions. Only ask questions the spec is responsible for answering — adjacent systems are out of scope unless the spec explicitly claims them.
- MUST halt on blocker gaps — present the blocker alone and wait.
- MUST write the model file (`<spec-basename>.model.md`) before proceeding to Step 2 (Verify cells) or Step 3 (Present gaps). The model file is the single source of truth for what has been checked. Presenting gaps without a written model is PROHIBITED — if the model file does not exist on disk after Step 1, STOP and write it before doing anything else. Verify the file exists (Read tool) before proceeding.
- MUST log every question to the Q&A evidence log BEFORE creating the corresponding gap log entry. The Q&A entry is the birth certificate — the gap entry references it. A gap without a prior Q&A entry is an orphan and MUST NOT exist.
- MUST re-ask the original gap question against the patched spec text during settlement. Quote specific lines. If the question is NOT answered by the patch, adjust the patch and re-verify — do NOT move the gap to Decisions until the question passes verification. This is the proof that the gap is closed.
- Every gap has exactly TWO Q&A entries minimum: one at creation (status: `missing`/`ambiguous`/`contradictory`) and one at settlement (status: `answered`). A human can audit the trail at any moment by reading the Q&A log.

## Exit conditions

- **CONVERGED**: The model is 100% verified (0 gaps, 0 pending cells, all chains complete) AND 2 consecutive exploration runs found 0 new questions. Report model summary, decisions made, and patches applied.
- **SESSION COMPLETE**: Phase A gaps settled, Phase B run completed. Report model summary and exploration status. The skill resumes from the model on the next invocation.
- **FAILED**: Spec path is invalid/unreadable, or user does not provide one after being asked. Report the reason and stop.

## Iteration bounds

- Max 5 settlement rounds per session. If gaps remain after 5 rounds, report open count and stop.
- Max 3 retries on any sub-agent spawn failure. On 3rd failure, report and continue with available results.
  </critical>

## Goal

Find the questions the specification cannot answer. Each one is a gap that must be fixed before anyone builds from the spec. Success is convergence: every question the spec should answer IS answered, every claim chains to the next with no breaks, and re-running produces the same result — zero gaps.

## Setup

1. The spec path is `$ARGUMENTS`. If empty, ask the user and stop until they reply.
2. Read the whole spec and any local files it links to or depends on.
3. Load or create the gap log (`<spec-basename>.gaps.md`) — see `references/gap-format.md`. If it exists, preserve all existing entries in full when writing back.
4. Load or create the spec model (`<spec-basename>.model.md`) — see `references/model-format.md`. If it exists, check `spec_version` against the current git hash to detect spec changes.
5. Note the spec's git hash (or `"not-in-git"`) as `spec_version` for Q&A log entries.
6. Load or create the Q&A evidence log (`<spec-basename>.qa.jsonl`) — see `references/gap-format.md § Q&A evidence log format`. This is the append-only record of every question asked.

## Scope derivation

Read the spec and identify its subject matter — the specific thing it defines, the components it describes, and the behaviors it specifies. Write a one-line scope statement (for yourself, not in any file). Only ask questions the spec is responsible for answering.

## Two-phase architecture

The skill has two phases. Phase A is deterministic and converges to 0 gaps. Phase B is stochastic and grows the model until it covers everything. Together they guarantee convergence.

```
Phase A: MODEL VERIFICATION (deterministic — converges)
  Load model → verify cells → gaps found? → present → settle → re-verify → loop
  Exits when: all cells verified, all chains complete, 0 gaps

Phase B: BOUNDED EXPLORATION (stochastic — grows the model)
  Sub-agents receive spec + model → find questions NOT in the model
  New questions → add to model → back to Phase A
  No new questions → increment clean-run counter
  2 consecutive clean runs → CONVERGED
```

### Why this converges

Phase A: the model has finite cells. Each gap is settled (verified or out-of-scope). After at most N rounds, all cells are verified. Re-runs check the same cells against the same spec → same results → 0 gaps.

Phase B: the spec is finite. The model cannot grow indefinitely. Each exploration run either finds new questions (model grows) or finds nothing. After the model covers everything, no run finds new questions.

Combined: Phase A converges deterministically. Phase B converges probabilistically (bounded by 2 clean runs). The model persists — re-runs skip both phases and verify directly.

---

## Phase A — Model Verification

### Step 1: Build or load the model

**If the model does not exist (first run):**

1. Derive scope from the spec.
2. Spawn sub-agents 1-4 in **MODEL-BUILD** mode (parallel via Agent tool). Each receives: the spec path, the scope statement, the gap log, and its brief from `references/sub-agent-briefs.md`.
3. Each sub-agent outputs TWO things: (a) its analytical matrices (entity registry, HAZOP, data dictionary, state-event, interface tables, business rules, chains) as structured tables per `references/model-format.md`, and (b) any gaps found, as full gap entries per `references/gap-format.md`.
4. Merge sub-agent matrix outputs into a unified model. Deduplicate rows asking the same question.
5. Spawn sub-agent 5 (Verifier) with the spec AND the assembled model to check proportional coverage (every spec section should have cells; cold spots get additional cells).
6. **Write the model to `<spec-basename>.model.md`** (Write tool). The model file MUST contain: the header with `spec_version` and `exploration_clean_runs`, the entity table, all coverage matrices, interface matrices, state-event matrices, HAZOP matrices, business rules, chains, and the summary block with cell/chain counts.
7. **Gate check: verify model file exists.** Read `<spec-basename>.model.md` (Read tool). If the file does not exist or is empty → STOP. Do NOT proceed to Step 2. Write it first. This gate prevents the failure mode where sub-agent outputs are consumed for gap presentation but never persisted — losing the coverage matrices that make re-verification possible.

**If the model exists:**

1. Read the model.
2. Check `spec_version` against current git hash.
3. If different: compute `git diff` on the spec. Mark cells referencing changed lines as `pending`. Run model-building sub-agents on NEW sections only → add new cells. **Re-write the updated model file.** Verify it exists before proceeding.
4. If same: all cells retain their status. Proceed to verification.

### Step 2: Verify cells (REQUIRES model file on disk)

For each cell with status `pending` (new or affected by spec change):

1. Read the spec text at the stored line (or search by quote fragment if line shifted).
2. Ask the cell's question: "Does the spec define [aspect] of [entity]?"
3. This is a **reading task** — search for the entity name and aspect keyword, quote the answer.
4. If found: set status to `verified`, record the line number and a 60-char quote fragment. Append Q&A entry with `status: "answered"`.
5. If not found: set status to `gap`. **First** append Q&A entry with `status: "missing"` (or `"ambiguous"`/`"contradictory"`) and the assigned `gap_id`. **Then** create the gap entry in the gap log per `references/gap-format.md`. The Q&A entry must exist before the gap log entry.

Also verify all chains: for each chain, check that every link's claim exists at the stored line and that adjacent links are logically consistent. A broken or inconsistent chain → gap (same Q&A-first-then-gap ordering).

### Step 3: Present gaps (if any)

If unverified cells or broken chains exist → present as gaps using the frontier presentation format below. Wait for user answers.

### Step 4: Settle

For each confirmed decision, execute the **apply → verify → retry** loop:

**4a. Apply.** Apply the confirmed patch to the spec (Edit tool).

**4b. Verify (mandatory — NEVER skip).** Read the patched section. Re-ask the EXACT original gap question — the same question stored in the Q&A evidence log entry created during Coordination (step 5). This is a reading task:

1. Search the patched spec for the entity name and aspect keyword from the question.
2. Quote the specific lines that answer it. Every sub-question from the gap entry must have a quote from the current spec text.
3. If ALL sub-questions have quotes → **VERIFIED**. Proceed to 4c.
4. If ANY sub-question cannot be answered from the patched text → **NOT VERIFIED**. Proceed to 4d.

**4c. Record success (only after 4b passes).** All three writes happen together:

1. **Q&A log**: append a JSONL line with `status: "answered"`, the gap question, the evidence (patched line numbers and verbatim quotes from the current spec), and the `gap_id`. This closes the loop from the initial `missing`/`ambiguous`/`contradictory` entry logged during Coordination.
2. **Gap log**: move the gap from "Open gaps" to "Decisions".
3. **Model**: update the corresponding cell to `verified`.

The gap is now closed. The Q&A log has two entries for this question: one at creation (unanswered) and one at settlement (answered). A human reading the Q&A log can verify the closure at any time.

**4d. Retry on verification failure (up to 3 attempts).** If 4b fails:

1. Do NOT revert the patch blindly. Read the verification failure — which sub-question was not answered?
2. **Adjust the patch**: edit the already-applied text to add the missing information. This is an adjustment to the previous adjustment, not a clean-slate rewrite.
3. Return to 4b — re-ask the same question against the newly adjusted text.
4. After 3 failed adjustments (the question still cannot be answered from spec text): revert ALL adjustments for this gap. Keep the gap in "Open gaps" with a note listing each attempt and why it failed. Report to user: "GAP-N: 3 patch attempts failed verification. The question `<question>` could not be answered. Manual intervention needed."

**4e. Out-of-scope decisions.** Move to "Out of scope" in the gap log. Update model cell to `verified` (not the spec's job). Append Q&A entry with `status: "off_topic"`.

After settlement: the spec changed (patches applied). Go back to Step 1 (model detects spec change, marks affected cells as pending, re-verifies). Loop until all cells verified.

### Audit trail guarantee

For every gap in the gap log, the Q&A evidence log contains a verifiable paper trail:

| Gap lifecycle stage                       | Q&A entry status                          | When written                                  |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Gap created (question found unanswerable) | `missing` / `ambiguous` / `contradictory` | Coordination step 5, BEFORE gap log entry     |
| Gap settled (question now answerable)     | `answered`                                | Settlement step 4c, AFTER verification passes |
| Gap marked out of scope                   | `off_topic`                               | Settlement step 4e                            |

A human auditing the system reads the Q&A log filtered by `gap_id` and sees the full lifecycle: what was asked, why the spec failed to answer it, and the exact lines that now answer it (or why it was marked out of scope). If the `answered` entry is missing for a gap marked as "Decided" in the gap log, the settlement was invalid — the gap must be re-verified.

---

## Phase B — Bounded Exploration

Phase B runs ONLY when Phase A shows 0 gaps (all cells verified, all chains complete).

### Step 5: Check exploration counter

Read `exploration_clean_runs` from the model.

- If >= 2: report **CONVERGED** and stop. The model is exhaustive.
- If < 2: proceed to exploration.

### Step 6: Explore

Spawn sub-agents 1-4 in **EXPLORE** mode (parallel via Agent tool). Each receives: the spec path, the scope statement, the gap log, the model, and its brief from `references/sub-agent-briefs.md`.

In EXPLORE mode, sub-agents do NOT rebuild matrices. Instead they:

1. Read the model to understand what has been checked.
2. Look for entities, interfaces, states, failure modes NOT represented in any cell.
3. Look for cross-cutting concerns that span multiple entities but have no cell.
4. Apply creative techniques (pre-mortem narratives, adversarial scenarios) to find questions the systematic matrices missed.
5. For each new question, verify it is not already a cell in the model (even if worded differently).

### Step 7: Merge exploration results

1. Collect new questions from all sub-agents.
2. Deduplicate against existing model cells (steel-man check).
3. Scope-filter per the four tests (subject matter, impact, behavior vs mechanism, behavioral vs operational).
4. Spawn sub-agent 5 (Verifier) with the spec, model, and new questions.

### Step 8: Update model

- If new questions found: add as new cells to the model (source: `explore-rN`). Verify each. If any are gaps → reset `exploration_clean_runs` to 0. Go back to Phase A Step 3 (present gaps).
- If no new questions found: increment `exploration_clean_runs`. If now >= 2 → report **CONVERGED**. If < 2 → report "exploration run N found 0 new questions, 1 more clean run needed for convergence." Stop (next invocation runs another exploration pass).

---

## Sub-agent architecture

Five focused sub-agents with two operating modes each. Based on Perspective-Based Reading (NASA/Basili — 35% more defects), QUARE (98.2% compliance coverage), and Silent Omissions research (LLMs judge coverage 6-7x better than they enumerate).

MUST spawn sub-agents 1-4 in parallel via the Agent tool. Each receives: the spec path, the scope statement, the gap log (if any), the model (if any), the operating mode, and its brief from `references/sub-agent-briefs.md`.

| Sub-agent                  | Focus                                                                                                        | Brief section    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1 — Contradiction detector | Inconsistencies, entity registry, predicate conflicts, requirements smells                                   | `## Sub-agent 1` |
| 2 — Component auditor      | Interface completeness, data dictionary, HAZOP matrices, assume-guarantee contracts, environment assumptions | `## Sub-agent 2` |
| 3 — Lifecycle analyst      | Business rule extraction, goal-obstacle analysis, state machines, limits, decision tables, negation testing  | `## Sub-agent 3` |
| 4 — Adversarial reviewer   | FMEA failure modes, business edge cases, pre-mortem narratives                                               | `## Sub-agent 4` |
| 5 — Verifier (after merge) | Coverage heatmap, cold spots, domain completeness, scenario walk-through, model completeness audit           | `## Sub-agent 5` |

### Shared constraint: patch, verify, and trace

Every sub-agent (1-4) MUST follow `references/sub-agent-briefs.md § Shared instruction` for each gap:

1. **Write a patch, not a description.** Each possible answer MUST include a `patch:` field — literal insertable spec text per `references/gap-format.md`.
2. **Self-check every patch.** Decompose the gap question into sub-questions. For each, quote specific words from the patch. Record in `sub-questions:` field.
3. **The recommendation MUST point to a `verified: yes` answer.** If no answer passes verification, rewrite until one does.
4. **Trace the recommendation's downstream implications (recommendation ripple).** After writing the recommended patch, ask: "If this patch were inserted into the spec, what new questions would it create?" Run the same decision ripple trace defined in the Decision tree section (list touched sections, check for new constraints, verify coverage in format tables and consumer sections, check for conflicts). Any new question becomes a conditional downstream gap with `Parent: GAP-N`. This catches deeper-layer gaps and decision ripples in the same round instead of deferring them to the next invocation.

### Operating modes

**MODEL-BUILD mode** (Phase A, first run): Sub-agents output their analytical matrices as structured tables per `references/model-format.md` AND any gaps found as full gap entries. The matrices become the model.

**EXPLORE mode** (Phase B): Sub-agents receive the model and find questions NOT already in the model. They do not rebuild existing matrices. Output: new questions only (as model rows + gap entries if unverified).

## Coordination (after sub-agents 1-4 complete)

1. **Merge**: Collect all outputs (matrices in MODEL-BUILD mode; new questions in EXPLORE mode) and all gaps. Existing gap log entries are authoritative — NEVER remove or replace them.
2. **Deduplicate**: Among new items, merge those asking the same question (keep the more precise version). Items duplicating existing model cells or gap log entries → discard.
3. **Scope filter** — each gap MUST pass ALL FOUR tests:
   - **Subject matter**: within the spec's scope?
   - **Impact**: would absence cause a defect, rework, or implementer disagreement?
   - **Behavior vs mechanism**: behavior gaps → keep; mechanism gaps → keep only if they affect interoperability.
   - **Behavioral vs operational**: the spec defines system behavior, not deployment hygiene. Operational concerns (log rotation, disk cleanup, monitoring dashboards, backup policies) are out of scope UNLESS the spec explicitly owns them (e.g., a dedicated "Operations" section). When in doubt, check: would two implementers of the spec disagree on the system's behavior without this answer? If no — it's operational, reject it.
4. **Cross-critique**: If sub-agents disagree on whether something is defined, re-read the spec to resolve.
5. **Log ALL questions to Q&A evidence log (BEFORE gap log)**. This step MUST complete before step 6. For every unique question from sub-agents — whether it becomes a gap or not:
   - **Unanswered question** → append JSONL with `status: "missing"`, `"ambiguous"`, or `"contradictory"`, plus `gap_id: "GAP-<N>"` (the ID that will be assigned in step 6). Include evidence quotes and reasoning.
   - **Answered question** (sub-agents checked, spec answers it) → append JSONL with `status: "answered"`, `gap_id: null`. Include evidence quotes.
   - **Off-topic question** (filtered by scope) → append JSONL with `status: "off_topic"`, `gap_id: null`.
     Every question asked gets logged — the Q&A log is the complete evidence trail, not just the failures. The Q&A entry is the birth certificate; the gap entry references it.
6. **Create gap log entries** (AFTER Q&A log). For each unanswered question logged in step 5, create the gap entry in `<spec-basename>.gaps.md` per `references/gap-format.md`. The gap ID must match the `gap_id` used in the Q&A entry. A gap entry without a corresponding Q&A entry is invalid.
7. **Spawn sub-agent 5 (Verifier)** with the spec, the model, and the merged gap/question list — see `references/sub-agent-briefs.md § Sub-agent 5`.
8. **Calibration** (optional): If `<spec-basename>.ground-truth.md` exists, run recall/precision scoring — see `references/sub-agent-briefs.md § Calibration`.

---

## Presenting the frontier to the user

Present ALL gaps in the current frontier in one message. For each gap, use this format — designed for the user to scan, decide, and respond in one pass:

```
❓ **GAP-<N>** (<impact>, <type>) - **<title — the question>**

<Context: 1-2 sentences orienting the reader. What part of the system, why this matters.>

📎 **Evidence** (strongest first):
- [line N] "<quote>" — <why this drives the gap>
- [line M] "<quote>" — <why this contributes>
- (or: "Spec is silent — no text addresses this question.")

**Options:**
1. <option name>: <one-line consequence>
2. <option name>: <one-line consequence>

➡️ **Recommendation:** Option <N> (<confidence>) — <one-line reasoning>

<if this gap has conditional downstream gaps:>
↳ If confirmed, opens: GAP-<X> (<downstream question, one line>)
```

**Field reference for the presentation:**

| Field            | Source                                                     | Purpose                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<impact>`       | Gap entry                                                  | blocker / high / medium / low — should I care?                                                                                                                                                        |
| `<type>`         | Gap entry                                                  | missing / ambiguous / contradictory — what kind of decision is this?                                                                                                                                  |
| `📎 Evidence`    | Gap entry `What the spec says` + `Why that's insufficient` | All proof points, ordered by how strongly each one drives the gap. Strongest first = the one the user should read if they read only one. Each line has `[line N]` so the user can verify in the spec. |
| `<confidence>`   | Gap entry                                                  | high / medium / low — can I rubber-stamp this or do I need to think?                                                                                                                                  |
| `↳ If confirmed` | Recommendation ripple trace                                | Shows the decision tree — what this answer unlocks                                                                                                                                                    |

After ALL gaps, add:

```
---
**How to answer:** For each GAP, reply with the option number (e.g., "GAP-470: 1")
or your own answer. You can batch all answers in one message.
Reply "all" to accept every recommendation. Reply "skip" to defer all.
```

**Key rules:**

- NEVER dump the full gap log entry (patches, sub-questions, verification) into the presentation. That's storage, not conversation. The user can read the gap log file for details.
- Keep each gap to **10 lines max** in the presentation. The title is the question; the context orients; the evidence proves; the options are actionable; the recommendation is a default.
- Group gaps by impact (blockers first, then high, medium, low). Within the same impact, group parent-child gaps together.
- If a gap has downstream gaps, show them as `↳` lines so the user sees the decision tree, not a flat list.
- Evidence lines: include ALL proof points from the gap entry, ordered from strongest driver to weakest. Each must have `[line N]` and a verbatim quote. The user reads top-down and stops when convinced — the ordering does the work.

### Handling user replies (Decide phase → Settle phase)

User replies are collected in the Decide phase, then processed in the Settle phase:

- **Accepts recommendation**: Queue the recommended patch for settlement.
- **Picks a different option**: Queue that option's patch for settlement. Discard conditional downstream gaps traced from the recommendation's patch. The ripple trace in the next round re-derives downstream gaps from the actual answer.
- **Provides own answer**: Write a patch from the user's answer (same format: literal spec text with insertion point). Queue for settlement. Re-derive downstream gaps in the next round.
- **Marks out of scope**: Move to "Out of scope" in gap log. Discard downstream gaps with `Parent: GAP-N`.
- **Defers**: Keep in "Open gaps". Downstream gaps with `Parent: GAP-N` wait — they are NOT in the current frontier.

If the patch's `verified` status is `no`, warn: "This patch was not verified as complete — settlement verification may fail."

After the Settle phase completes, the spec has changed. Return to Phase A Step 1 to detect the change, re-verify affected cells, and check for new gaps.

## Formats

See `references/gap-format.md` for impact scale, gap entry format, Q&A log format, and gap log format.
See `references/model-format.md` for the spec model format, verification algorithm, chain format, and spec-change detection.

## Gap log

Keep `<spec-basename>.gaps.md` up to date after every batch and every decision, using the format in `references/gap-format.md`. The gap log is append-and-move only — NEVER remove or overwrite existing entries. New gaps are added; existing gaps move between sections only on user confirmation.
