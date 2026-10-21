# Consented Frontier Players — Consensus Algorithm for Rule Discovery

Find the top authoritative sources for a domain, extract their recommended
rules, and iterate until 80% consensus is reached — handling splits, ties,
and ambiguity systematically.

## Overview

The algorithm queries N frontier players (authoritative sources) about what
rules should govern a domain. It clusters their recommendations, measures
agreement, and iterates — adding or replacing players — until a clear
consensus emerges.

**Key parameters:**
- `N_PANEL` — target panel size, determined by domain breadth (see below)
- `N_SEED = 5` — players seeded from registry (when registry exists, no static seeds)
- `N_DISCOVER` — players discovered fresh via WebSearch (varies by resolution path)
- `C = 80%` — consensus threshold (stop when reached)
- `T = 15%` — split threshold (determines add-only vs replace strategy)
- `MAX_ITER = 5` — maximum iterations before forced stop

**Panel sizing** (research-backed — Delphi method, thematic saturation,
wisdom-of-crowds literature):

| Domain breadth | N_PANEL | Coverage | Examples |
|---|---|---|---|
| **Broad** (cross-paradigm, multi-language) | 10 | ~85% of themes | error-handling, logging, testing, security |
| **Narrow** (single-concern, homogeneous) | 5-7 | ~70%+ of themes | import-ordering, naming, formatting |

Evidence: Guest et al. show 70% of themes captured at 6 sources, 92% at 12.
Budescu & Chen find ~6 optimal for non-overlapping expertise. Galesic (2016)
finds 5-7 optimal for qualitative decisions. Reliability gains are
insignificant above 12 (Delphi meta-analyses).

**Independence matters more than count.** Five independent sources from
different ecosystems beat ten correlated sources from the same community
(Kao & Couzin 2014, Nature 2020). Each player's `independence_group` must
be tracked to prevent correlation.

## Player Scoring Framework

Every player receives a composite quality score (0-100) used for registry
persistence, incremental refresh decisions, and replacement thresholds.

### Scoring dimensions

| Dimension | Weight | What it measures | How computed |
|---|---|---|---|
| **Authority** | 25 | Official status, citation count, ecosystem standing | Tier 1 = 25, Tier 2 = 18, Tier 3 = 10 |
| **Information gain** | 25 | Novel positions the panel would lack without this player | `(unique_positions / total_positions_extracted) * 25` |
| **Substance** | 20 | Density of actionable, extractable positions | `min(positions_extracted / 5, 1) * 20` |
| **Recency** | 15 | How recently the source was updated | <1yr = 15, 1-2yr = 12, 2-3yr = 8, >3yr = 4 |
| **Purpose/bias** | 15 | Absence of commercial or ideological bias | Neutral/educational = 15, mild commercial = 10, strong commercial/advocacy = 5 |
| **Lateral reading** | 10 | Independent citation and reputation verification | Strong (3+ citations) = 10, Medium (1-2) = 5, Weak (0) = 0, Negative = REMOVE |

**Total: 0-110** (base 0-100 + lateral bonus 0-10)

The lateral reading dimension is a **bonus** added after the base score,
not a redistribution of existing weights. This preserves backward
compatibility — existing registry scores remain valid. Sources with
"negative" lateral signal (active debunking found) are removed regardless
of base score. Sources with "weak" signal (zero independent citations)
receive no bonus and are flagged for replacement when equivalent content
exists from a source with medium or strong lateral signal.

**Evidence for lateral reading dimension:** Wineburg & McGrew (2019)
showed lateral reading achieves 100% credibility assessment accuracy vs
50% for vertical reading by PhD experts. Our pilot on 5 error-handling
panel members confirmed clean 3-tier separation: OWASP and Dan Luu
(strong — industry citations, conference speakers), TypeSanitizer
(medium — curated community attention, verified author credentials),
prgrmmng.com and Comcomponent (weak — zero independent citations,
unknown authors). The two weak sources were flagged for replacement.

<critical>
The "information gain" dimension rewards sources that ADD positions the
panel would otherwise lack — NOT sources that agree with the majority.
This prevents the echo chamber effect documented in Delphi method
criticism (Actunotes 2024) and filter bubble research (Reuters Institute).

"Consensus contribution" (rewarding agreement) was explicitly rejected
during design because it creates circular reasoning: sources are kept
because they agree with other kept sources, suppressing valid minority
positions.
</critical>

### Hard gates (binary, not scored)

Before a player enters the composite comparison, it must pass these gates:

| Gate | Requirement | Rationale |
|---|---|---|
| **Fetchability** | Successfully fetched (200 status) | Unreachable = invalid (ISO 25012 completeness) |
| **Minimum authority** | Authority >= Tier 3 (10 pts) | Filters noise without scoring bias |
| **Minimum substance** | At least 2 extractable positions | Prevents empty/marketing content |
| **Relevance** | Directly addresses the topic | Binary: relevant or not (CRAAP) |

A player that fails any gate is excluded regardless of composite score.

### Score decay

Scores decay by a factor of **0.95 per run cycle** to prevent ossification:

```
decayed_score = stored_score * (0.95 ^ runs_since_last_evaluation)
```

This forces periodic re-evaluation even without new challengers beating
existing players. After ~14 runs without re-evaluation, a perfect score
of 100 decays to ~49 — below any reasonable replacement threshold.

Evidence: Multi-armed bandit literature (Dote content feed, Alibaba
AliBoost) shows that time-decay on exploit scores is essential to prevent
popularity lock-in.

### Bayesian smoothing for new candidates

New candidates lack observation history. To prevent a lucky single
observation from displacing a proven source, blend observed scores with
a population prior:

```
smoothed_score = (n * observed_score + k * prior) / (n + k)
```

Where:
- `n` = number of times this source has been evaluated
- `k` = smoothing constant (default: 3)
- `prior` = mean score of current registry players

A first-time candidate with k=3 and registry mean of 70:
```
smoothed = (1 * 85 + 3 * 70) / (1 + 3) = 73.75
```

This prevents score 85 from displacing a proven player at 75 on a
single observation. After 3+ evaluations, the observed score dominates.

Evidence: Glicko-2 rating deviation, TrueSkill Bayesian factor graphs
(Microsoft Research), and production recommender systems (Pinterest,
Alibaba) all use this pattern for cold-start protection.

### Deterministic tie-breaking

When two players have identical composite scores, break ties
lexicographically by URL. This ensures identical scores produce
identical orderings across runs.

## Step 1: Resolve frontier players

Player resolution follows a **priority chain**. The first path that matches
determines the full player roster for this sub-run.

### 1-static. Check for static seeds (highest priority)

Check if a static seed file exists at `rules/.seeds/{domain}.json` with
players for this sub-run's scope.

If static seeds exist:
1. Load all players from the seed file as the **complete roster**
2. `N_PANEL` = number of players in the seed file
3. **Skip WebSearch entirely** — no discovery needed
4. Run the **freshness gate** (Step 1-validate) before proceeding
5. All static seed players are treated identically to any other player
   in subsequent steps — they CAN be replaced by the iteration loop if
   they become outliers. Static seeds provide deterministic *starting
   points*, not immunity.

<critical>
Static seeds produce deterministic, reproducible results across invocations.
This is the key mechanism that ensures `/generate-rules error-handling` and
the global sub-run of `/generate-rules error-handling --scope all --stack X`
produce IDENTICAL global rules — because both resolve to the same static
seed file with the same players.
</critical>

### 1-validate. Freshness gate (when using static seeds)

Before using a static seed file, validate it:

1. Check `last_validated` against `validation_interval_days`. If fresh
   (within interval), proceed directly to Step 2 — no validation needed.
2. If stale, validate each player URL with a quick WebFetch (read first
   100 bytes to check reachability).
3. Run ONE WebSearch for `"{domain} conventions {current_year}"` and
   compare top 5 results against the seed list. Flag any Tier 1-2 source
   not already in the list.
4. If all URLs alive and no major new source found: update
   `last_validated` to today, proceed to Step 2.
5. If dead URLs or major new source found: warn the user with the
   specific issue. Still use the current seeds — do NOT silently fall
   back to WebSearch. The user decides whether to update the seed file.

### 1a. Check for scored registry (second priority)

If no static seeds exist but a **scored registry** file exists at
`rules/.registry/{domain}.json` for this scope, use **incremental refresh**:

1. Load the registry's scored player array, sorted by composite score
   descending
2. Apply **score decay**: multiply each stored score by `0.95 ^ runs_since_scored`
3. Check if **full re-evaluation** is due (every `K` runs, default K=10):
   - If `run_count % K == 0`: proceed to **pool-and-reselect**
     (Step 1a-reeval). This is the staleness safety net.
   - Otherwise: proceed with incremental refresh (Step 1a-refresh).

#### 1a-reeval. Pool-and-reselect (full re-evaluation)

When `run_count % K == 0`, the registry may have drifted into a local
optimum despite score decay and incremental refresh. The solution is NOT
to discard the registry and start from scratch (which risks selecting a
weaker panel that still reaches internal consensus), but to **merge old
and new candidates into a single pool and re-select the best N**.

This approach is backed by convergent practices across multiple domains:
- **Cochrane/PRISMA** systematic reviews are cumulative — previously
  included studies are retained and new ones added, never discarded
- **Genetic algorithm elitism** — top performers are preserved across
  generations; remaining slots filled from new candidates
- **Caruana ensemble selection** — greedy forward selection from a
  combined library of all models, regardless of origin
- **Portfolio optimization** — selects optimal subsets from the full
  universe with diversity constraints, not "old vs new"
- **Pareto/social choice committee selection** — excellence, diversity,
  and proportionality evaluated from a combined candidate pool

**Algorithm:**

1. **Snapshot the old registry** — load all existing players with their
   decayed scores. These form the **incumbent pool** (I players).

2. **Run full discovery** — execute the multi-angle search strategy
   (Step 1c) to discover `N_PANEL` fresh candidates. Apply hard gates.
   Extract positions via WebFetch. Compute composite scores with
   **Bayesian smoothing** (n=1 for first-timers, prior = incumbent pool
   mean score). These form the **challenger pool** (C players).

3. **Merge into combined pool** — union of incumbent + challenger pools.
   Deduplicate by URL (if both pools found the same source, keep the
   version with more observation history — higher `times_evaluated`).
   Combined pool size: `|I| + |C| - |duplicates|`.

4. **Re-score information gain for the combined pool** — information
   gain must be recomputed because an incumbent's unique positions may
   now be covered by a challenger (or vice versa). For each player in
   the combined pool:
   ```
   unique_positions = positions ONLY found in this player
                      (across the entire combined pool)
   information_gain = (unique_positions / total_positions) * 25
   ```

5. **Select top N_PANEL from combined pool** — greedy forward selection
   with diversity constraints:
   ```
   final_panel = []
   remaining = combined_pool sorted by composite_score descending

   WHILE len(final_panel) < N_PANEL AND remaining is not empty:
       FOR candidate in remaining (highest score first):
           IF independence_constraint_satisfied(candidate, final_panel)
              AND source_type_quota_satisfied(candidate, final_panel):
               final_panel.append(candidate)
               remaining.remove(candidate)
               BREAK
       ELSE:
           # No candidate satisfies constraints — relax and take highest
           final_panel.append(remaining[0])
           remaining.remove(remaining[0])
   ```

   Independence constraints (same as Step 1c):
   - Max 1 source per organization (independence group)
   - Max 2 sources per source type
   - At least 3 of 5 source types represented
   - At least 1 grey literature source

6. **Log the recomposition** — record in audit trail which players were
   kept from the old registry, which new players entered, and which old
   players were displaced (with score comparison):
   ```json
   {
     "run": 10,
     "action": "pool_and_reselect",
     "combined_pool_size": 17,
     "incumbents_kept": 7,
     "challengers_added": 3,
     "incumbents_displaced": 3,
     "displaced": [
       {"player": "Old Source A", "decayed_score": 48, "reason": "displaced by higher-scoring challenger"},
       {"player": "Old Source B", "decayed_score": 51, "reason": "independence group conflict with higher scorer"}
     ]
   }
   ```

7. **Proceed to consensus** (Step 2) with the recomposed panel, then
   score (Step 6) and persist (Step 7) as usual.

<critical>
Pool-and-reselect guarantees that the final panel after full re-evaluation
is AT LEAST as good as the old registry — because every incumbent is a
candidate in the combined pool. If no better sources exist, the old panel
is re-selected intact. If better sources exist, they displace only the
weakest incumbents, not the entire panel.

This eliminates the regression risk of "discover N completely different
players that reach consensus among themselves but score lower than the
old panel." The old panel's best players are always available for
re-selection.
</critical>

#### 1a-refresh. Incremental refresh (M-of-N)

Search for `M = ceil(N_PANEL * 0.3)` new candidates via WebSearch
(Step 1c). For a panel of 10, M=3.

For each new candidate:
1. Apply **hard gates** — exclude if any gate fails
2. Extract positions via WebFetch
3. Compute **information gain** against stored registry positions:
   count how many positions this candidate contributes that no existing
   player covers
4. Compute full composite score with **Bayesian smoothing** (n=1 for
   first observation, prior = registry mean score)
5. Compare smoothed score against the **lowest-scoring registry player**
   (after decay)

**Replacement rule:**
```
IF smoothed_new_score > decayed_lowest_score
   AND (new_candidate.independence_group != lowest.independence_group
        OR new_candidate covers a source_type gap):
    REPLACE lowest with new candidate
    Log replacement in audit trail
ELSE:
    KEEP existing panel unchanged
```

If **zero replacements** are made across all M candidates, the registry
is unchanged → **output is identical to the previous run**.

If **any replacements** are made:
1. Re-run consensus with the updated panel
2. Re-score all players (including incumbents, whose information gain
   may have changed)
3. Update the registry

<critical>
The incremental refresh searches M new candidates but only replaces
existing players when the new candidate demonstrably scores higher AFTER
Bayesian smoothing. This creates a convergence guarantee: panels stabilize
as the registry matures, and identical input produces identical output
when no genuinely better sources exist.

The periodic full re-evaluation (every K runs) uses pool-and-reselect
(Step 1a-reeval) to prevent permanent ossification while guaranteeing
the final panel is at least as good as the old one.
</critical>

### 1b. Discover players via WebSearch (full discovery)

If no static seeds AND no scored registry exists (true first run),
discover all `N_PANEL` players via WebSearch using the multi-angle
search strategy (Step 1c).

After discovery and consensus, **score all players and persist the
scored registry** (Step 7).

<critical>
Full discovery is the only path on the true first run (no registry
exists). When a registry exists but full re-evaluation is due
(run_count % K == 0), pool-and-reselect (Step 1a-reeval) is used
instead — it runs full discovery but merges results with the old
registry rather than discarding it. Every subsequent run
uses incremental refresh unless a full re-evaluation is triggered.
The scored registry bridges runs — it is the mechanism that makes
output deterministic across invocations.
</critical>

### What qualifies as a frontier player

Players must span **at least 4 of 6 perspective slots** to counter
publication bias. The old 5-type classification (canonical, community,
production, grey literature, contrarian) was replaced with 6 perspective
slots after benchmarking showed standard searches found 0-40% of known
authorities. The new slots are designed to ensure each slot is discovered
by a DIFFERENT search strategy, maximizing coverage.

| Perspective slot | What it provides | Discovery strategy | Min required |
|---|---|---|---|
| **Canonical** | Official docs, specs, RFCs, language references | Multi-channel (Channel C) | 1 |
| **Practitioner** | Production experience, senior engineer blogs, postmortems | Multi-channel (Channel A) | 1 |
| **Tooling** | Linters, validators, static analysis that enforce conventions | Perspective-driven search | 0 |
| **Empirical** | Academic studies, data-driven analyses, benchmark results | Perspective-driven search | 0 |
| **Contrarian** | Criticism, alternatives, "considered harmful" perspectives | Adversarial queries | 1 (mandatory) |
| **Cross-ecosystem** | How other languages/frameworks solve the same problem | Adversarial + citation chaining | 0 |

**Evidence for the 6-slot model:**
- Benchmark on REST API design: standard queries found 4/10 expected
  authorities (40%); enhanced 5-strategy pipeline found 7-9/10 (70-90%)
- Benchmark on software testing: standard queries found 0/10 (0%);
  enhanced found 4/10 (40%) — all from citation chaining
- Each strategy found exclusive sources invisible to other strategies,
  proving independence (97.6% exclusive rate in testing benchmark)

**Slot coverage metric:** Track `slots_filled` in the report. Target ≥4/6.

### 1-retry. Handling fetch failures (403, timeouts, unreachable)

When WebFetch returns an error (403 Forbidden, timeout, or any non-200
status) for a player URL during validation (Step 1-validate) or querying
(Step 2):

1. **Retry once** — immediately retry the same WebFetch call. Some sites
   rate-limit or block the first request but succeed on retry (caching,
   transient bot-detection, CDN warm-up).
2. **If retry also fails**, the player is **unreachable** and MUST be
   replaced:
   - Run a WebSearch query targeting the same source category and domain
     (e.g., if Oracle's error-handling article failed, search for another
     authoritative Java/general error-handling article)
   - Select a replacement from a **different independence group** than
     the failed player when possible
   - The replacement enters the roster with `Origin: Replacement (fetch
     failure)` and is treated identically to any other player
3. **Never fall back to "known principles"** — the goal is 100% live
   sourcing. Every player in the final roster must have been successfully
   fetched and queried.

<critical>
A player that cannot be fetched is NOT a valid player. Do not count it
toward N_PANEL, do not apply "known principles" from training knowledge
as a substitute. Replace it with a reachable source that covers the same
domain area. The final report must show 100% of players successfully
queried.
</critical>

### 1c. Enhanced discovery pipeline (5 strategies)

The discovery pipeline uses 5 independent strategies to maximize coverage.
This replaces the previous 3-layer approach after benchmarking proved that
single-strategy search finds only 0-40% of known canonical authorities.

**Evidence summary:**
- REST API benchmark: standard queries → 40% recall; 5-strategy → 70-90%
- Testing benchmark: standard queries → 0% recall; 5-strategy → 40%
- Snowballing finds 83% vs 46% for database-only (Wohlin et al. 2015)
- Adversarial queries found 10-20 exclusive sources per domain
- Citation chaining was the ONLY strategy to find primary sources
  (Fielding dissertation, Martin Fowler, Kent Beck, Google Testing Blog)
- Lateral reading separated 5 sources into 3 tiers with 100% actionable
  differentiation (Wineburg & McGrew 2019: 100% vs 50% accuracy)

#### Strategy 1: Multi-channel search (6 queries minimum)

Search across 3 independent channel types. Evidence: no single search
system is sufficient for systematic reviews (Gusenbauer 2020).

```
Channel A — General web search (2 queries):
  "{topic} best practices conventions"
  "{topic} guide official documentation"

Channel B — Developer platforms (2 queries):
  "{topic} site:github.com"
  "{topic} site:stackoverflow.com OR site:dev.to"

Channel C — Standards/specifications (2 queries):
  "{topic} RFC IETF specification standard"
  "{topic} W3C OR OWASP OR ISO OR IEEE specification"
```

#### Strategy 2: Adversarial queries (2 queries, mandatory)

Deliberately surface dissenting and alternative positions. Evidence:
search engine bias audit (arXiv:2311.09969, 2023) proved biased queries
produce biased results, with technology topics showing the most
significant disparities.

```
Adversarial A: "{topic} criticism problems anti-pattern considered harmful"
Adversarial B: "{topic} alternative instead overrated why wrong"
```

<critical>
Adversarial queries are NOT optional. They are the primary mechanism for
filling the contrarian perspective slot. In benchmarks, they exclusively
found foundational critique papers, academic anti-pattern formalizations,
and cross-paradigm alternatives that zero positive queries surfaced.
</critical>

#### Strategy 3: Citation chaining (6 queries, 1 round)

After initial scoring, take the top 3 candidates and follow references.
Evidence: citation chaining was the ONLY strategy to find primary sources
in the testing benchmark (Fowler, Beck, Google Testing Blog — all missed
by all other strategies combined).

```
For each of top 3 seeds by initial score:
  Backward: WebSearch "{seed_title}" references "see also" "based on"
  Forward:  WebSearch "{seed_title}" OR "{seed_url}" cited influence
```

One round only — diminishing returns after round 1 (inclusion rate drops
to 1.19%, Wohlin et al. 2015).

#### Strategy 4: Known-name verification (variable, typically 2-5 queries)

After fetching all sources, scan extracted content for proper nouns
(specifications, tools, authorities, books) mentioned by ≥2 sources but
not in the candidate pool. Search for each directly.

Evidence: JSON:API specification was mentioned by multiple sources but
missed by all 62 searches in the REST API benchmark. OpenAPI Specification
was similarly referenced but its spec URL wasn't returned.

```
For each proper noun mentioned by ≥2 fetched sources but not in pool:
  WebSearch "{name} official site OR specification OR documentation"
```

#### Strategy 5: Lateral reading filter (2 queries per candidate)

After scoring all candidates, validate each above-threshold candidate by
checking what INDEPENDENT sources say about it. This is a filter, not a
discovery strategy — it validates candidates found by strategies 1-4.

Evidence: Wineburg & McGrew (2019) — fact checkers using lateral reading
achieved 100% credibility assessment accuracy vs 50% for PhD historians
reading vertically (staying on the site). Our pilot confirmed: lateral
reading cleanly separated 5 panel members into 3 quality tiers, flagging
2 for removal.

```
For each candidate above scoring threshold:
  WebSearch "{source_name}" OR "{author_name}" cited referenced recommended
  WebSearch "{source_url}" criticism OR review

Classification:
  Strong (3+ independent citations by authorities): +10 composite bonus
  Medium (1-2 citations, curated-community attention): +5 composite bonus
  Weak  (zero independent signal): FLAG for replacement
  Negative (debunking/criticism found): REMOVE from pool
```

Sources with Weak lateral signal are replaced only when equivalent
content exists from a source with Medium or Strong lateral signal.

#### Independence enforcement

- Max 1 source per organization
- Max 2 sources per perspective slot
- Track `independence_group` for every player
- Track `discovery_strategy` for every player (multi-channel / adversarial /
  citation-chain / known-name / lateral-upgrade)
- At least 1 contrarian source (from adversarial queries) mandatory

For each candidate, verify:
- Relevance: directly addresses the topic, not tangentially related
- Authority: widely referenced, maintained, or officially endorsed
- Substance: contains actionable positions, not vague advice or marketing
- Recency: prefer sources updated within the last 2-3 years
- Independence: belongs to a different group than existing panel members
- Lateral signal: not flagged as Weak without a replacement available

### Output: Player roster

```
Player # | Source | Type | URL | Relevance | Origin          | Independence group
---------|--------|------|-----|-----------|-----------------|-------------------
1        | ...    | ...  | ... | HIGH/MED  | Static seed     | {group}
2        | ...    | ...  | ... | HIGH/MED  | Static seed     | {group}
...
6        | ...    | ...  | ... | HIGH/MED  | Registry seed   | {group}
7        | ...    | ...  | ... | HIGH/MED  | Discovered      | {group}
...
```

The `Origin` column tracks resolution path (static seed / registry seed /
discovered). The `Independence group` tracks correlation — players in the
same group share perspective bias. Both columns are for reporting and
iteration decisions — all players are treated identically in consensus steps.

## Step 2: Query each player

For each frontier player, extract their recommendations as atomic rule
candidates.

### What to extract

1. **Explicit rules** — stated conventions, lint rules, documented patterns
2. **Implicit rules** — patterns consistently enforced in code/tests but
   not explicitly documented
3. **Anti-patterns** — things they explicitly warn against
4. **Enforcement** — how they verify compliance (linter, test, type check)

### Extraction with verbatim text

For every position extracted, record:
- **`text`**: The actual words the source uses — a direct quote or close
  paraphrase. Must be verifiable by visiting the URL.
- **`type`**: `explicit` (stated rule), `implicit` (enforced pattern),
  or `anti-pattern` (warned against).

<critical>
The extracted text is the **provenance chain** from source to rule. It must
be specific enough that a human can click the URL and confirm the source
says this. Vague extractions like "mentions logging" do NOT qualify — the
text must capture the source's actual recommendation with its specificity
intact.

**Disqualification test**: If the source says "centralized logging and
monitoring" but the cluster position is "log every error with structured
diagnostic context including stack trace," the extraction does NOT support
that cluster. The player should NOT be counted in that cluster's agreement.
</critical>

### Normalization

Convert every recommendation into a normalized candidate:

```
{semantic-label}: {one imperative sentence}
Source: Player #{N}
Extracted text: "{actual quote or close paraphrase from the page}"
Enforcement: {mechanism or "none stated"}
```

Example:
```
no-silent-catch: Log or re-throw every caught error; empty catch blocks are never acceptable.
Source: Player #1 (Node.js Best Practices)
Extracted text: "Always handle errors in catch blocks — never leave them empty"
Enforcement: grep for empty catch blocks
```

## Step 3: Cluster and measure consensus

### 3a. Semantic clustering

Group normalized candidates by semantic equivalence — two candidates are
in the same cluster if they prescribe the same behavior, even if worded
differently.

<critical>
**Cluster membership requires substantive extracted text.** A player is
counted in a cluster's agreement ONLY if its `positions_extracted` contains
an entry whose `text` substantively matches the cluster's position. Vague
or tangential mentions do NOT count.

Example — WRONG: Google SRE Postmortem Culture mentions "logging" in
passing. Clustering counts it as supporting "log every error with
structured diagnostic context including stack trace." This inflates
agreement from 80% to 90%.

Example — RIGHT: charlax/professional-programming says "Python's
logger.exception automatically adds the exception stacktrace to the log
message." This substantively matches the cluster position. Count it.

The `positions_contributed` field in the registry MUST only contain
clusters where the player has a substantive `positions_extracted` entry.
</critical>

Example cluster:
```
Cluster: "no-silent-catch"
  - Player #1: "Always handle errors in catch blocks"
  - Player #3: "Never leave catch blocks empty"
  - Player #7: "Every catch must log or re-throw"
  → 3 players agree → 30% agreement (if N=10)
```

### 3b. Measure agreement

For each cluster, compute THREE metrics using signal classifications:

```
directive_pct    = players_with_DIRECTIVE_signal / total_active_players
mention_pct      = players_with_DIRECTIVE_or_MENTION / total_active_players
contradiction_n  = count of players_with_CONTRADICTION_signal
```

Sort clusters by directive_pct descending.

### 3c. Identify the consensus set

A cluster qualifies as consensus when ALL three conditions are met:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| Zero contradictions | contradiction_n == 0 | Any source arguing against disqualifies. Tested across testing, security, code-organization, error-handling: contradicted fragments always produce unreliable rules. |
| Directive floor | directive_pct >= 50% | At least half the panel explicitly prescribes this behavior. |
| Combined threshold | mention_pct >= 80% | Broad agreement including weaker signals. |

Classification:
- **Consensus** (all 3 met): accepted — becomes a rule
- **Borderline** (directive >= 50%, mention 60-79%, 0 contradictions): user decides
- **Contradicted** (any contradiction): rejected regardless of other scores
- **Weak** (directive < 50%): rejected — not enough explicit prescriptions

If the consensus set is non-empty for enough rules to cover the domain,
**stop — consensus reached** (go to Step 5).

If not, proceed to Step 4.

## Step 4: Handle insufficient consensus

When no cluster (or too few clusters) meets all 3 conditions, analyze the
distribution to decide the iteration strategy.

### 4a. Identify the top two groups

For each rule cluster that did NOT reach consensus:

- **Y** = mention_pct of the largest cluster (dominant group)
- **Z** = mention_pct of the second-largest cluster

### 4b. Decision logic

```
IF Y >= C (80%):
    This cluster has consensus → accept it
    Continue checking remaining clusters

ELSE IF abs(Y - Z) >= T (15%):
    ┌─────────────────────────────────────────────────────┐
    │ CLEAR DOMINANT — one group leads significantly      │
    │                                                     │
    │ Strategy: REPLACE worst players                     │
    │                                                     │
    │ 1. Identify players NOT in the dominant cluster     │
    │    for any rule (the "outliers")                    │
    │ 2. Rank outliers by how many dominant clusters      │
    │    they disagree with (most disagreements = worst)  │
    │ 3. Remove the X worst outliers (X = number of      │
    │    players outside dominant across all clusters,    │
    │    capped at 3 per iteration)                       │
    │ 4. Search for X replacement players, targeting      │
    │    the same source categories but different          │
    │    specific sources                                 │
    │ 5. Query replacements and re-cluster                │
    └─────────────────────────────────────────────────────┘

ELSE IF abs(Y - Z) < T (15%):
    ┌─────────────────────────────────────────────────────┐
    │ SPLIT — two competing camps, no clear dominant      │
    │                                                     │
    │ Strategy: ADD players without removing any          │
    │                                                     │
    │ 1. The split cannot be resolved by removal —        │
    │    both camps have legitimate representation        │
    │ 2. Add 3-5 NEW frontier players (increasing N)     │
    │    to break the tie with fresh perspectives         │
    │ 3. Search for players from DIFFERENT categories     │
    │    than existing ones (e.g., if mostly libraries,   │
    │    add expert articles or RFCs)                     │
    │ 4. Query new players and re-cluster with the        │
    │    expanded pool                                    │
    │ 5. The larger N makes it harder for a split to      │
    │    persist — one camp will pull ahead or they       │
    │    will merge                                       │
    └─────────────────────────────────────────────────────┘
```

### 4c. Convergence check after each iteration

After re-clustering with the updated player pool:

```
FOR each rule cluster:
    Y_new = agreement of largest group
    
    IF Y_new >= C (80%):
        Cluster has consensus → accept
    
    ELSE IF Y_new > Y_previous:
        Progress — continue iterating
    
    ELSE:
        Stalled — flag for manual review after MAX_ITER
```

### 4d. Iteration loop

```
iteration = 0
WHILE iteration < MAX_ITER:
    iteration += 1
    
    clusters_without_consensus = [c for c in clusters if c.agreement < C]
    
    IF len(clusters_without_consensus) == 0:
        BREAK — full consensus reached
    
    FOR each cluster without consensus:
        Y = largest_group_agreement
        Z = second_group_agreement
        
        IF abs(Y - Z) >= T:
            // Clear dominant → replace worst outliers
            remove_worst_outliers(max=3)
            add_replacement_players(count=removed_count)
        ELSE:
            // Split → add more players without removing
            add_new_players(count=3 to 5)
    
    query_new_players()
    re_cluster_all()
    
    // Check if we can stop
    IF all clusters have agreement >= C:
        BREAK

// After loop ends:
IF any clusters still < C:
    Flag them with actual agreement percentage
    Include in proposal with "[{agreement}% consensus]" marker
    Let user decide whether to include or drop
```

## Step 5: Compile consensus rules

After the consensus loop terminates, compile the final rule set.

### Accepted rules (>= 80% consensus)

These are strong consensus — include in the rule files.

```
Rule label              | Agreement | Players agreeing
------------------------|-----------|------------------
{label}                 | {%}       | #1, #3, #5, #7, #8, #9, #10, #12
...
```

### Borderline rules (60-79% consensus)

Present these separately. The user decides whether to include them.

```
Rule label              | Agreement | Reason for inclusion/exclusion
------------------------|-----------|-------------------------------
{label}                 | {%}       | {why it matters or doesn't}
...
```

### Rejected rules (< 60% consensus)

Mention but do not include. These lack sufficient agreement.

```
Rule label              | Agreement | Why rejected
------------------------|-----------|-------------
{label}                 | {%}       | {competing approaches, niche, etc.}
...
```

## Step 6: Score all players

After the consensus loop terminates, compute the composite score for
every player in the final roster.

### 6a. Compute each dimension

For each player:

1. **Authority (0-25)**: Assign based on source standing:
   - Tier 1 (official docs, specs, RFCs, 10k+ stars) = 25
   - Tier 2 (widely-referenced guides, established vendors) = 18
   - Tier 3 (community blogs, niche references) = 10

2. **Information gain (0-25)**: Count positions this player contributes
   that NO other player in the panel covers:
   ```
   unique_positions = positions ONLY found in this player
   information_gain = (unique_positions / total_positions_extracted) * 25
   ```
   A player whose every position is covered by others scores 0.
   A player that is the sole source of 5 out of 20 total positions
   scores `(5/20) * 25 = 6.25`.

3. **Substance (0-20)**: Density of extractable positions:
   ```
   substance = min(positions_extracted / 5, 1) * 20
   ```

4. **Recency (0-15)**: Based on source last-updated date:
   - < 1 year = 15
   - 1-2 years = 12
   - 2-3 years = 8
   - > 3 years = 4

5. **Purpose/bias (0-15)**: Assess source intent:
   - Neutral/educational/official = 15
   - Mild commercial (vendor with substantive content) = 10
   - Strong commercial/advocacy (marketing-heavy, biased) = 5

### 6b. Composite score

```
composite = authority + information_gain + substance + recency + purpose_bias
```

Range: 0-100. Sort players by composite descending, with deterministic
tie-breaking by URL (lexicographic).

### 6c. Audit log

Record every scoring decision in the registry's `audit_trail` array.

#### Fetch failure entries

Every fetch failure MUST record the full retry-then-decide flow:

```json
{
  "url": "https://example.com/article",
  "error": "403",
  "retried": true,
  "retry_result": "403",
  "outcome": "replaced",
  "replaced_source": "Example Article (original)",
  "replacement_url": "https://other.com/article",
  "replacement_source": "Other Article (replacement)",
  "replacement_independence_group": "other-org"
}
```

For challenger candidates that fail during incremental refresh (not panel
members), the outcome is `"discarded"` — they simply fail the fetchability
hard gate:

```json
{
  "run": 3,
  "url": "http://xunitpatterns.com/",
  "error": "ECONNREFUSED",
  "retried": true,
  "retry_result": "ECONNREFUSED",
  "outcome": "discarded",
  "reason": "Challenger candidate — hard gate fail, not a panel member"
}
```

#### Replacement entries

```json
{
  "run": 4,
  "date": "2026-08-22",
  "action": "replaced",
  "removed": {"player": "Old Source", "decayed_score": 52},
  "added": {"player": "New Source", "smoothed_score": 68},
  "reason": "New source scored higher after Bayesian smoothing (n=1, prior=70, observed=85, smoothed=73.75 > decayed 52)"
}
```

#### Audit retention policy

The audit trail uses a **compact-and-retain** strategy to prevent
unbounded growth:

- **Always keep in full detail:**
  - The first run (baseline)
  - Any run with replacements (churn > 0)
  - Every pool-and-reselect run (run_count % K == 0)
  - The last 3 runs (rolling window for debugging)

- **Compact into a summary range:** Consecutive zero-churn incremental
  refreshes between milestones are merged into a single entry:

```json
{
  "_compacted": true,
  "runs": "2-9",
  "date_range": "2026-08-21",
  "action": "incremental_refresh",
  "total_candidates_searched": 24,
  "total_candidates_qualified": 1,
  "total_replacements": 0,
  "fetch_failures": [ ... ],
  "summary": "8 consecutive zero-churn runs. All challengers were commercial blogs."
}
```

Compaction runs at persist time: after writing the new run's entry,
scan the trail and merge any eligible range. Fetch failures within
compacted ranges are preserved — they are never discarded.

Persist the retention policy in the registry:

```json
{
  "audit_retention_policy": {
    "strategy": "compact_and_retain",
    "keep_detailed": ["first_run", "runs_with_churn", "pool_and_reselect", "last_3_runs"],
    "compact_zero_churn_ranges": true
  }
}
```

<critical>
Every replacement decision MUST be logged with the full scoring breakdown
and rationale. Fetch failures MUST record retry attempts and outcomes.
This satisfies ISO 25012 traceability requirements and PRISMA's documented
inclusion/exclusion criteria. The audit trail is the mechanism that makes
the registry's evolution inspectable and debuggable. Compaction preserves
all fetch failures and all churn events — only redundant zero-churn
summaries are merged.
</critical>

## Step 7: Persist scored registry

After scoring, persist the full roster as a scored registry at
`rules/.registry/{domain}.json`.

### Registry format

```json
{
  "domain": "{domain}",
  "created": "2026-08-21",
  "last_run": "2026-08-21",
  "run_count": 1,
  "full_eval_interval": 10,
  "decay_factor": 0.95,
  "smoothing_constant": 3,
  "scopes": {
    "{scope}": {
      "panel_size": 10,
      "consensus_clusters": [
        {
          "label": "no-silent-catch",
          "description": "Log or re-throw every caught error",
          "agreement": 90,
          "players": [1, 3, 5, 7, 8, 9]
        }
      ],
      "players": [
        {
          "source": "Node Best Practices",
          "type": "OSS guide",
          "url": "https://...",
          "independence_group": "node-community",
          "positions_extracted": [
            {
              "text": "Always handle errors in catch blocks — never leave them empty",
              "type": "explicit",
              "cluster": "no-silent-catch"
            },
            {
              "text": "Use async/await with try-catch; unhandled rejections crash the process",
              "type": "explicit",
              "cluster": "async-error-handling"
            }
          ],
          "composite_score": 97,
          "scores": {
            "authority": 25,
            "information_gain": 12,
            "substance": 20,
            "recency": 15,
            "purpose_bias": 15,
            "lateral_reading": 10
          },
          "discovery_strategy": "multi-channel",
          "lateral_signal": "strong",
          "lateral_evidence": ["Cited by 4+ HN front-page discussions", "Referenced in university curricula"],
          "times_evaluated": 3,
          "last_scored": "2026-08-21",
          "positions_contributed": ["no-silent-catch", "async-error-handling", "unhandled-rejection"]
        }
      ],
      "audit_trail": []
    }
  }
}
```

### Convergence tracking

The registry tracks convergence via **churn rate**:

```
churn_rate = replacements_this_run / panel_size
```

When `churn_rate == 0` for `K_CONVERGE` consecutive runs (default: 3),
the panel has **converged**. Log this in the registry:

```json
{
  "convergence": {
    "converged": true,
    "converged_at_run": 5,
    "zero_churn_streak": 3,
    "note": "Panel stable — no replacements for 3 consecutive runs"
  }
}
```

A converged panel still undergoes incremental refresh (M candidates
searched) but replacements become increasingly unlikely as incumbent
scores are well-established and Bayesian smoothing penalizes newcomers.

The periodic full re-evaluation (every K runs) can break convergence
and restart the cycle — this is intentional as a staleness safety net.

### Conclusion stability (secondary convergence signal)

Track whether the **consensus output** (accepted positions) changed,
not just whether sources changed. A panel that produces identical
consensus from different sources has also converged in the dimension
that matters most.

```json
{
  "conclusion_stability": {
    "consensus_hash": "sha256_of_sorted_consensus_labels",
    "stable_since_run": 3,
    "consecutive_stable_runs": 4
  }
}
```

## Step 8: Report

After consensus and scoring, produce the frontier player report:

```
FRONTIER CONSENSUS — {domain} / {stack}
========================================
Initial players:     {N_INITIAL}
Final players:       {N_FINAL}
Iterations:          {I}
Strategy used:       {REPLACE / ADD / MIXED}
Resolution path:     {STATIC SEED / SCORED REGISTRY (incremental) / POOL-AND-RESELECT / FULL DISCOVERY}
Run count:           {N}
Churn rate:          {replacements / panel_size}
Convergence:         {CONVERGED (since run X) / NOT YET / RESET (full re-eval)}

Consensus rules:     {N} (>= 80% agreement)
Borderline rules:    {N} (60-79%, user decides)
Rejected rules:      {N} (< 60%)

Discovery strategy effectiveness:
  Multi-channel:     {N} candidates ({N} exclusive)
  Adversarial:       {N} candidates ({N} exclusive)
  Citation chaining: {N} candidates ({N} exclusive)
  Known-name verify: {N} candidates ({N} exclusive)
  Perspective slots: {filled}/{total} filled

Player roster (sorted by composite score):
#  | Source              | Origin       | Indep. group  | Score | Lateral | Discovery    | Status
---|---------------------|--------------|---------------|-------|---------|--------------|--------
1  | {source}            | Registry     | {group}       | 97    | Strong  | multi-ch     | Kept
2  | {source}            | Registry     | {group}       | 87    | Medium  | adversarial  | Kept
3  | {source}            | New (run 4)  | {group}       | 83    | Strong  | citation     | Replaced #9
...
10 | {source}            | Registry     | {group}       | 61    | Weak    | multi-ch     | Flagged

Lateral reading results:
  Strong: {N} sources (3+ independent citations)
  Medium: {N} sources (1-2 citations)
  Weak:   {N} sources (flagged, {N} replaced)

Replacements this run:
  Removed: {source} (decayed score: {X})
  Added:   {source} (smoothed score: {Y}, observed: {Z}, n=1, prior={P})
  Reason:  {rationale}

Per-rule consensus detail:
Rule                    | Agree | Players
------------------------|-------|--------
{label}                 | {%}   | {list}
...
```

## Visual summary of the algorithm

```
    START
      │
      ▼
  Static seed file exists for this scope?
      │
    YES ──► Load all players from seed file
      │         Run freshness gate (validate URLs, check landscape)
      │         N_PANEL = seed file player count
      │
    NO
      │
      ▼
  Scored registry exists for this scope?
      │
    YES ──► Full re-eval due? (run_count % K == 0)
      │         │
      │       YES ──► POOL-AND-RESELECT (Step 1a-reeval)
      │         │     Snapshot old registry (incumbent pool)
      │         │     Run full discovery → challenger pool
      │         │     Merge incumbent + challenger pools
      │         │     Re-score information gain for combined pool
      │         │     Greedy select top N with diversity constraints
      │         │     Log recomposition in audit trail ──┐
      │         │                                        │
      │        NO                                        │
      │         │                                        │
      │         ▼                                        │
      │     INCREMENTAL REFRESH                          │
      │     Apply score decay (×0.95^runs)               │
      │     Search M=ceil(N*0.3) new candidates          │
      │     Apply hard gates → Bayesian smoothing        │
      │     Score > decayed lowest? → REPLACE            │
      │     No replacements? → IDENTICAL OUTPUT ──► STOP (use cached)
      │     Any replacements? ──┐                        │
      │                         │                        │
    NO  ────────────────────────┼────────────────────────┘
      │                         │
      ▼                         ▼
  FULL DISCOVERY (first run only)
  Discover N_PANEL via WebSearch
      │
      ▼
  Query each → extract positions
      │
      ▼
  Cluster by semantic similarity
      │
      ▼
  Measure agreement per cluster
      │
      ▼
  ┌─ All clusters >= 80%? ─── YES ──► CONSENSUS REACHED
  │                                         │
  NO                                        │
  │                                         │
  ▼                                         │
  For each cluster < 80%:                   │
  ┌────────────────────────────┐            │
  │  abs(Y - Z) >= 15%?       │            │
  │    YES → REPLACE outliers  │            │
  │    NO  → ADD players       │            │
  └────────────────────────────┘            │
      │                                     │
      ▼                                     │
  iteration < 5? ─── YES ──► loop back      │
      │                                     │
      NO ──► propose with markers           │
      │                                     │
      ▼◄───────────────────────────────────-┘
  SCORE ALL PLAYERS (Step 6)
  Compute composite: authority + info_gain + substance + recency + bias
      │
      ▼
  PERSIST SCORED REGISTRY (Step 7)
  Save scores + consensus clusters + audit trail
  Track churn rate → convergence detection
      │
      ▼
  REPORT (Step 8)
```
