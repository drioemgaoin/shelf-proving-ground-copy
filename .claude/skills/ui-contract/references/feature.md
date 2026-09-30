# Mode: feature

Input: a spec that adds or changes UI. Output: failing tests, plus a "UI acceptance" section in the spec.

## 1. State inventory

For each UI element the spec touches, list every state: default, hover, focus, active, disabled, loading, empty, error, populated, and any domain states. Agents forget states nobody named.

## 2. Acceptance matrix

One plain line per layer, per element. Skip a layer only if it truly doesn't apply, and say why.

- **Behavior**: each interaction, including keyboard only.
- **Visual** (`@visual`): each state that looks different.
- **Layout** (`@layout`): no horizontal overflow across the width sweep; layout changes at breakpoints.
- **Motion** (`@motion`): which motion token applies; reduced motion means no movement.
- **Accessibility** (`@a11y`): no axe violations; focus moves in, is trapped where needed, returns on close; focus always visible.
- **Stability** (`@stability`): no layout shift beyond the budget in `ui-base.md`.
- **Performance** (`@perf`): only for animations; no long frames beyond the budget.

Show the inventory and matrix to the user. Confirm before writing tests.

## 3. Write and prove red

Write the tests. Run them. Every test must fail because the feature is missing: not a typo, not a crash in setup, not a wrong locator on something that already exists. Screenshot tests fail with a missing-snapshot error: that is expected and fine.

## 4. Record the contract

Add a "UI acceptance" section to the **spec body itself** (not a comment), so to-tickets sees it. Include the state inventory, the matrix, the spec file path, and the list of test names. Add one line: "Each ticket must list the acceptance tests it turns green."
