---
paths: src/**/*
---

# UI rules: Shelf

Project-specific UI rules. Universal rules are in `ui-base.md`. Token values live in `src/styles/tokens.css`; this file only names tokens and says when to use them.

Personality: **warm, calm, personal**. Every visual choice supports this.

## Namespace

All tokens use `--shelf-`.

## Color roles

| Role | Token | Use for |
|---|---|---|
| Body text | `--shelf-fgColor-default` | Most text |
| Muted text | `--shelf-fgColor-muted` | Secondary info, captions, metadata |
| Accent text | `--shelf-fgColor-accent` | Links, interactive highlights |
| Text on accent | `--shelf-fgColor-on-accent` | Text on accent-colored backgrounds |
| Danger text | `--shelf-fgColor-danger` | Errors, destructive action labels |
| Page surface | `--shelf-bgColor-default` | Page background (warm off-white / dark) |
| Raised surface | `--shelf-bgColor-raised` | Cards, dialogs, drawers |
| Accent | `--shelf-bgColor-accent` | Primary buttons, selected items |
| Accent hover | `--shelf-bgColor-accent-hover` | Hover state for accent surfaces |
| Accent active | `--shelf-bgColor-accent-active` | Pressed state for accent surfaces |
| Danger | `--shelf-bgColor-danger` | Danger buttons |
| Overlay | `--shelf-bgColor-overlay` | Backdrop behind dialogs and drawers |
| Border | `--shelf-borderColor-default` | Visible borders, dividers |
| Subtle border | `--shelf-borderColor-subtle` | Faint separators |

Color modes shipped: **light and dark**. Theme is set via `[data-theme]` attribute on `:root` (values: `light`, `dark`). System preference honored when no explicit theme is set.

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

| Token | Use for |
|---|---|
| `--shelf-motion-duration-fast` | Hover, focus, small state changes |
| `--shelf-motion-duration-base` | Dialogs, drawers, panels entering |
| `--shelf-motion-duration-slow` | Large layout changes (rare) |
| `--shelf-motion-easing-enter` | Things appearing |
| `--shelf-motion-easing-exit` | Things leaving |

Reduced motion sets all durations to `0ms`.

## Viewports

| Name | Width | Height |
|---|---|---|
| Mobile | 375 | 812 |
| Tablet | 768 | 1024 |
| Desktop | 1280 | 800 |

Breakpoints: 768px (tablet layout), 1024px (desktop layout). Card grid: 1 column on mobile, 2 on tablet, 3+ on desktop.

## Product patterns

- **Toasts**: bottom-center, 4 seconds, auto-dismiss. Used to confirm success (e.g. "Book added").
- **Destructive confirmations**: inline undo via toast, not a confirmation dialog. Toast carries the undo action.
- **Form validation**: validate on blur and on submit. Error text below the field, uses `--shelf-fgColor-danger`.
- **Drawer**: slides from right on desktop, from bottom on mobile. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`. Backdrop uses `--shelf-bgColor-overlay`.
- **Dialog**: centered, focus-trapped, Escape closes. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`.

## Vocabulary

UI text uses `GLOSSARY.md` terms once it exists. Never use a term it lists under "Avoid".
