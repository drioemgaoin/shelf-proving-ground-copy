# Proposed change to `no-outer-margin` in ui-base.md

## What changes

1. **Scope widened** from `src/components/**/*.css` to `src/**/*.css` (exclude tokens)
2. **T3 instruction refined** to carve out flex/grid auto-margin for internal space distribution
3. **Rule text updated** — "children" not just "components"

## Current rule (replace this)

```markdown
- Components own no space outside themselves. Spacing between components is the parent's job.

  ```enforcement
  id: "no-outer-margin"
  tier: T1
  - pattern: "margin(-inline|-block|-top|-right|-bottom|-left)?\\s*:"
    assert: absent
    scope: "src/components/**/*.css"
    fix: "Components must not set margin on their own root. The parent layout owns spacing via gap or padding."
  ---
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.css"
  group: layout
  triage_hint: "Flag when: margin property appears in component CSS, new component root selector added"
  instruction: "Scan component root selectors in the diff for margin properties. A violation is a component setting margin on its own root element — the parent layout owns spacing via gap or padding. Correct: components have zero margin on their root; parents use gap, padding, or wrapper margin to space children."
  ```
```

## Proposed rule (replace with this)

```markdown
- Children own no space outside themselves. Spacing and positioning between siblings is the parent's job — via gap, padding, or a shared container constraint. A child setting margin positions itself independently from its siblings, causing alignment drift when siblings don't match.

  CORRECT: Container owns centering — all children align:
  ```css
  .page { max-width: 80rem; margin-inline: auto; }
  .toolbar { /* inherits constraint from .page */ }
  .grid    { /* inherits constraint from .page */ }
  ```

  WRONG: One child centered, sibling unconstrained — left edges diverge at wide viewports:
  ```css
  .grid    { max-width: 80rem; margin-inline: auto; }
  .toolbar { /* no constraint — stretches full parent width */ }
  ```

  CORRECT: Flex auto-margin for internal space distribution (not external spacing):
  ```css
  .badge { margin-block-start: auto; } /* pushes to bottom of flex column — this is layout within the parent */
  ```

  WRONG: List reset via margin on child (belongs in @layer base):
  ```css
  .my-list { margin-block: 0; padding: 0; }
  ```

  ```enforcement
  id: "no-outer-margin"
  tier: T1
  - pattern: "margin(-inline|-block|-top|-right|-bottom|-left)?\\s*:"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Children must not set margin. The parent layout owns spacing (gap, padding) and positioning (max-width + centering on a container). Move margin to the parent or a shared wrapper. For list/element resets (margin: 0), move to @layer base in tokens.css."
  ---
  id: "no-outer-margin"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: layout
  triage_hint: "Flag when: margin property appears in any CSS, new selector with margin, max-width + margin-inline: auto on a child"
  instruction: "Scan all selectors in the diff for margin properties. A violation is any element setting margin to own space outside itself — the parent layout owns spacing and positioning. Two exceptions are NOT violations: (1) flex/grid auto-margin for internal space distribution (e.g., margin-block-start: auto to push a badge to the bottom of a flex column — this is a layout mechanism within the parent's context, not external spacing), (2) margin declarations inside @layer base (element resets). Everything else is a violation: margin for spacing between siblings, margin-inline: auto for self-centering, margin-block: 0 for list resets outside the base layer. Correct: parents use gap and padding for spacing; containers use max-width + centering for width constraints; children set zero margin."
  ```

  > **Agent:** `reviewer` — catches margin patterns beyond the T1 regex set (e.g., margin via shorthand, inherited margin, or margin in utility classes) and distinguishes legitimate flex auto-margin from external spacing.
```

## Why this is wider than a new alignment-drift rule

| Bug class prevented | Original `no-outer-margin` | Widened `no-outer-margin` |
|---|---|---|
| Component self-spacing | ✓ (components/ only) | ✓ (everywhere) |
| Sibling alignment drift (this bug) | ✗ (scope too narrow) | ✓ |
| List resets outside base layer | ✗ | ✓ |
| Child self-centering | ✗ | ✓ |
| Inconsistent max-width on siblings | ✗ | ✓ (because the centering margin gets caught) |

One scope change, zero new rules. The principle was already right — "children don't own their positioning." It just wasn't enforced everywhere.
