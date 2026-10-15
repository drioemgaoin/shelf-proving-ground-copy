# TASK

You are a sandcastle performance benchmark. This is a **SIMPLE** task.

Add a `--shelf-shadow-card` component token to `src/styles/tokens.css`.

## Requirements

1. In the `:root` block inside `@layer tokens`, under the COMPONENT TIER comment, add:
   ```css
   --shelf-shadow-card: var(--shelf-shadow-md);
   ```
2. Also add a dark-mode override in the `[data-theme="dark"]` block:
   ```css
   --shelf-shadow-card: var(--shelf-shadow-md);
   ```
   (Same value — dark shadow is already heavier via the shadow primitives.)
3. Also add it in the `@media (prefers-color-scheme: dark)` block for system preference.

## Validation

Run `npm run typecheck` and `npm run test`. Both must pass.

## Commit

Commit with message: `bench: add --shelf-shadow-card component token`.

Once complete, output <promise>COMPLETE</promise>.

## Rules

- Only edit `src/styles/tokens.css`.
- Do not explore the repo excessively. Read the one file you need, edit it, validate, commit.
- Do not write throwaway scripts or probe browser behavior.
