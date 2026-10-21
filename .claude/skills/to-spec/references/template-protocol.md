# Protocol Spec Template

Use this for system internals, pipelines, inter-component contracts, state machines. The sections below capture the information that a developer CANNOT safely guess -- contracts, schemas, states, edge cases.

## Sections

### Problem Statement

The problem this system solves. Name the failure modes it prevents.

### Solution Overview

One paragraph: what the system does, end to end. Name every component and how they connect.

### Key Concepts

Define every term, component, and agent that appears in the spec. Use a table:

| Term | Definition |
|---|---|
| ... | ... |

### Components and Contracts

For each component in the system, a subsection. **Include every component that produces or consumes data in the system** — runtime scripts, skills, commands, agents. If a component already exists and works, document only its contract surface (output format, interaction points, invariants downstream consumers depend on). If it must be built or changed, document the full behavioral protocol.

#### <Component Name>

**Purpose:** one sentence.

**Invocation:** how it is called (hook, script, agent prompt, cron).

**Input contract:**

| Field | Type | Required | Description |
|---|---|---|---|
| ... | ... | ... | ... |

**Output contract:**

| Output | Format | Description |
|---|---|---|
| ... | ... | ... |

**Exit codes / return values:**

| Code | Meaning | Caller action |
|---|---|---|
| ... | ... | ... |

**Behavioral protocol (for agents/actors):** For each agent or actor that interacts with multiple components during execution, document what it does on success, on failure, on partial failure, and how it interacts with every other component it touches. A component contract says what goes in and what comes out. A behavioral protocol says what happens between those two points — commit strategy, retry rules, interaction with hooks/guards, cleanup on interruption.

**Edge cases:**

- What happens on malformed input
- What happens on timeout
- What happens on empty input
- What happens on crash/restart

#### <Next Component>

...

### Format Schemas

For each structured format the system defines or consumes -- enforcement block fields, message formats, report formats, command-line schemas -- document the exact field-by-field structure.

#### <Format Name> (e.g., "T1 enforcement block", "Finding report", "Rejection message")

**Purpose:** what this format carries and who produces/consumes it.

**Fields:**

| Field | Type | Required | Valid values | Default | Description |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

**Parsing rules:**

- How fields are delimited or structured
- How optional vs required fields are distinguished
- How malformed entries are detected

**Example:**

```
(a concrete, complete example of a valid instance)
```

**Validation rules:**

- What makes an instance valid vs malformed
- How the consumer rejects invalid instances

Repeat for each format. Cover every format that crosses a component boundary -- if component A produces it and component B consumes it, it needs a schema here.

### State Machines

For each stateful entity, define:

#### <Entity> lifecycle

**States:**

| State | Meaning | Entry condition |
|---|---|---|
| ... | ... | ... |

**Transitions:**

| From | To | Trigger | Side effects |
|---|---|---|---|
| ... | ... | ... | ... |

**Invariants:** rules that must hold across all transitions.

**Atomicity:** which operations are atomic and which authority resolves conflicts.

**Enforcement mechanism:** For every state that affects system behavior (not just record-keeping), document what component reads the state, when it reads it, and what it does differently based on the value. A state without an enforcement mechanism is documentation, not behavior.

### Entity Lifecycle Operations

For every entity the system manages (rules, tickets, configurations, findings — anything with identity that persists across operations), document all lifecycle operations. If an operation is not supported, say so explicitly.

| Operation | Supported | Component | Notes |
|---|---|---|---|
| Create | ... | ... | ... |
| Read | ... | ... | ... |
| Update | ... | ... | ... |
| Delete | ... | ... | ... |
| <Domain-specific op> | ... | ... | ... |

Include domain-specific operations (promote, demote, settle, un-settle, re-queue) alongside CRUD. For each supported operation, the relevant component section must document its contract.

### Record Schemas

For each data format the system reads or writes to persistent storage:

#### <Schema Name>

**Format:** JSON / JSONL / YAML / Markdown

**Location:** where this file lives (relative to project root)

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| ... | ... | ... | ... |

**Example:**

```json
{ ... }
```

### Algorithms and Processing Rules

For each non-obvious algorithm or processing sequence -- parsing, ordering, expansion, detection, resolution -- document the step-by-step procedure.

#### <Algorithm Name> (e.g., "Multi-tier block parsing", "Finding processing order", "Variable expansion")

**Purpose:** what this algorithm does and which component(s) use it.

**Input:** what the algorithm receives.

**Steps:**

1. First step (be specific: "match only at column 0" not "look for separators")
2. Second step
3. ...

**Output:** what the algorithm produces.

**Edge cases:**

| Condition | Behavior |
|---|---|
| ... | ... |

Repeat for each algorithm. The test: if a developer would need to guess the ordering, matching rule, or fallback behavior, it needs an entry here.

### Pipeline / Execution Flow

The end-to-end execution sequence. Use a numbered list or phase diagram. For each phase:

1. **Phase N: <Name>** -- what happens, which components run, what gates exist, iteration limits, escalation conditions.

**Routing criteria.** For every conditional branch in the flow (skip a phase, eligible for a gate, chunk vs single payload), document the exact criteria and where/when the decision is made. If the criteria depend on labels, metadata, or state from a prior phase, trace the data source. An implementer must never have to guess how entities are routed between phases.

### Budget and Limits

Every numerical constraint in the system:

| Limit | Value | Rationale |
|---|---|---|
| ... | ... | ... |

### Configuration

| Key | Default | Valid values | On invalid |
|---|---|---|---|
| ... | ... | ... | ... |

What happens when the config file is missing. What happens when it contains invalid data.

### Error Handling and Escalation

For each error/escalation type:

| Trigger | Escalation type | Action | Who resolves |
|---|---|---|---|
| ... | ... | ... | ... |

### Testing Decisions

How to test each component. Include:

- Seam locations (where tests inject/intercept)
- What makes a good test for this system
- Edge cases that MUST be covered
- Prior art in the codebase

### Out of Scope

What this system explicitly does NOT do.

### Open Questions

Any genuinely unresolved decisions. Do not hedge -- list them explicitly.
