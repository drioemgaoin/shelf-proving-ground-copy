# Bug Spec Template

Use this for defect reports where something is broken.

## Sections

### Observed Behavior

What actually happens. Include exact error messages, screenshots, logs. Be specific: "clicking X produces Y" not "it doesn't work."

### Expected Behavior

What should happen instead, referencing the spec or user story that defines the correct behavior.

### Reproduction Steps

Numbered steps to reproduce the bug. Include:

1. Starting state (fixture, URL, data)
2. Each action in sequence
3. The point where behavior diverges from expected

### Environment

- Browser / OS / device (if relevant)
- Fixture or data state
- Any feature flags or config

### Root Cause Analysis

If known: what is causing the bug. If unknown, say so -- do not speculate.

### Proposed Fix

The fix approach, stated as a behavior change: "The component should X when Y" not "change line 42."

### Regression Risk

What else could break when this is fixed. Which tests cover the affected area.

### Testing Decisions

- How to verify the fix (acceptance criteria)
- What regression test to add
- Which existing tests to check still pass

### Out of Scope

Related issues that this fix intentionally does NOT address.
