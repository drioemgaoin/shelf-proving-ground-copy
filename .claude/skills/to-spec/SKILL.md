---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker. Auto-detects spec type (feature, protocol, bug, refactor) and uses the matching template. No interview, just synthesis."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Explore the repo

Understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

### 2. Classify the spec type

Read the conversation context and classify the work into one of four types:

| Type | Signal | Template file |
|---|---|---|
| **Feature** | New user-facing capability. "As a user, I want..." | `references/template-feature.md` |
| **Protocol** | System internals, inter-component contracts, pipelines, state machines, schemas. Multiple components with defined interfaces. | `references/template-protocol.md` |
| **Bug** | Something is broken. Observed vs expected behavior. | `references/template-bug.md` |
| **Refactor** | Restructuring without behavior change. Code quality, architecture, performance. | `references/template-refactor.md` |

**How to distinguish feature from protocol:** If the spec's value is primarily in user stories and implementation decisions, it's a feature. If the spec's value is primarily in component contracts, state machines, record schemas, and edge-case behaviors, it's a protocol. The test: "Would a developer implementing this lose critical information if I removed all tables, schemas, and exit code definitions?" If yes, it's a protocol.

Tell the user which type you chose and why, in one sentence. If they disagree, switch.

### 3. Load the template and tone rules

Read exactly TWO reference files:

1. `references/tone-rules.md` — always loaded
2. The template file matching the classified type from the table above

Do NOT read the other templates. This keeps context focused and prevents cross-template confusion.

### 4. Sketch test seams (feature and protocol only)

Sketch out the seams at which you're going to test the feature or system. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better -- the ideal number is one.

Check with the user that these seams match their expectations.

### 5. Write the spec

Use the loaded template. Follow every section in order. Fill every table -- do not leave placeholder rows. Apply the tone rules from `references/tone-rules.md`.

**Critical for protocol specs:** The "Format Schemas" section captures field-by-field definitions for every structured format that crosses a component boundary. The "Algorithms and Processing Rules" section captures step-by-step procedures for non-obvious logic (parsing, ordering, expansion, detection). These two sections prevent the most common information loss. Do not skip or summarize them.

Then publish to the project issue tracker. Apply the `ready-for-agent` triage label -- no need for additional triage.

### 6. Completeness verification (protocol and feature specs)

After writing the spec content, run these checks before publishing. Each check produces a pass/fail list shown to the user. Fix every failure before proceeding.

**Check 1: Supply-chain trace.** List every data artifact the system consumes (files read, formats parsed, messages received, configs loaded). For each, trace backwards to its producer. Verify:
- If the producer is a component documented in the spec → its output contract specifies the exact format the consumer expects.
- If the producer is an existing skill, command, or workflow NOT documented in the spec → the spec references it and documents the contract surface (output format, location, invariants consumers depend on). It does NOT need the producer's internal workflow.
- If the producer must be built or changed → the spec has a full section (invocation, input, algorithm, output, edge cases).
- If a consumed artifact has no identifiable producer → flag it. Data that appears by magic is unimplementable.

**Check 2: Cross-reference consistency.** For every input a component consumes, verify the producing component's output section specifies the same format, location, and naming convention. For every file path, naming pattern, or prefix convention used in more than one section, verify they match exactly. Mismatches between producer and consumer are implementation bugs waiting to happen.

**Check 3: Template section coverage.** Re-read the loaded template. For each section that has a guardrail instruction (behavioral protocol, enforcement mechanism, entity lifecycle, routing criteria), verify the spec actually addresses it — not just that the section heading exists, but that the guardrail's specific question is answered. List any guardrail that was skipped with the reason.

**Check 4: Actor completeness.** List every actor (human, agent, script, skill) mentioned anywhere in the spec. For each, verify:
- Its behavioral protocol is documented (what it does on success, failure, partial failure, and how it interacts with other components) — OR it is an existing component where only the contract surface is needed.
- Every component it interacts with during execution is identified.

**Check 5: Routing completeness.** List every conditional branch in the execution flow (skip a phase, eligible for a gate, chunk vs single, retry vs escalate). For each, verify the spec states the exact criteria and the data source for the decision.

Present the check results to the user as a table. If all pass, proceed. If any fail, fix the spec first.

### 7. Write the spec to a file

Write the spec to `docs/<spec-slug>.md` in the project root. This file is the canonical spec that downstream tools (spec-gap-hunter, to-tickets) will consume.
