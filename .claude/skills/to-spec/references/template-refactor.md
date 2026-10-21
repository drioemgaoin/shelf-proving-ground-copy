# Refactor Spec Template

Use this for restructuring without behavior change.

## Sections

### Current State

What the code looks like today. Name the modules, the patterns, the pain points. Concrete: "Module X has 3 responsibilities" not "the code is messy."

### Problem

Why the current state is insufficient. What concrete harm it causes:

- Bugs it enables
- Features it blocks
- Maintenance cost it imposes
- Performance impact (with numbers if available)

### Target State

What the code should look like after the refactor. Same level of concreteness as Current State.

### Migration Strategy

How to get from current to target without breaking anything:

- **Expand:** add the new form beside the old
- **Migrate:** move consumers in batches (define batch boundaries)
- **Contract:** remove the old form

For each step: what is the verifiable checkpoint? How do you know it's safe to proceed?

### Invariants

Behaviors that MUST NOT change during the refactor. Be exhaustive -- these become your regression tests.

### Testing Decisions

- How to verify behavior is preserved (not just "tests pass" -- which specific behaviors)
- What new tests to add for the target state
- How to detect accidental behavior changes

### Rollback Plan

If the refactor goes wrong mid-way, how to get back to a working state.

### Out of Scope

What this refactor intentionally does NOT touch, even if related.
