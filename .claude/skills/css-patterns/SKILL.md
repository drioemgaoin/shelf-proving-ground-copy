---
name: css-patterns
description: Mandatory styling patterns for CSS, design tokens, theming, and any tool that generates styles. Use this skill whenever the task touches a stylesheet, a design token, a theme or dark mode, a component's visual styling, a Tailwind or CSS-in-JS setup, a design system, or a generator like brand-builder that emits styles — even when the user does not say "CSS". Also use it when reviewing a diff that changes any .css/.scss/.module.css file, when naming custom properties, when deciding where spacing lives, or when a specificity or !important fight appears. Load this before writing a single declaration.
---

# Styling patterns

These seven patterns are mandatory. Every stylesheet, token file, and component style you write, edit, or review must follow all seven. Violating a pattern without stating why in your response is a failure.

Each pattern names its **decidable test** — a question answerable from the diff alone, with no judgement. If you cannot answer the test, you do not understand the change well enough to make it.

Each pattern names its **gate** — the command that fails the build. A pattern without a gate is a suggestion. Agents and humans imitate the codebase, not the document; staleness in prose is invisible, staleness in a gate is a red build.

---

1. **One declaration per class, deduplicated at build time.** This is the only pattern with a measured scaling curve behind it, and it is the only one that buys scale. A class holds one declaration. The build deduplicates. CSS size then plateaus as the product grows instead of climbing with feature count. This pattern is agnostic about authoring style: utility-first, atomic CSS-in-JS with static extraction, and hand-authored single-purpose classes all satisfy it. What violates it is a multi-declaration class copied across the codebase, and any styling that reaches the browser without a dedup pass. *Decidable test: does the gzipped CSS grow in step with component count?* *Gate: `check-css-budget.mjs`.*

2. **No styling at a distance.** A style is applied directly, by a class, to the element it targets. Observe an ancestor's state; never style from a distance. This is what makes deletion safe, and deletion safety is what "maintainable" means once nobody can hold the codebase in their head. Banned: `#id` selectors, element selectors outside `base`, descendant and child chains (`.card > div > span`), sibling combinators used to space things, `*` selectors outside `reset`, and any rule that changes an element the file does not own. *Decidable test: if I delete this file, can anything outside it change appearance?* *Gate: `selector-max-id`, `selector-max-compound-selectors`, `selector-max-combinators`, `selector-max-specificity`, `max-nesting-depth`.*

3. **Values come from tokens. Three tiers, one direction.** Primitive holds the raw value (`--acme-base-blue-5`). Semantic assigns the role (`--acme-fgColor-danger`). Component binds a role to a place (`--acme-button-danger-bgColor-rest`). Values flow downward only: component references semantic, semantic references primitive. Components never read primitives. Component tokens never hold literals. Primitives never respect colour mode. Private component tokens are not consumable from outside the component that owns them. **Enable enforcement one property group at a time, colour first.** A property group joins the gate only when the token tier can answer every question the linter will ask — enabling spacing before the spacing scale exists makes agents invent token names, which is strictly worse than a hex code, because a wrong hex is visible and a phantom token silently resolves to nothing. *Decidable test: does every value in this rule resolve to a token, and does every token resolve?* *Gate: `declaration-strict-value` (literals) plus `value-no-unknown-custom-properties` (phantoms) — both, or neither works. Plus `check-styles.mjs` token-flow.*

4. **Namespace the design system, never the rendering library.** The prefix names the system and its only job is collision avoidance: `--acme-`, `--p-`, `--md-sys-` are correct. `--mui-`, `--mat-`, `--mdc-`, `--tw-`, `--chakra-`, `--bs-`, `--antd-` are not — they name whatever library paints the pixels this year, and they turn a rebrand into a migration. Within the namespace, the name describes role, not value: `--acme-fgColor-danger`, not `--acme-color-red-600`. Numeric suffixes belong at the primitive tier only, where they encode a position on a scale. A token name that could not survive replacing the rendering library is a leak, not a token. *Decidable test: swap React for Svelte. Does any token name become a lie?* *Gate: `custom-property-pattern` regex, plus `check-styles.mjs` namespace.*

5. **Mode is data. The resolved set is complete; the source is a diff.** Two modes is the floor, not the ceiling — plan for light, dark, dimmed, high-contrast, forced-colors, and colour-vision variants. Large systems ship nine. The *compiled* token set is complete for every mode: a semantic token undefined in one mode is a bug, not a fallback. The *authored* source is a diff: a mode declares only its overrides against base. Do not confuse the two and do not hand-maintain a copy per mode. Modes swap token values at the root under `[data-theme]` and `prefers-color-scheme`. Component CSS is byte-identical across every mode. Before writing a single override, invert the light and dark primitive scales so light starts at white and dark starts at black — most semantic tokens then need no override at all. Prefer eliminating overrides to policing them. `light-dark()` handles exactly two modes; use `[data-theme]` for the rest. Banned: `.dark .card`, a mode check inside a component, a second stylesheet per theme. *Decidable test: can I add a tenth mode without opening a component file?* *Gate: `check-styles.mjs` mode-parity.*

6. **The cascade is declared, not discovered.** Declare the order once, before any rule exists: `foundation, tokens, base, layout, components, utilities`. Two facts that most style guides get backwards, and that you must not get backwards: **unlayered styles beat every layered style**, so there is no "overrides" layer that wins; and **`!important` inverts layer order**, so an `!important` in the last layer is the weakest important available and in the first layer it is the strongest. Therefore immutable values live in `foundation` and may use `!important`; true escape hatches live *unlayered* and are reviewed one at a time. Never build an `overrides` layer and expect it to win — it loses to plain unlayered CSS. `@layer` degrades by being ignored, which silently changes your cascade rather than loudly breaking it, so decide whether that matters for your baseline before you rely on layer order for correctness. *Decidable test: name the layer this rule lives in, and the rule it is allowed to override.* *Gate: `declaration-no-important` outside `foundation`, plus a CI check that every stylesheet is imported into a declared layer.*

7. **A component owns no space outside itself.** No `margin` on the root box, except `0`. No `padding` on the root unless the root paints a border or background for the padding to sit inside — without a visible boundary, outer padding is margin wearing a hat. No fixed `width` or `height` on the root. Internal margins are fine. Spacing *between* components is the parent's job, expressed with `gap` or a layout primitive from a closed set: Stack, Cluster, Grid, Sidebar, Center, Frame. Compositional layout is the **default**, not an absolute — the hardest five percent of layouts will not compose, and forcing them produces contorted primitives. A bespoke layout is permitted with the reason named in a comment. One component per file; the root selector is a single class named after the file. *Decidable test: drop this component into three unrelated containers. Does it look wrong in any of them?* *Gate: `check-styles.mjs` component-roots.*

## Accessibility floor

Not a style preference, and in several jurisdictions not optional. Pointer targets are at least **24×24 CSS pixels** (WCAG 2.2 SC 2.5.8, Level AA), with five exceptions you must not over-apply: sufficient spacing, an equivalent control elsewhere on the page, inline targets within text, user-agent-controlled size, and essential presentation. 24px is a floor — Apple advises 44pt, Material 48dp, and SC 2.5.5 (AAA) requires 44×44 with no spacing exception.

Honour `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`. Never remove a focus indicator; restyle it with `:focus-visible`. Anything a user may scale uses relative units, so 200% zoom or a 24px default font does not break the page.

Banned: `outline: none` without a replacement, `user-scalable=no`, any transition or animation with no reduced-motion branch.

## Universality clause

Anything that generates styles — `brand-builder` included — is project-agnostic by default. *Project-agnostic* means it assumes nothing about the framework, the component library, or the codebase it runs inside. Output must be valid for any project in the world.

A generator that emits rendering-library-prefixed tokens fails pattern 4. A generator that emits light mode only fails pattern 5. A generator that emits `margin` on a component root fails pattern 7. All three fail before a single component is written.

## Enforcement protocol

Before writing any styles, you MUST:

1. Emit the pre-flight block, exactly this shape, nothing else:

```
Patterns in force: <comma-separated numbers>
Deviations: none | <pattern N — one-line reason>
```

2. Write the styles.

3. Self-check against every pattern using its decidable test. Fix violations silently — do not present violating styles.

4. Run the gate and emit the post-flight line, exactly this shape:

```
Verified: scripts/verify.sh — PASSED
```

If you cannot run the gate — no shell, no install, snippet-only answer — you must instead emit:

```
Verified: NOT RUN (<reason>). This output is UNVERIFIED.
```

Never omit the post-flight line. An unverified output that claims to be verified is the only unrecoverable failure in this skill. Silence is worse than a red build.

## Ambiguity table

Do not improvise on these. They are already decided.

| Situation | Ruling |
| --- | --- |
| One-off value used exactly once | Still a token. Once becomes twice. |
| Vendor component library ships its own tokens | Wrap it. Map its tokens to yours in one adapter stylesheet. Never consume `--vendor-*` in your components. |
| Design mock cannot be built inside the accessibility floor | The mock changes. Not the floor. |
| A layout genuinely will not compose | Bespoke is allowed. Name the reason in a comment. Do not add a primitive for one use. |
| Rule must override a third-party stylesheet | Assign the third party a layer on `@import`. Never escalate specificity. |
| Token needed for a mode that does not exist yet | Add it to base first. A mode overrides; it never invents. |
| `!important` seems necessary | You are in the wrong layer. Move to `foundation`, or go unlayered and get it reviewed. |
| Spacing tokens are incomplete | Do not enable the spacing gate. Ship colour enforcement only, and say so. |

## Conflict resolution

- If a pattern conflicts with an existing convention in the repo, follow the repo and say so explicitly.
- If a pattern conflicts with the accessibility floor, the floor wins.
- If following a pattern would triple the size of the change, stop and ask before proceeding.
- If a gate fails, fix the code. Disabling a rule requires a named reason in the same diff, on the same line.

## Bundled resources

- `assets/stylelint.config.mjs` — patterns 2, 3, 4, 6. Copy to repo root.
- `assets/styleguard.config.json` — namespace, globs, budget. Copy to repo root and edit the namespace.
- `assets/layers.css` — the canonical `@layer` declaration. Import first, before anything else.
- `scripts/check-styles.mjs` — patterns 3, 4, 5, 7. The rules no off-the-shelf linter can express.
- `scripts/check-css-budget.mjs` — pattern 1. The only instrument that observes the scaling curve.
- `scripts/verify.sh` — runs all of the above. This is the gate.
- `references/rationale.md` — the evidence behind each pattern, and the two places I was wrong. Read when someone challenges a rule, or when a rule seems arbitrary.
- `references/review.md` — the review checklist. Read when reviewing a diff rather than writing one.
