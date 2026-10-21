# Feature Spec Template

Use this for new user-facing capabilities.

## Sections

### Problem Statement

The problem the user is facing, from the user's perspective.

### Solution

The solution to the problem, from the user's perspective.

### User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

This list should be extremely extensive and cover all aspects of the feature.

### Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

**Entity lifecycle.** For every entity the feature manages (items, records, configurations — anything with identity that persists), list all lifecycle operations (create, read, update, delete, plus domain-specific ops). If an operation is not supported, say so explicitly.

**State enforcement.** For every state that affects UI or system behavior, document the enforcement mechanism: what component reads the state and what it does differently based on the value. A state without enforcement is a label, not behavior.

**Routing and conditional behavior.** For every conditional branch in the feature's behavior (show/hide UI, enable/disable action, filter/sort), document the exact criteria and where the decision data comes from.

### Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

### Out of Scope

A description of the things that are out of scope for this spec.

### Further Notes

Any further notes about the feature.
