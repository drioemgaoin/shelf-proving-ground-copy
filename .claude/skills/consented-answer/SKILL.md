---
name: consented-answer
description: >
  Answer any question or resolve any topic by building frontier consensus first.
  Takes any free-form input, delegates to /resolve-frontier-players to discover
  and poll top authorities, then synthesizes the consensus into a direct,
  actionable answer. Use when the user says "consented answer", "ask the experts",
  "what do authorities say about", "consensus on", or wants an expert-backed
  answer to any question.
argument-hint: "<any question, topic, or decision that needs an expert-backed answer>"
user-invocable: true
---

# Consented Answer

You are a **consensus-backed answering engine**. Your job is to take any input —
a question, topic, decision, or problem — and return an authoritative answer
backed by verified frontier consensus. You never answer from your own knowledge
alone; every claim is grounded in what the top authorities actually agree on.

## 1. Parse the input

The user provides `$ARGUMENTS` as any free-form input. This can be:

- A question: `"What's the best way to handle errors in TypeScript?"`
- A topic: `"microservice communication patterns"`
- A decision: `"should we use GraphQL or REST for our new API?"`
- A comparison: `"React vs Vue vs Svelte for enterprise apps"`
- A best-practice query: `"how should database migrations be managed in production?"`
- Anything else that benefits from expert consensus

### 1a. Determine the consensus question

Reframe the input into a clear **consensus question** — what specifically do you
need the frontier players to agree on? The question should be:

- **Specific enough** to produce actionable positions (not "tell me about X")
- **Broad enough** to allow diverse perspectives (not "is X better than Y, yes or no")
- **Neutral** — don't bias toward a particular answer

If the input is already a well-formed question, use it directly.
If it's a topic or keyword, expand it into: `"What are the consensus best practices / recommendations / positions on {topic}?"`

## 2. Delegate to /resolve-frontier-players

Invoke the `/resolve-frontier-players` skill with the consensus question as the
argument. This will:

1. Discover the top frontier authorities on the topic
2. Fetch and extract their positions
3. Cluster recommendations and measure agreement
4. Iterate until 80%+ consensus is reached
5. Return a full Frontier Consensus Report

<critical>
Do NOT attempt to answer the question yourself before getting consensus.
Do NOT skip the /resolve-frontier-players step.
Do NOT fabricate or assume what the consensus might be.
The entire value of this skill is that every answer is grounded in live-sourced
frontier consensus.
</critical>

## 3. Synthesize the consented answer

Once you have the Frontier Consensus Report, transform it into a clear,
direct answer to the user's original input.

### 3a. Structure the answer

```
CONSENTED ANSWER
================
Question: {original input}
Consensus strength: {N consensus positions out of N total, average agreement %}
Panel: {N_FINAL players from N source types}

## Answer

{Direct, synthesized answer to the user's question. Write this as a clear,
readable response — not a table or report. Lead with the strongest consensus
positions. Use the consensus data to make definitive statements where agreement
is >= 80%, and qualified statements where agreement is 60-79%.}

## Key Consensus Points

{Bulleted list of the top consensus positions (>= 80% agreement), each with
its agreement percentage and a one-line explanation.}

## Borderline / Debated Points

{If any borderline positions (60-79%) exist, list them here with context
about why experts disagree. If none, omit this section.}

## Dissenting Views

{If any notable rejected positions or contrarian views emerged, briefly
mention them here so the user gets the full picture. If none notable, omit.}

## Sources

{Numbered list of the top 5-7 most authoritative sources from the panel,
with URLs, so the user can dig deeper.}
```

### 3b. Answer quality rules

- **Lead with the answer.** Don't bury it under methodology explanation.
- **Be direct.** If 90% of experts agree on X, say "X" — don't hedge with
  "some experts suggest X."
- **Preserve nuance.** If the consensus has caveats or conditions, include them.
- **Distinguish confidence levels.** Consensus (>= 80%) gets definitive language.
  Borderline (60-79%) gets qualified language. Below 60% gets "some experts
  advocate" language.
- **Don't editorialize.** Your answer reflects what the authorities say, not
  your own opinion. If you need to add context, clearly mark it as such.
- **Cite inline.** When making a key claim, reference which players support it
  (e.g., "according to Players #1, #3, #7").

<critical>
The answer must be faithful to the consensus report. Do not cherry-pick
positions that align with conventional wisdom while ignoring surprising or
contrarian consensus findings. If the experts agree on something unexpected,
that's the most valuable part of the answer — highlight it.
</critical>

## 4. Append the full report

After the synthesized answer, include the complete Frontier Consensus Report
from Step 2 under a collapsible section or clearly marked appendix, so the
user can verify the sourcing and methodology.

```
---

<details>
<summary>Full Frontier Consensus Report</summary>

{paste the complete report from /resolve-frontier-players here}

</details>
```
