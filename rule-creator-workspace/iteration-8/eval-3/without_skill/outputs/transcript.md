# Transcript: Adding Enforcement Blocks to frontend-standards.md

## Task

Add enforcement blocks to all 15 rules in `.claude/rules/frontend-standards.md`.

## Approach

I read the input file and identified 15 rules across 5 sections:

### Code Style (3 rules)
1. **No `as any` type assertions** - Enforcement: grep for `as any`, rewrite with type narrowing or generics.
2. **No `export default`** - Enforcement: grep for `export default`, convert to named exports.
3. **No nested ternary expressions** - Enforcement: grep for nested ternaries, refactor to variables/if-else.

### CSS (3 rules)
4. **All values from design tokens** - Enforcement: grep for hardcoded `px`, `rem`, hex, `rgb()` in component stylesheets; replace with tokens. Exception for `tokens.css`.
5. **Animations use only `transform` and `opacity`** - Enforcement: inspect animation/transition properties; rewrite non-compliant ones.
6. **No raw `z-index` values** - Enforcement: grep for `z-index:` with numeric literals; replace with layer tokens.

### Accessibility (3 rules)
7. **All images have alt text** - Enforcement: verify every `<img>` has an `alt` attribute.
8. **Color alone does not convey meaning** - Enforcement: verify non-color cues accompany color-based state indicators.
9. **Tab order follows visual reading order** - Enforcement: grep for positive `tabindex` values; reorder DOM instead.

### Performance (3 rules)
10. **No synchronous `localStorage` reads in render paths** - Enforcement: grep for `localStorage` in render paths; move to effects/handlers.
11. **Images use correct `loading` attribute** - Enforcement: verify `loading="eager"` above fold, `loading="lazy"` below.
12. **Bundle size under 200kb gzipped per route** - Enforcement: check build output; code-split if over limit.

### Architecture (3 rules)
13. **Business logic in hooks/utilities, not render functions** - Enforcement: extract business logic from component bodies into hooks/utilities.
14. **Single responsibility principle for components** - Enforcement: split multi-concern components into focused children.
15. **Side effects isolated in custom hooks** - Enforcement: extract side effects from event handlers into custom hooks.

## Enforcement Block Structure

Each enforcement block follows a consistent three-part pattern:
1. **When** - The trigger condition (when writing/modifying relevant code)
2. **If found** - The corrective action to take
3. **Do not merge** - The gate condition preventing completion while violations exist

## Output

- `frontend-standards.md` - The complete file with all 15 enforcement blocks added
- `transcript.md` - This file documenting the reasoning
