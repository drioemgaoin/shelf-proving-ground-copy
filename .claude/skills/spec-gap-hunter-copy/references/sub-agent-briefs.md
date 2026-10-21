# Sub-agent Briefs

Reference material for the spec-gap-hunter skill. Each sub-agent receives its section below along with the spec path, scope statement, gap log, the model (if any), the operating mode, and shared patch-and-verify instructions from the SKILL.md body.

## Operating modes

Every sub-agent (1-4) operates in one of two modes:

### MODEL-BUILD mode (Phase A, first run)

Output TWO things:
1. **Matrices**: your analytical artifacts (entity registry, HAZOP, data dictionary, state-event, interface tables, business rules, chains) as structured tables per `references/model-format.md`. Use the exact table format from model-format.md — the orchestrator assembles these into the persistent model file.
2. **Gaps**: any questions the spec cannot answer, as full gap entries per `references/gap-format.md`.

The matrices are the primary output. They enumerate EVERY question the spec should answer for the entities/interfaces/lifecycles you analyze. Gaps are the subset of matrix cells where the spec fails to answer.

### EXPLORE mode (Phase B, subsequent runs)

You receive the spec AND the model. Your job is NOT to rebuild what's in the model. Instead:
1. Read the model to understand what has already been checked.
2. Look for entities, interfaces, states, failure modes, or cross-cutting concerns NOT represented in any model cell.
3. Apply your creative techniques (the ones specific to your sub-agent role) to find questions the systematic matrices missed.
4. For each new question, verify it is not already a cell in the model (even if worded differently — steel-man the match).
5. Output: new model rows (per `references/model-format.md`) AND gap entries for any that the spec cannot answer.

## Shared instruction: patch and verify

Every sub-agent (1-4) must follow this when generating possible answers for each gap:

1. **Write a patch, not a description.** Each possible answer must include a `patch:` field per `references/gap-format.md`. The patch must be literal insertable spec text — self-contained, using the same terminology as the question, explicit enough that a reader can answer the gap question by reading only the patch and its surrounding spec context.

2. **Self-check every patch.** After generating all gaps, run a verification pass on every patch:
   - Decompose the gap question into atomic sub-questions (every explicit and implied part).
   - For each sub-question, quote the specific words from the patch that answer it.
   - If you cannot produce a quote for any sub-question, rewrite the patch to include the missing content, then re-verify.
   - Record each sub-question → quote mapping in the `sub-questions:` field.
   - Mark `verified: yes` only when every sub-question has a quote. Otherwise `verified: no` with the missing parts in `rejection:`.

3. **The recommendation MUST point to a `verified: yes` answer.** If no answer passes, rewrite until one does — an unverified recommendation is not allowed.

4. **Recommendation ripple trace.** After writing the recommended patch for each gap, trace its downstream implications:
   1. List every spec section that mentions any concept the patch touches.
   2. For each: does the patch create a new constraint, field, validation rule, format change, exit code, or behavioral contract?
   3. For each new thing: is it consumed, handled, or referenced in all relevant sections? Missing consumers/handlers → conditional downstream gap with `Parent: GAP-N`.
   4. Check the patch against the rest of the spec and existing decisions for new conflicts.
   5. Log each downstream gap as a separate gap entry with `Parent: GAP-N`. These are conditional — they assume the parent's recommendation is confirmed.

   This step is what prevents multi-round convergence failure. Without it, each round's decisions create the next round's gaps. With it, downstream gaps are discovered in the same round as their parents.

## Sub-agent 1: Contradiction detector

**Brief:** You are looking for contradictions and inconsistencies ONLY. Nothing else.

**Step 0 — Entity Registry.** Before extracting predicates, build an entity registry. Scan every section. For each system component, data structure, process, file, or behavioral property, create an entry:

```
CANONICAL NAME: <name>
ALIASES: <section>: "<exact phrase>" | <section>: "<exact phrase>" | ...
BEHAVIORAL CLAIMS: <section>: "<exact claim>" | <section>: "<exact claim>" | ...
```

If two phrases in different sections plausibly refer to the same thing (same role, same data, same subsystem), they MUST share one entry. "The cache", "the mtime-indexed store", "the parsed block data" → one entry. "Written once", "generated from blocks", "hardcoded" → check if they describe the same artifact. When in doubt, merge and flag.

Then scan each entity's BEHAVIORAL CLAIMS for incompatible properties.

**Step 0b — Multi-source precedence check.** For each entity in the registry that has multiple instantiation points (defined in more than one location, sourced from more than one file or directory, or with more than one producer), check: does the spec define behavior when instances from different sources conflict? If two instances could give contradictory instructions (e.g., one says "present", another says "absent" for the same target), and the spec defines no precedence, merge rule, or conflict resolution, that's a gap. This catches a different class of problem than the predicate table — not "do the claims contradict?" but "when multiple instances of this entity exist, what happens if THEY contradict each other?"

**Step 0c — Requirements smell scan (from Femmer et al., JSS 2016).** Before extracting predicates, scan the spec text for linguistic patterns that make claims unreliable. A sentence containing a smell cannot produce a trustworthy predicate — flag it as a gap (type: ambiguous) before proceeding.

Scan for these five validated smell categories:

| Smell category | Pattern | Example | Why it's a gap |
|----------------|---------|---------|----------------|
| Subjective | Qualitative terms with no measurable definition | "user-friendly", "intuitive", "modern", "clean" | Two implementers will build different things — not testable |
| Ambiguous | Adverbs/adjectives implying degree without a threshold | "quickly", "appropriate", "reasonable", "sufficient" | No way to verify compliance — what number is "quickly"? |
| Non-verifiable | Open-ended enumerations or escape clauses | "etc.", "and/or", "as needed", "among others" | Impossible to know if the implementation is complete |
| Vague pronouns | Pronouns without a clear, unambiguous referent | "it handles this", "they are processed", "the system does this" | Which component? Which data? Referent is ambiguous |
| Loopholes | Conditional hedges that permit skipping the requirement | "if possible", "when feasible", "as applicable", "ideally" | Gives the implementer permission to not do it — is it required or not? |

For each smell found:
1. Quote the exact phrase and its line number.
2. Classify which smell category it falls into.
3. Log it as a gap: the question is "What does `<phrase>` mean concretely?" with type `ambiguous`.
4. Continue to predicate extraction — but do NOT extract a predicate from a sentence that contains an unresolved smell. The predicate would inherit the ambiguity.

**Step 0d — Decision-text consistency check.** When a gap log with decisions exists, the spec contains text inserted from confirmed decisions across multiple rounds. These insertions can contradict each other or the original spec text because each round's author (human or sub-agent) may not have seen all other rounds' insertions.

For each entity in the registry:
1. Identify which behavioral claims were part of the original spec and which were added by decisions (check the gap log for the section/line the decision modified).
2. For each pair of claims about the same entity where one predates the decisions and one was added by a decision: do they use consistent terminology? Do they make compatible claims? A decision that says "parallel Docker sandboxes" and original text that says "share the same files" about the same entity is a contradiction — even if each statement was correct in isolation when written.

This step catches ambiguities introduced by multi-round spec evolution that single-round analysis misses.

**Predicate extraction and contradiction analysis:**

1. Read the entire spec. Extract every claim as a semi-formal predicate:
   - `INVARIANT: X.property = Y` for "X is always Y"
   - `TEMPORAL: X precedes Y` for "X must happen before Y"
   - `EXCLUSION: X ⊕ Y` for "X and Y cannot both be true"
   - `IMMUTABLE: X` for "X is written/set/defined once"
   - `MUTABLE: Y (by X)` for "X reads/updates/changes Y"
   - `CARDINALITY: count(X) = N` for "exactly N of X"
2. Normalize vocabulary: "written once" / "immutable" / "fixed" → same concept. "Reads dynamically" / "updates" / "changes at runtime" → same concept. Contradictions are invisible when the same concept uses different words in different sections.
3. Build a predicate table: rows are predicates, columns are spec sections. Mark each cell C (consistent), X (contradicts), or — (silent).
4. Any X cell is a contradiction gap. Log it.
5. **Pairwise field interaction matrix** (from NIST covering arrays + CIA Quadrant Crunching). For every data format with 3+ fields, generate a pairwise interaction matrix: for each pair of fields, list the extreme/boundary value combinations and check whether the spec defines behavior for each. Empty cells are gaps.

     ```
     Format: <name>
     | Field pair          | Combination           | Spec says? |
     |<field A> × <field B>| <extreme A, extreme B>| [fill]     |
     |<field A> × <field B>| <extreme A, normal B> | [fill]     |
     ```

     This catches cross-field interactions where two individually valid values create an undefined combination.

6. Then cross-reference every format table against every example:
   - For every field in a table, verify it appears in the examples with the same semantics.
   - For every field in an example, verify it appears in the table.
   - If the table describes a field at one structural level (block-level) but the example nests it differently (inside a sub-item), that's an ambiguity.
   - If two examples for the same format use different value types for the same field, that's an inconsistency.

## Sub-agent 2: Component and interface auditor

**Brief:** You are auditing every component and interface for completeness. One component at a time, full depth.

1. Read the spec. List every component (scripts, parsers, agents, skills, hooks, pipelines).
2. **Data dictionary audit.** For every named data entity in the spec (any noun that represents user-visible data — e.g., book, status, title, author, card, filter), build a data dictionary entry:

     ```
     Entity: <name>
     | Aspect          | Spec defines? | Section/line | Detail                    |
     |Data type         | [Y/N]         | [line]       | [string, enum, number...] |
     |Required/optional | [Y/N]         | [line]       | [required/optional]       |
     |Validation rules  | [Y/N]         | [line]       | [min/max, format, regex]  |
     |Uniqueness        | [Y/N]         | [line]       | [unique? scoped to what?] |
     |Default value     | [Y/N]         | [line]       | [value or "none"]         |
     |Created by        | [Y/N]         | [line]       | [actor/component]         |
     |Read by           | [Y/N]         | [line]       | [actor/component]         |
     |Updated by        | [Y/N]         | [line]       | [actor/component]         |
     |Deleted by        | [Y/N]         | [line]       | [actor/component]         |
     ```

     Any cell where the spec says nothing (Spec defines? = N) and the absence would cause implementer disagreement is a gap. The question is: "What is the <aspect> of <entity>?"

3. For EACH component, check independently:
   - **Inputs**: format, source, validation?
   - **Outputs**: format, destination, who consumes?
   - **Error paths — HAZOP skeleton matrix.** FIRST, build a literal matrix for EACH component with rows = parameters and columns = HAZOP guide words. THEN fill every cell. The matrix is the skeleton — empty cells are visible and FORBIDDEN. This prevents the omission blindness where LLMs stop enumerating after 3-4 items.

     ```
     Component: <name>
     | Parameter      | NO/NONE          | MORE              | LESS             | OTHER THAN         | EARLY/LATE        |
     |<param 1>       | [fill or N/A]    | [fill or N/A]     | [fill or N/A]    | [fill or N/A]      | [fill or N/A]     |
     |<param 2>       | [fill or N/A]    | [fill or N/A]     | [fill or N/A]    | [fill or N/A]      | [fill or N/A]     |
     ```

     Guide word definitions: NO/NONE = absent/null/empty. MORE = too much/many/large/complex. LESS = truncated/partial/incomplete. OTHER THAN = wrong type/invalid syntax/hostile content. EARLY/LATE = timing wrong, out of sequence.

     Every cell must contain either a specific question about that parameter×deviation, or "N/A" with a one-line reason why this deviation is impossible for this parameter. "N/A" requires justification — it cannot be used to skip.
   - **"What" without "how"**: For every action verb attributed to this component — any verb describing what the component *does* (e.g., "discovers", "caches", "generates", "reads", "detects", "resolves", "merges", "selects", "filters", "validates", "transforms", "reconciles") — check whether the spec describes the mechanism. A verb followed by an object but no procedure is a gap when two implementers could build incompatible procedures. Do not limit yourself to these examples; scan for ANY action verb with an undefined mechanism.
   - **Referenced-but-undefined**: Is this component referenced in other sections with capabilities not described in its own section?
4. For every table or list that enumerates items (e.g., "5 parsers", "8 escalation reasons"), verify EACH item has a detailed definition. Missing items are gaps.
5. For every named data flow (placeholders like `{{FIX_HISTORY}}`, stored artifacts, structured messages), verify the format is defined.
6. **Cross-component interface verification (STPA-derived).** For every interface between two components, build an interface verification table. This goes beyond format matching — it systematically enumerates control action deviations (from Leveson's STPA).

     ```
     Interface: <producer> → <consumer>
     | Aspect              | Producer says                | Consumer expects             | Match? |
     |Output format         | [exact format from spec]     | [exact format from spec]     | [Y/N]  |
     |Required fields       | [fields producer emits]      | [fields consumer requires]   | [Y/N]  |
     |Optional fields       | [fields producer may omit]   | [fields consumer handles]    | [Y/N]  |
     |Error signaling        | [how producer signals error] | [how consumer detects error] | [Y/N]  |
     ```

     Then for each interface, enumerate control action deviations:
     - **Missing**: producer never sends / consumer never receives — what happens?
     - **Wrong**: producer sends wrong format/content — does consumer validate?
     - **Too early**: producer sends before consumer is ready — race condition?
     - **Too late**: producer sends after consumer's timeout/deadline — fallback?

     Any N in the match column or undefined deviation behavior is a gap.

7. **Assume-guarantee contracts (from contract-based design — Collins Aerospace/ISO 26262).** For each component identified in step 1, write down two things:
   - **Assumes**: what must be true before this component runs (preconditions on inputs, state, environment)
   - **Guarantees**: what this component promises if its assumptions hold (postconditions on outputs, state changes)

     ```
     Component: <name>
     | Assumes                          | Guaranteed by which component? | Match? |
     |<assumption 1>                    | [component name or NONE]       | [Y/N]  |
     |<assumption 2>                    | [component name or NONE]       | [Y/N]  |

     | Guarantees                       | Required by which component?   |
     |<guarantee 1>                     | [component name or NONE]       |
     |<guarantee 2>                     | [component name or NONE]       |
     ```

   Then check: for every assumption, is there another component whose guarantee matches it? An unmatched assumption (Match = N) is a gap — nobody promises to deliver what this component needs. A guarantee required by nobody is not a gap but worth noting.

   This catches interface gaps that format-matching (step 6) misses. The STPA tables check whether data *shapes* match. Assume-guarantee checks whether semantic *promises* match.

8. **Environment assumption audit (from Jackson/Zave Problem Frames).** For each requirement in the spec, identify what must be true about the world *outside the system* for the requirement to be satisfiable. These are domain assumptions — things the spec silently takes for granted.

   For each requirement:
   1. State the requirement as written.
   2. List every assumption about the environment it depends on (browser capabilities, network, device, user behavior, data availability, timing, permissions).
   3. For each assumption, check:
      - Is it stated anywhere in the spec? (cited section or "unstated")
      - Is it validated by the system? (e.g., feature detection, fallback, error message)
      - What happens if the assumption is wrong? (defined behavior or undefined?)

     ```
     Requirement: "<requirement text>" (line N)
     | Domain assumption                          | Stated? | Validated? | If wrong? |
     |<assumption about the world outside system>  | [Y/N]   | [Y/N]      | [defined/undefined] |
     ```

   Any unstated, unvalidated assumption with undefined failure behavior is a gap. The question is: "What happens when <assumption> is not true?"

## Sub-agent 3: Lifecycle and limits analyst

**Brief:** You are auditing every lifecycle, state machine, and numeric limit. Find missing transitions and undefined boundary behaviors. Before diving into state machines, derive obstacles to every goal the spec states.

**Step 0 — Goal-obstacle analysis (from van Lamsweerde's KAOS method — IEEE TSE).** Before examining state machines and limits, work top-down from the spec's goals. This is the opposite direction from bottom-up failure analysis — instead of asking "what could go wrong with this component?", ask "what conditions would prevent this goal from being achieved?"

1. Extract every goal from the spec. A goal is any statement of desired outcome, capability, or behavior: "users can filter by status", "the drawer shows book details", "changes are immediate", "the FAB opens the drawer in Add mode." Look for verbs like "can", "must", "should", "will", "allows", "ensures", "supports."
2. For EACH goal, systematically derive obstacles — conditions that would prevent the goal from being satisfied:
   - **Precondition obstacles**: what must be true before this goal can be attempted? What if it isn't?
   - **Interference obstacles**: what other system behavior or user action could prevent this goal mid-execution?
   - **Resource obstacles**: what resource (data, state, capacity) does this goal depend on? What if it's unavailable?
   - **Concurrency obstacles**: can two simultaneous actions prevent this goal? (e.g., deleting a book while the drawer is showing it)
3. For each obstacle: does the spec address it? Check for an explicit requirement, error path, or design decision that handles this condition. If nothing addresses it, it's a gap. The question is: "What happens when <obstacle condition> is true?"
4. Do NOT derive obstacles about adjacent systems outside the spec's scope. Only derive obstacles from conditions within the spec's subject matter.

**Step 0b — Business rule extraction.** Before lifecycle analysis, extract every business rule from the spec. A business rule is any statement that constrains behavior, data, ordering, uniqueness, validity, or default values — not just conditional logic. Examples: "newest-first insertion order", "data is in-memory with no persistence", "title truncates to 2 lines."

1. Scan every section. For each business rule found, record:
   - **Rule**: the rule stated precisely, with the source line number.
   - **Testable?**: Can a QA engineer write a pass/fail assertion for this rule as written? If not, it's a gap (type: ambiguous). The question is: "What is the measurable criterion for `<rule>`?"
   - **Boundary conditions**: Does the rule have edges? (e.g., "2-line truncate" — what happens at exactly 2 lines? At 0 lines?) If the spec doesn't define boundary behavior, it's a gap.
   - **Precedence**: Are there scenarios where this rule and another rule could both apply to the same situation? If so, does the spec define which wins? If not, it's a gap. The question is: "When `<rule A>` and `<rule B>` both apply, which takes precedence?"

2. Output the full business rule inventory before proceeding to lifecycle analysis. This inventory feeds into the decision tables (step 5) and negation testing (step 4) — use it as input.

**Lifecycle and limits analysis:**

1. Read the spec. List every entity with state changes (rules, findings, tickets, specs, review cycles, log entries, cache entries).
2. For EACH lifecycle, build the state-event matrix:
   - Extract all explicitly stated states.
   - Extract all explicitly stated events/triggers.
   - For each (state, event) cell: is the behavior defined? Undefined cells for plausible combinations are gaps.
   - Check for dead states (no outgoing transition) and unreachable states (no incoming transition).
3. Find every number in the spec (iteration limits, round caps, budget maxes, counts). For EACH:
   - What happens when the limit is reached? Defined escalation or undefined?
   - Is there a corresponding entry in the escalation/error taxonomy?
   - Is the boundary inclusive or exclusive?
4. Apply negation testing to key requirements:
   - For "IF condition THEN behavior": what happens IF condition AND behavior does NOT happen? (failure mode)
   - What happens IF condition is NOT met but behavior happens anyway? (unintended trigger)
   - What happens IF condition is partially met? (boundary)
5. **Decision table / condition combination testing.** For every conditional rule or branching logic in the spec (if/then, when/do, mode switches, tier-dependent behavior), build a decision table enumerating ALL condition combinations. This catches gaps that pairwise field interaction (sub-agent 1) misses — pairwise covers data field combinations, but decision tables cover logical branch combinations.

     ```
     Rule: <description of conditional logic>
     | Condition A | Condition B | Condition C | Expected behavior | Spec defines? |
     | T           | T           | T           | [fill]            | [Y/N/silent]  |
     | T           | T           | F           | [fill]            | [Y/N/silent]  |
     | T           | F           | T           | [fill]            | [Y/N/silent]  |
     ...
     ```

     Focus on:
     - Rules where the same data is subject to different conditions at different tiers or phases
     - Scope qualifiers (per-block vs per-entry vs per-file) — enumerate what each interpretation means
     - Conditions that can be simultaneously true in ways the spec doesn't address
     - **Budget × structural variant**: for every numeric budget, limit, or cap in the spec, enumerate structural variants that could affect counting. For each limit × variant combination, check if the spec defines the counting rule

     Any "silent" cell (spec says nothing about this combination) is a gap.
6. Scan for requirements smells that indicate missing lifecycle:
   - Passive voice hiding actor: "X is validated" — by whom?
   - Missing trigger: "the cache refreshes" — when?
   - Undefined lifecycle: "entries accumulate" — then what? Cleanup? Rotation?
   - Incomplete conditional: "if X then Y" — what happens when NOT X?

## Sub-agent 4: Adversarial reviewer

**Brief:** You are trying to break the system described in this spec. Find the gaps that would cause failures in production.

1. Read the spec. For each component, enumerate failure modes using FMEA categories. You MUST address EVERY category for EVERY component — empty cells forbidden:
   - **INPUT FAILURES**: corrupt, missing, out-of-range, wrong type, too large, hostile (injection, catastrophic patterns)
   - **TIMING FAILURES**: too slow, too fast, timeout, race condition, out-of-sequence
   - **STATE FAILURES**: uninitialized, stale, inconsistent, partially written, corrupted
   - **RESOURCE FAILURES**: out of memory, disk full, iteration limit, token limit
   - **DEPENDENCY FAILURES**: upstream unavailable, upstream returns error, upstream returns stale data

   For each failure mode: does the spec define the behavior? If not, that's a gap.
2. **Business edge case generation.** For each business rule identified in the spec (any statement that constrains behavior, ordering, data validity, uniqueness, or default values), generate 3 edge-case scenarios:
   - **Boundary case**: What happens at the exact limit or threshold the rule defines? (e.g., title is exactly 2 lines long, list has exactly 0 books, status is changed to the same status it already has)
   - **Duplicate / conflict case**: What happens when the rule is applied to data that already satisfies it, or when two instances of the same action collide? (e.g., adding a book that's already in the list, two rapid status changes on the same book, deleting a book while the drawer is showing it)
   - **Rapid repetition case**: What happens when the user performs this action twice in quick succession, or N times in a row? (e.g., clicking FAB twice rapidly, adding 10 books without closing the drawer, toggling the same filter chip on and off rapidly)

   For each scenario: does the spec define the expected behavior? If not, it's a gap. The question is: "What happens when <edge-case scenario>?"
3. Generate 7 specific pre-mortem failure narratives. Each must be:
   - **Concrete**: who did what, what happened, what went wrong, who was affected.
   - **Cross-component**: the failure involves two or more components disagreeing or interacting badly.
   - **Traceable**: for each narrative, walk backward through the spec — which section should have prevented this? Does it?
4. Focus failure narratives on:
   - A component received unexpected input from another component because the format was undefined
   - A lifecycle reached a state with no defined transition out
   - Two components enforced contradictory constraints on the same file/data
   - A limit was hit and the behavior was undefined
   - An error in one component cascaded to another with no detection or recovery

## Sub-agent 5: Verifier

**Brief:** You are the gap-in-gap-finding detector and model completeness auditor. You receive the spec, the merged gap list from the other 4 sub-agents, AND the model (if it exists). Your job is NOT to find gaps from scratch — it's to find what the other agents MISSED and to verify the model covers the spec proportionally.

LLMs are 6-7x better at judging coverage than enumerating from scratch (Silent Omissions, 2026). You exploit this asymmetry.

**Model completeness audit (when model exists).** Before running the standard steps below, check model completeness:
1. Read the model's entity table. Compare against every named entity in the spec. Flag entities missing from the model.
2. For each entity in the model, check that coverage matrix rows cover all applicable standard aspects (see `references/model-format.md § Standard aspects`). Flag missing aspects.
3. Check that every spec section with behavioral claims has at least one chain passing through it. Sections with zero chain coverage are suspect.
4. Report: entities missing, aspects missing, chain-uncovered sections. Each missing item becomes a new model row.

1. Read the spec section by section. For EACH section, count how many gaps in the merged list reference it. Build a **coverage heatmap**:
   ```
   | Spec section                    | Gaps found | Components in section | Gap-per-component ratio |
   |Tier 1                           | 12         | 3                     | 4.0                     |
   |Tier 2                           | 3          | 4                     | 0.75  ← COLD SPOT       |
   ```
2. **Cold spots** are sections with gap-per-component ratio below 1.0. For each cold spot:
   - Re-read the section
   - For each component/interface/format in that section: is it genuinely complete, or did all 4 agents have the same blind spot?
   - For each component: apply ONE HAZOP guide word (OTHER THAN) and ONE negation test (what if this doesn't happen?) — just enough to probe, not a full sweep
3. **Named entity sweep**: List every component, data flow, and format the spec names. Check each against the merged gap list. Any entity with zero gaps is suspect — verify it's genuinely complete.

3b. **Term definition sweep.** Scan the spec for every noun or noun phrase used as a **routing condition, filter, or classification** (e.g., "UI tickets only", "per-component", "non-exempt rules"). For each such term, check: is it defined with a concrete criterion that an implementer can evaluate programmatically? A term that is used as an if-condition ("if UI ticket → Phase 3") but never defined ("what makes a ticket a UI ticket?") is a gap. This catches undefined jargon that previous sub-agents miss because they focus on component behavior, not the classification vocabulary that gates that behavior.
4. **Domain completeness check (from ontology-based requirements engineering — OBFRE).** All 4 sub-agents analyzed what's *inside* the spec. This step asks what the spec *forgot to mention entirely* — silent omissions with no textual trace.

   Build a domain model *independently* from the spec — not by extracting from the spec, but by reasoning about what concepts should exist for this subject matter:
   1. Identify the spec's domain (e.g., "personal reading list management", "rule enforcement pipeline", "e-commerce checkout").
   2. List the core concepts, entities, relationships, and behaviors that any system in this domain would typically need to address. Use your knowledge of the domain, not the spec text.
   3. Cross-reference: for each concept in the domain model, does the spec address it? Check for explicit coverage (named, described) or implicit coverage (handled as part of another concept).
   4. For each concept with NO coverage:
      - Is its absence an intentional scoping decision? (Check the spec's stated scope, out-of-scope sections, or any explicit exclusions.)
      - Or is it a plausible oversight — something the author may have forgotten?
      - If plausible oversight: log it as a gap. The question is: "Does the spec intentionally exclude <concept>, or is this a silent omission?"
      - If clearly intentional: note it but do not log a gap.

   ```
   Domain: <domain name>
   | Domain concept       | Spec addresses? | Section(s) | Intentional exclusion or oversight? |
   |<concept>             | [Y/N]           | [section]  | [intentional (reason) / possible oversight] |
   ```

   This is the only technique in the entire architecture that builds an *independent reference point* to compare against.

5. **Scenario walk-through (user journey coverage).** Enumerate the 5-7 most important end-to-end user scenarios implied by the spec's goals. A scenario is a complete sequence of user actions from intent to outcome — not a single feature, but a journey across features.

   For each scenario:
   1. Write the step-by-step flow (e.g., "User opens app → sees grid → taps filter chip → grid updates → taps card → drawer opens → changes status → closes drawer → grid reflects change").
   2. For each step: is the behavior fully specified in the spec? Quote the section and line. If unspecified → gap.
   3. For each transition between steps: is the trigger defined? Is the resulting system state defined? Are side effects on other visible parts of the system specified? (e.g., when the drawer closes after a status change, does the grid re-sort? Does the filter still apply? Does the card animate?) If unspecified → gap.
   4. For each scenario: what happens if the user abandons mid-way? (e.g., closes the drawer without saving, navigates away, loses network). If the spec claims in-memory-only data, is abandon behavior implicit or explicit?

   ```
   Scenario: <name>
   | Step | Action              | Behavior specified? | Section/line | Transition side effects specified? |
   | 1    | <user action>       | [Y/N]               | [line]       | [Y/N — list unspecified effects]  |
   | 2    | <user action>       | [Y/N]               | [line]       | [Y/N]                            |
   ```

   This step catches gaps that live *between* features — the seams where one component's output becomes another's input from the user's perspective, not the system's.

6. **Cross-section consistency**: For any concept that appears in 3+ sections, verify the merged gaps caught any inconsistencies between those sections. If not, re-read and compare.
7. Log any new gaps found. These are the gaps that 4 focused agents all missed.
8. **Patch verification spot-check.** Select 5 patches from the merged list — prefer patches with the most sub-questions (most likely to have incomplete coverage). For each:
   - Independently decompose the gap question into sub-questions (do NOT look at the sub-agent's decomposition first).
   - For each sub-question, attempt to quote words from the patch that answer it.
   - Compare your decomposition and quotes against the sub-agent's `sub-questions:` field.
   - If you find a sub-question the sub-agent missed, or a quote that doesn't actually answer the sub-question: flag the patch as `verified: no` and record the discrepancy.
   - If any discrepancy is found, extend the spot-check to ALL patches from that sub-agent.

   Report spot-check results: N checked, N passed, N failed, sub-agents with discrepancies.

## Calibration: mutation testing (runs when ground truth exists)

**Purpose:** Prove the architecture's recall, not just hope for it. Without this, you're guessing your recall.

**When to run:** If a ground truth file exists (`<spec-basename>.ground-truth.md` or referenced in the gap log), run this calibration step AFTER the Verifier completes.

1. Load the ground truth. For each known gap, check whether the merged+verified gap list contains a matching finding (same question, even if worded differently).
2. Build a recall matrix:

   ```
   | GT ID  | Gap description (from ground truth) | Matched by finding? | Which sub-agent(s) should have caught it? | Technique(s) applicable |
   | GT-1   | [description]                       | [Y/N]               | [sub-agent #]                             | [T2, T9, etc.]          |
   ```

3. Score:
   - **Recall** = matched / total ground truth gaps
   - **Precision** = true positives / total findings (where true positive = finding that matches a ground truth gap)
4. For any ground truth gap missed across the run:
   - Identify which technique(s) SHOULD have caught it.
   - Flag it as a **structural blind spot** — the architecture has a weakness in that technique's implementation.
5. Report the calibration results alongside the gap findings. If recall < 95% or precision < 95%, note the specific blind spots and which sub-agent instructions need strengthening.

**Ground truth format:** Any file with lines like `GT-<N>: <gap description>` or a markdown table with GT IDs. The calibration step pattern-matches flexibly.
