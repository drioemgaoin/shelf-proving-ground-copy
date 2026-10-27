---
paths: src/**/*
---

# UI rules: Shelf

Project-specific UI rules. Universal rules are in `ui-base.md`. Token values live in `src/styles/tokens.css`; this file only names tokens and says when to use them.

Personality: **warm, calm, personal**. Every visual choice supports this.

## Namespace

All tokens use `--shelf-`.

## Token tiers

`src/styles/tokens.css` has three tiers (values flow downward only: primitive → semantic → component). Component CSS uses only the semantic tier.

- **Primitive** (`--shelf-base-*`): raw values, stay in tokens.css. Never reference in component CSS.
- **Semantic** (`--shelf-{role}-*` where role is `fgColor`, `bgColor`, `borderColor`, `borderWidth`, `font`, `space`, `radius`, `shadow`, `z`, `motion`, `focusRing`): role-based tokens. Use these in component CSS.
- **Component** (`--shelf-{component}-*` e.g. `chip`, `skeleton`, `button`): aliases scoped to one component. Only that component’s CSS file uses them.

  CORRECT: `border: var(--shelf-borderWidth-thin) solid var(--shelf-borderColor-default);`
  WRONG: `border: var(--shelf-chip-borderWidth) solid var(--shelf-borderColor-default);` — chip-scoped token used on a non-chip element

  ```enforcement
  id: "semantic-tokens-only"
  tier: T1
  - pattern: "var\\(--shelf-(?!(fgColor-|bgColor-|borderColor-|borderWidth-|font-|space-|radius-|shadow-|z-|motion-|focusRing))"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use a semantic-tier token. Primitive (--shelf-base-*) and component (--shelf-chip-*, --shelf-skeleton-*) tokens stay in tokens.css."
  ```

## Color roles

| Role           | Token                           | Use for                                 |
| -------------- | ------------------------------- | --------------------------------------- |
| Body text      | `--shelf-fgColor-default`       | Most text                               |
| Muted text     | `--shelf-fgColor-muted`         | Secondary info, captions, metadata      |
| Accent text    | `--shelf-fgColor-accent`        | Links, interactive highlights           |
| Text on accent | `--shelf-fgColor-on-accent`     | Text on accent-colored backgrounds      |
| Danger text    | `--shelf-fgColor-danger`        | Errors, destructive action labels       |
| Page surface   | `--shelf-bgColor-default`       | Page background (warm off-white / dark) |
| Raised surface | `--shelf-bgColor-raised`        | Cards, dialogs, drawers                 |
| Accent         | `--shelf-bgColor-accent`        | Primary buttons, selected items         |
| Accent hover   | `--shelf-bgColor-accent-hover`  | Hover state for accent surfaces         |
| Accent active  | `--shelf-bgColor-accent-active` | Pressed state for accent surfaces       |
| Danger         | `--shelf-bgColor-danger`        | Danger buttons                          |
| Overlay        | `--shelf-bgColor-overlay`       | Backdrop behind dialogs and drawers     |
| Border         | `--shelf-borderColor-default`   | Visible borders, dividers               |
| Subtle border  | `--shelf-borderColor-subtle`    | Faint separators                        |

Color modes shipped: **light and dark**. Theme is set via `[data-theme]` attribute on `:root` (values: `light`, `dark`). System preference honored when no explicit theme is set.

## Intent colors

Intent colors represent what data means (status, severity, category), not where it sits on the page. They sit at the semantic tier between surface-role tokens and component tokens. Any component can consume them through component-tier aliases.

| Intent | Token prefix | Use for |
| ------ | ------------ | ------- |
| to-read | `--shelf-intent-to-read-*` | Items queued but not started (warm neutral) |
| reading | `--shelf-intent-reading-*` | Items actively in progress (warm amber) |
| finished | `--shelf-intent-finished-*` | Items completed (muted sage) |

**Token flow:** Primitive → intent (semantic) → component alias.

```
Primitive:  --shelf-base-status-{name}-light / -dark / -light-inv / -dark-inv
Semantic:   --shelf-intent-{name}-bgColor / -fgColor
Component:  --shelf-{comp}-{role}-{name}: var(--shelf-intent-{name}-{role})
```

Component CSS uses only the component-tier alias. Intent tokens are consumed in tokens.css component-tier definitions, never in component CSS directly.

  ```enforcement
  id: "intent-color-for-data-meanings"
  tier: T3
  agent: reviewer
  scope: "src/styles/tokens.css"
  group: tokens
  triage_hint: "Flag when: new component-tier color token added, badge/status/severity/category color defined, data-driven color introduced"
  instruction: "When a component-tier color token represents a data meaning (status, severity, category, priority — anything from a domain enum), check that it aliases an intent-tier token (--shelf-intent-{name}-{role}), not a surface-role token (bgColor-inset, fgColor-muted, bgColor-default). A violation is a component badge/status/indicator color aliased from a surface-role token. Correct: data meanings flow through intent tokens; surface roles describe elevation and placement."
  ```

## Typography

Font: `--shelf-font-family-base` (system humanist sans-serif stack). Size scale: `--shelf-font-size-xs` through `--shelf-font-size-2xl`. Headings use `--shelf-font-weight-semibold` (600). Body uses `--shelf-font-weight-regular` (400). Labels and emphasis use `--shelf-font-weight-medium` (500).

## Spacing, radius, elevation

Spacing scale: `--shelf-space-xs` (4px) through `--shelf-space-2xl` (48px). Layout is spacious — prefer `md` and `lg` for breathing room.

Radius: `--shelf-radius-sm` (4px), `--shelf-radius-md` (8px), `--shelf-radius-lg` (12px), `--shelf-radius-full`. Cards and dialogs use `md`. Buttons use `md`. Pill shapes use `full`.

Shadows: `--shelf-shadow-sm` (subtle lift), `--shelf-shadow-md` (cards), `--shelf-shadow-lg` (dialogs, drawers). Dark mode uses heavier shadows with pure black.

Layer order (lowest to highest): base (0), sticky (100), dropdown (200), drawer (300), dialog (400), toast (500). Use `--shelf-z-*` tokens. Never invent a z-index.

## Focus

All focusable elements use `outline: var(--shelf-focusRing)` with `outline-offset: var(--shelf-focusRing-offset)`. The ring color is terracotta in light mode, lighter terracotta in dark mode.

## Motion

| Token                          | Use for                           |
| ------------------------------ | --------------------------------- |
| `--shelf-motion-duration-fast` | Hover, focus, small state changes |
| `--shelf-motion-duration-base` | Dialogs, drawers, panels entering |
| `--shelf-motion-duration-slow` | Large layout changes (rare)       |
| `--shelf-motion-easing-enter`  | Things appearing                  |
| `--shelf-motion-easing-exit`   | Things leaving                    |

Reduced motion sets all durations to `0ms`.

## Viewports

| Name    | Width | Height |
| ------- | ----- | ------ |
| Mobile  | 375   | 812    |
| Tablet  | 768   | 1024   |
| Desktop | 1280  | 800    |

Breakpoints: 768px (tablet layout), 1024px (desktop layout). Card grid: 1 column on mobile, 2 on tablet, 3+ on desktop.

## Product patterns

- **Toasts**: bottom-center, 4 seconds, auto-dismiss. Used to confirm success (e.g. "Book added").

  ```enforcement
  id: "toast-pattern"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: patterns
  instruction: "When a toast notification is visible, verify it appears at bottom-center of the viewport, auto-dismisses after approximately 4 seconds, and is used only for success confirmations (e.g., 'Book added'). A violation is a toast that appears in any other position, does not auto-dismiss, or is used for errors or warnings. Correct: toast appears bottom-center, disappears after ~4 seconds without user interaction."
  ```

  > **Agent:** `visual-qa` — toast positioning and auto-dismiss timing are visible behaviors that cannot be verified from source code alone.

- **Destructive confirmations**: inline undo via toast, not a confirmation dialog. Toast carries the undo action.

  ```enforcement
  id: "destructive-confirmation-pattern"
  tier: T3
  agent: reviewer
  scope: "src/components/**/*.{ts,tsx}"
  group: patterns
  triage_hint: "Flag when: delete, remove, destroy, confirm, window.confirm, confirmation dialog, modal confirm"
  instruction: "For each destructive action (delete, remove, clear), check that the UI uses an inline undo via toast — not a confirmation dialog or window.confirm(). A violation is any destructive action that shows a confirmation dialog before executing. Correct: the action executes immediately and a toast with an undo button appears, allowing the user to reverse it."
  ```

  > **Agent:** `reviewer` — the violation is a code pattern (confirm dialog vs toast undo); it is detectable in source by looking for confirm modals or window.confirm on destructive handlers.

- **Form validation**: validate on blur and on submit. Error text below the field, uses `--shelf-fgColor-danger`.

  ```enforcement
  id: "form-validation-pattern"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: patterns
  instruction: "For each form field, verify that validation runs on blur (tab away from an invalid field shows error) and on submit (submitting with invalid fields shows all errors). Error text must appear below the field, not above or inline. A violation is a form that only validates on submit, only on blur, shows errors in the wrong position, or shows no error for invalid input. Correct: blur triggers per-field validation, submit triggers full-form validation, error text renders directly below its field."
  ```

  > **Agent:** `visual-qa` — validation timing (blur vs submit) and error text positioning are runtime behaviors visible in rendered output; code review alone cannot verify when errors appear.

- **Drawer**: slides from right on desktop, from bottom on mobile. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`. Backdrop uses `--shelf-bgColor-overlay`.

  ```enforcement
  id: "drawer-slide-direction"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: patterns
  instruction: "Open the drawer on desktop (>=1024px) and verify it slides in from the right edge. Open the drawer on mobile (<768px) and verify it slides up from the bottom as a bottom sheet. A violation is a drawer that slides from the wrong direction for the viewport, or appears without a slide animation. Correct: desktop drawer enters from the right, mobile drawer enters from the bottom."
  ```

  > **Agent:** `visual-qa` — slide direction is a visual behavior that requires rendering at different viewports; code review cannot verify the perceived animation direction.

- **Dialog**: centered, focus-trapped, Escape closes. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`.

  ```enforcement
  id: "dialog-pattern"
  tier: T3
  agent: visual-qa
  scope: "*"
  group: patterns
  instruction: "When a dialog is open, verify it is visually centered both horizontally and vertically in the viewport. A violation is a dialog that is off-center, aligned to an edge, or positioned inconsistently across viewports. Correct: the dialog is centered in the viewport on all screen sizes."
  ```

  > **Agent:** `visual-qa` — visual centering requires rendered output; the focus-trap and Escape-close behavior are covered by the focus-management T2 block.

## Syntax

- Class selectors use kebab-case: `.chip-bar`, `.card-title`, `.skeleton-pill`. The linter enforces `selector-class-pattern` (kebab-case only).

  CORRECT: `.card-title { }`
  WRONG: `.card__title { }` — BEM `__` and `--` separators are not used

  ```enforcement
  id: "no-bem-separators"
  tier: T1
  tool: selector-class-pattern
  - pattern: "\\.[a-z][a-z0-9]*__"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use kebab-case: .card-title not .card__title"
  - pattern: "\\.[a-z][a-z0-9]*--"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use kebab-case: .card-skeleton not .card--skeleton"
  ```

- Media queries use range notation: `@media (width >= 768px)`. The linter enforces `media-feature-range-notation` (modern range syntax).

  CORRECT: `@media (width >= 768px) { }`
  WRONG: `@media (min-width: 768px) { }`

  ```enforcement
  id: "media-range-notation"
  tier: T1
  tool: media-feature-range-notation
  - pattern: "\\((min|max)-(width|height)\\s*:"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use range notation: @media (width >= 768px) not @media (min-width: 768px)"
  ```

## Vocabulary

UI text uses `GLOSSARY.md` terms once it exists. Never use a term it lists under "Avoid".
