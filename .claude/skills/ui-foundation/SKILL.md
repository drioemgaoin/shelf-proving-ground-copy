---
name: ui-foundation
description: Set up or update a project's design system. Interviews the user using a grilling-style design tree, creates design tokens in code, and writes the project UI rules that the builder, ui-contract and visual-qa all rely on. Run once per project before any UI feature work, and again when the design changes. Use when the user says "set up the UI", "design tokens", "ui foundation", "change the theme", or when .claude/rules/ui-project.md is still a stub.
disable-model-invocation: true
---

# UI Foundation

You create the design system every other UI artifact depends on. Two outputs:

1. **Tokens in code**: `src/styles/tokens.css`. The single source of truth for every value.
2. **Project rules**: `.claude/rules/ui-project.md`. Names the tokens and says when to use them. Never repeats a value.

`.claude/rules/ui-base.md` already holds the universal rules. Don't restate them. Only write what is specific to this project.

Load the `css-patterns` skill before writing any token. It defines the token tiers, the namespace rule, and color modes. Follow it exactly.

## Mode

- **Setup**: `ui-project.md` is a stub or missing. Run every step.
- **Update**: it already exists. Ask what should change, then run only the steps that change. Values change in `tokens.css`; names and usage change in `ui-project.md`.

## Process

### 1. Explore

Read, don't assume: `package.json`, the main CSS entry, any existing styles, colors, fonts, and components in `src/`, `GLOSSARY.md`, `.claude/rules/ui-base.md`, and `e2e/support/viewports.ts`. Summarize what exists in five lines or fewer.

### 2. Interview (design-tree grilling)

Use the grilling pattern: map decisions as a **design tree**, work it in **rounds** on the **frontier**. Each round: number each question, give your recommended answer, wait for the user's response before computing the next frontier. Finding facts is your job (dispatch sub-agents); decisions are the user's.

Format each round exactly as the grilling skill specifies.

#### The design tree

```
Root: "What should this design system feel like?"
├─ R1: Personality (3 adjectives for this product)
├─ R1: Namespace prefix
│
├─ R2: Color modes (light only / light+dark) — constrained by personality
├─ R2: Density and corners — constrained by personality
│
├─ R3: Accent color family — constrained by personality + modes
│   └─ R4: Specific accent value — must pass contrast in ALL modes
├─ R3: Neutral temperature — warm gray / cool gray / true gray
├─ R3: Typography — constrained by personality + density
│
├─ R4: Target devices — constrains spacing, touch targets
│   └─ R5: Viewport matrix adjustments (if any)
│
└─ R5: Product-specific overrides (toast position, confirmation style, form validation)
```

Rounds are labeled R1–R5. A question only enters a round when every question it depends on is settled. Recompute the frontier after each round.

#### Personality-first anchor (round 1)

The first question is always: **"Describe this product in three adjectives."** This anchors every downstream color and spacing decision. Recommend adjectives derived from the product's domain — look at `GLOSSARY.md`, `package.json` description, and `CLAUDE.md` product section.

#### Accent bias check (mandatory before recommending)

Before recommending any accent color, apply this gate:

> If the accent you are about to recommend falls between hsl(200,\*,\*) and hsl(240,\*,\*) (the navy-to-blue range), stop. Check whether the product's personality adjectives actually call for corporate/trust/precision tones. Reading apps, creative tools, personal projects, wellness apps, and children's products almost never do. If the personality does not demand blue, recommend from the warm or vivid families instead: amber, terracotta, sage, coral, violet, teal-green.

This check exists because LLMs default to safe corporate blue when unconstrained. The template deliberately contains no color literals to avoid anchoring.

#### Stress-testing answers

Do not accept vague answers. If the user says "blue is fine", push back: *"Blue covers a lot of ground — trust-blue of a bank, electric blue of a dev tool, or muted slate-blue of a reading app? Given your adjectives [X, Y, Z], I'd recommend [alternative]. Does that resonate?"*

The session is done when the frontier is empty and every branch is settled.

### 3. Write tokens

Create `src/styles/tokens.css` using `references/tokens-template.css` as the shape:

- Three tiers: primitive, semantic, component. Values flow downward only.
- Every semantic token defined in every color mode. Modes swap values under `[data-theme]` and `prefers-color-scheme`.
- Motion tokens for duration and easing, with a reduced-motion override that sets durations to `0ms`.
- Import it first in the CSS entry, before anything else.
- **Derive every color from the interview decisions.** The template contains no color values on purpose. Never fill in a color that was not explicitly decided in the interview.

Check contrast for every text and background pair you define: 4.5:1 for body text, 3:1 for large text and UI parts. Adjust values until they pass; don't ask the user to accept a failing pair.

### 4. Write project rules

Write `.claude/rules/ui-project.md` from `references/ui-project-template.md`. Keep the frontmatter exactly as in the template, so it loads only when UI files are touched. Keep the file under 150 lines: it loads into the builder's context.

### 5. Sync the test side

If the viewport matrix changed, update `e2e/support/viewports.ts` to match.

### 6. Show and commit

Show the user the token names grouped by tier, the contrast pairs, and the rule file. Apply their edits. Commit with `chore(ui): design foundation` (or `chore(ui): update design foundation`).

## Rules

- Token values live only in `tokens.css`. If you catch yourself writing a hex code or pixel value in the rule file, replace it with the token name.
- Never touch component code. Applying tokens to existing screens is a ticket for the builder.
- Promote nothing to `ui-base.md` yourself. If a project rule looks universal, tell the user and let them decide.
- **No default colors.** Every color in the output must trace back to an interview decision. If a color was not discussed, it was not decided — ask, don't assume.

## Validation

See `references/test-cases.md` for scenarios to verify the interview produces differentiated results across product types.
