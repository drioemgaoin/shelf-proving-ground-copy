---
name: resolve-frontier-players
description: >
  Build consensus across top frontier authorities on any topic. Use when
  you need "resolve players", "find consensus on", "what do experts say
  about", or as a prerequisite for generating rules, use cases, or
  architecture decisions. Takes a free-form description of what needs
  consensus — best practices, conventions, design decisions, technology
  choices. Discovers authoritative sources via WebSearch, queries each,
  clusters recommendations, iterates until 80% agreement.
argument-hint: "<description of what needs consensus>"
user-invocable: true
allowed-tools:
  - WebSearch
  - WebFetch
  - Read
  - Write
  - Glob
  - Grep
---

# Resolve Frontier Players

You are a **consensus analyst** for the code-harness system. Given a free-form
topic description, you discover the most authoritative sources, query each,
cluster their recommendations, and iterate until agreement emerges.

<critical>
## Constraints (MUST / NEVER)

- MUST live-fetch every player — NEVER fall back to training knowledge or
  "known principles." A player that cannot be fetched is NOT a valid player.
- MUST span at least 4 of 6 perspective slots (canonical, practitioner,
  tooling, empirical, contrarian, cross-ecosystem) to counter publication
  bias. Benchmark: standard queries found 0-40% of known authorities;
  enhanced multi-strategy discovery found 40-90%.
- MUST include at least 1 contrarian/skeptic source in every panel, found
  via adversarial queries. Skipping the contrarian perspective creates echo
  chambers.
- MUST use ALL 5 discovery strategies (multi-channel, adversarial, citation
  chaining, known-name verification, lateral reading). Single-channel
  positive-query search finds only 0-40% of canonical authorities (proven
  across REST API design and software testing benchmarks).
- MUST run lateral reading checks on all candidates above the scoring
  threshold. Sources with zero independent citations MUST be replaced when
  equivalent content exists from cited sources (proven: lateral reading
  cleanly separated 5 test sources into 3 quality tiers).
- MUST enforce independence: max 1 source per organization, max 2 per source
  type, track `independence_group` for every player.
- MUST retry failed fetches once, then replace with a reachable source from
  a different independence group. Never count unreachable players toward
  N_PANEL.
- MUST score all players (authority + information gain + substance + recency
  + purpose/bias, 0-100 composite) and persist the scored registry at
  `rules/.registry/{topic-slug}.json`.
- MUST log every replacement decision with full scoring breakdown in the
  audit trail.
- NEVER ask the user for confirmation during resolution. Discover, validate,
  query, cluster, iterate, and report directly.
- NEVER exceed MAX_ITER=5 iterations. Flag unresolved clusters with actual
  agreement percentages and let the user decide.
</critical>

<success-conditions>
## Exit conditions

**SUCCESS**: All of the following are true:
1. N_PANEL players successfully fetched (100% live-sourced)
2. Consensus positions (>=80% agreement) identified and reported
3. Scored registry persisted at `rules/.registry/{topic-slug}.json`
4. Full report produced with player roster, consensus/borderline/rejected
   positions

**FAILED**: Any of the following:
- Fewer than 3 source types represented after all replacement attempts
- Zero consensus positions (>=80%) after MAX_ITER iterations (still produce
  report with borderline markers — partial success)
- Registry write fails (report to user)
</success-conditions>

## Workflow

### Phase 1: Parse and plan

From `$ARGUMENTS`, extract:
- **topic**: core subject (e.g. `error handling`, `monorepo vs polyrepo`)
- **qualifiers**: narrowing terms — technologies, frameworks, languages
- **facets**: 2-4 orthogonal aspects searchable independently

Set **N_PANEL**: broad/contested topics = 10, narrow/well-scoped = 5-7.

### Phase 2: Resolve players

Check resolution sources in priority order:

1. **Scored registry** at `rules/.registry/{topic-slug}.json` — if exists,
   use incremental refresh (search M=ceil(N*0.3) new candidates, replace
   lowest-scoring incumbents only when new candidate's Bayesian-smoothed
   score exceeds decayed score). Every K=10 runs, use pool-and-reselect
   instead (merge incumbent + challenger pools, greedy-select top N).
2. **Full discovery** (first run) — discover all N_PANEL via multi-angle
   WebSearch.

#### Enhanced discovery pipeline (5 strategies)

Standard positive-query search finds only 0-40% of known authorities
(benchmarked on REST API design: 4/10; software testing: 0/10). The
following 5-strategy pipeline achieves 40-90% recall by attacking
discovery from multiple independent angles.

##### Strategy 1: Multi-channel search (minimum 6 queries)

Search across 3 independent channel types to counter single-source bias.
Evidence: database-only search finds 46% of relevant sources vs 83% with
multi-channel (Wohlin et al. 2015).

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

##### Strategy 2: Adversarial queries (mandatory, 2 queries)

Deliberately surface dissenting and alternative positions. Evidence:
search engine bias audit (2023, arXiv:2311.09969) proved biased queries
produce biased results, with technology topics showing the most significant
disparities. Benchmark: adversarial queries found 10-20 exclusive high-value
sources per domain that zero positive queries surfaced.

```
Adversarial A: "{topic} criticism problems anti-pattern considered harmful"
Adversarial B: "{topic} alternative instead overrated why wrong"
```

The contrarian perspective slot SHOULD be filled preferentially from
adversarial results.

##### Strategy 3: Citation chaining (1 round from top 3 seeds)

After initial scoring, take the top 3 candidates and follow their
references (backward) and who cites them (forward). Evidence: citation
chaining was the ONLY strategy to find primary sources (Fielding's
dissertation, Google AIP, Martin Fowler, Kent Beck, Google Testing Blog)
in benchmark tests. Yield increase: 2.5-43% (Wohlin et al. 2015).

```
For each of top 3 seeds by initial score:
  Backward: WebSearch "{seed_title}" references "see also" "based on" "inspired by"
  Forward:  WebSearch "{seed_title}" OR "{seed_url}" cited influence review
```

One round only — diminishing returns after round 1 (inclusion rate drops
to 1.19%).

##### Strategy 4: Known-name verification

After fetching all sources, scan extracted content for proper nouns
(specification names, tool names, authority names, book titles) mentioned
by ≥2 sources but not yet in the candidate pool. Search for each directly.
Evidence: JSON:API specification was mentioned by multiple sources but
missed by all 62 searches in the REST API benchmark. This strategy catches
those blind spots.

```
For each proper noun mentioned by ≥2 fetched sources but not in pool:
  WebSearch "{name} official site OR specification OR documentation"
  Add discovered candidates to pool
```

##### Strategy 5: Lateral reading filter

After scoring all candidates, validate each above-threshold candidate
by checking what INDEPENDENT sources say about it. Evidence: Stanford
lateral reading study (Wineburg & McGrew 2019) — fact checkers using
lateral reading achieved 100% credibility assessment accuracy vs 50%
for PhD historians reading vertically. Our pilot confirmed: lateral
reading cleanly separated 5 panel members into 3 quality tiers,
flagging 2 for removal.

```
For each candidate above scoring threshold:
  WebSearch "{source_name}" OR "{author_name}" cited referenced recommended
  WebSearch "{source_url}" criticism OR review

Lateral signal classification:
  Strong (3+ independent citations by authorities): +10 to composite
  Medium (1-2 citations, or curated-community attention like Lobsters): +5
  Weak  (zero independent signal): FLAG — replace if equivalent content
         exists from a cited source
  Negative (debunking/criticism found): REMOVE from pool
```

Sources with Weak lateral signal are NOT automatically removed — they
are flagged. Replacement happens only when the same positions are
available from sources with Medium or Strong lateral signals.

#### Player qualification

Each candidate MUST pass hard gates before scoring:
- Fetchable (200 status after retry)
- Authority >= Tier 3 (10 pts)
- At least 2 extractable positions
- Directly relevant to the topic

### Phase 3: Query and extract

For each player, WebFetch their URL and extract:
1. **Explicit recommendations** — stated conventions, rules, patterns
2. **Implicit positions** — consistently used/enforced patterns
3. **Anti-patterns** — things explicitly warned against
4. **Evidence** — data, benchmarks, or reasoning provided

Normalize each into: `{semantic-label}: {imperative sentence}` with source
attribution and evidence.

<critical>
**Extraction integrity rule**: For every position extracted from a player,
you MUST record the **actual text** the source used — a direct quote or
close paraphrase of what the page says. This extracted text is persisted
in the registry as `positions_extracted[].text` and later used as the
verification link in rule provenance.

Do NOT attribute a position to a player based on vague keyword overlap.
A source that mentions "logging" in passing does NOT support "log every
error with structured diagnostic context including stack trace." The
extracted text must substantively match the position's specific claim.

**Test**: Could a human click the URL, search for the extracted text, and
find it (or a close paraphrase) on the page? If not, do not extract it.
</critical>

#### Signal strength classification

Every extracted position MUST be classified into one of three signal levels:

| Signal | Definition | Example | Counts toward |
|--------|-----------|---------|---------------|
| **DIRECTIVE** | Source explicitly prescribes or prohibits: uses "always", "must", "should", "never", imperative verbs, or clearly states a convention | "Always call the logger including the exception" | directive count AND mention count |
| **MENTION** | Source lists it as an option, shows it in an example, or describes it without prescribing: "can include", "such as", "for example" | "Essential details can include: stack traces" | mention count only |
| **CONTRADICTION** | Source explicitly argues against the position or prescribes the opposite | "Log only the most critical errors, not every exception" | contradiction count (negative) |

Persist the signal level in `positions_extracted[].signal`: `"directive"`,
`"mention"`, or `"contradiction"`.

### Phase 4: Consensus loop

Cluster normalized candidates by semantic equivalence. For each cluster,
compute THREE agreement metrics:

```
directive_pct    = players_with_DIRECTIVE / total_active_players
mention_pct      = players_with_DIRECTIVE_or_MENTION / total_active_players
contradiction_n  = players_with_CONTRADICTION (absolute count)
```

A cluster qualifies as a rule candidate when ALL three conditions are met:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| **Zero contradictions** | contradiction_n == 0 | Any source arguing against disqualifies the position. Proven across 3 domains: contradicted fragments produce unreliable rules. |
| **Directive floor** | directive_pct >= 50% | At least half the panel explicitly prescribes this. Below 50%, the position is a preference, not a convention. |
| **Combined threshold** | mention_pct >= 80% | Broad agreement including weaker signals. This is the overall consensus bar. |

Classification:
- **Consensus (all 3 met)**: accepted — becomes a rule
- **Borderline (directive >= 50%, mention 60-79%, 0 contradictions)**: user decides
- **Contradicted (any contradiction)**: rejected regardless of agreement %
- **Weak (directive < 50%)**: rejected — not enough explicit prescriptions

If clusters lack consensus, iterate (max 5):

```
IF abs(dominant - runner_up) >= 15%:
    REPLACE up to 3 worst outliers with fresh sources
ELSE (split):
    ADD 3-5 new players without removing any
```

Stop when all clusters >=80% or MAX_ITER reached.

### Phase 5: Score and persist

Compute composite score (0-110) for every player:

| Dimension | Weight | Scale |
|---|---|---|
| Authority | 25 | Tier 1=25, Tier 2=18, Tier 3=10 |
| Information gain | 25 | unique_positions / total × 25 |
| Substance | 20 | min(positions/5, 1) × 20 |
| Recency | 15 | <1yr=15, 1-2yr=12, 2-3yr=8, >3yr=4 |
| Purpose/bias | 15 | neutral=15, mild commercial=10, strong=5 |
| Lateral reading | 10 | strong=10, medium=5, weak=0, negative=REMOVE |

The lateral reading dimension is a bonus (0-10) added after the base
score (0-100). Sources with "negative" lateral signal (active debunking)
are removed from the pool regardless of base score. Sources with "weak"
signal (zero independent citations) are flagged for replacement — they
receive no bonus and are replaced when equivalent content exists from a
source with medium or strong lateral signal.

Apply Bayesian smoothing for new candidates:
`smoothed = (n × observed + 3 × prior) / (n + 3)`.
Break ties lexicographically by URL.

Persist scored registry at `rules/.registry/{topic-slug}.json`. Track
convergence via churn rate (replacements / panel_size). See
`${SKILL_DIR}/references/consented-frontier-players.md` for full registry
schema, audit trail format, score decay mechanics, and pool-and-reselect
algorithm detail.

## Output: Frontier Consensus Report

<output>
```
FRONTIER CONSENSUS REPORT
=========================
Topic:               {description}
Panel size:          {N_PANEL}
Final players:       {N_FINAL}
Iterations:          {I}
Strategy used:       {REPLACE / ADD / MIXED / NONE}
Resolution path:     {SCORED REGISTRY (incremental) / POOL-AND-RESELECT / FULL DISCOVERY}
Run count:           {N}
Churn rate:          {replacements / panel_size}
Convergence:         {CONVERGED (since run X) / NOT YET / RESET (full re-eval)}

Discovery strategy effectiveness:
  Multi-channel:     {N} candidates ({N} exclusive)
  Adversarial:       {N} candidates ({N} exclusive)
  Citation chaining: {N} candidates ({N} exclusive)
  Known-name verify: {N} candidates ({N} exclusive)
  Perspective slots: {filled}/{total} filled

Player roster (sorted by composite score):
#  | Source              | Category       | URL  | Indep. group  | Score | Lateral | Discovery    | Status
---|---------------------|----------------|------|---------------|-------|---------|--------------|--------
1  | {source}            | {category}     | ...  | {group}       | 87    | Strong  | citation     | Kept
...

Lateral reading results:
  Strong: {N} sources (3+ independent citations)
  Medium: {N} sources (1-2 citations)
  Weak:   {N} sources (flagged, {N} replaced)

Replacements this run:
  Removed: {source} (decayed score: {X})
  Added:   {source} (smoothed score: {Y}, observed: {Z})
  Reason:  {rationale}

CONSENSUS POSITIONS ({N}, >= 80% agreement):
  Position                | Agree | Players
  ------------------------|-------|--------
  {label}                 | {%}   | {list}

BORDERLINE POSITIONS ({N}, 60-79% — user decides):
  Position                | Agree | Reason for consideration
  ------------------------|-------|------------------------
  {label}                 | {%}   | {why it matters}

REJECTED POSITIONS ({N}, < 60%):
  Position                | Agree | Why rejected
  ------------------------|-------|-------------
  {label}                 | {%}   | {competing approaches, niche, etc.}
```
</output>
