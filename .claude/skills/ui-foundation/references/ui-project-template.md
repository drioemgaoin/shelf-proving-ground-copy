---
paths: src/**/*
---

# UI rules: <project name>

Project-specific UI rules. Universal rules are in `ui-base.md`. Token values live in `src/styles/tokens.css`; this file only names tokens and says when to use them.

## Namespace

All tokens use `--<ns>-`.

## Color roles

| Role | Token | Use for |
|---|---|---|
| Body text | `--<ns>-fgColor-default` | Most text |
| Muted text | `--<ns>-fgColor-muted` | Secondary info, captions |
| Danger | `--<ns>-fgColor-danger` | Errors, destructive actions |
| Surface | `--<ns>-bgColor-default` | Page background |
| Raised surface | `--<ns>-bgColor-raised` | Cards, dialogs, drawers |
| Accent | `--<ns>-bgColor-accent` | Primary buttons, selected items |

Color modes shipped: <light | light and dark>.

## Typography

Font: `--<ns>-font-family-base`. Size scale: `--<ns>-font-size-*`. <Any usage rules, e.g. "headings use weight 600">.

## Spacing, radius, elevation

Spacing scale: `--<ns>-space-*`. Radius: `--<ns>-radius-*`. Shadows: `--<ns>-shadow-*`.
Layer order (lowest to highest): base, sticky, dropdown, drawer, dialog, toast.

## Motion

| Token | Use for |
|---|---|
| `--<ns>-motion-duration-fast` | Hover, small state changes |
| `--<ns>-motion-duration-base` | Dialogs, drawers, panels entering |
| `--<ns>-motion-duration-slow` | Large layout changes (rare) |
| `--<ns>-motion-easing-enter` | Things appearing |
| `--<ns>-motion-easing-exit` | Things leaving |

## Viewports

<Copy the matrix from e2e/support/viewports.ts, plus any breakpoints the layout uses.>

## Product patterns

- Toasts: <position, duration, when to use>.
- Confirmations: <dialog or inline undo>.
- Forms: <when validation runs, where errors show>.

## Vocabulary

UI text uses `GLOSSARY.md` terms. Never use a term it lists under "Avoid".
