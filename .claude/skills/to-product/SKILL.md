---
name: to-product
description: "Turn the current conversation into the Product and Conventions sections of CLAUDE.md: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context (typically after a `/grill-with-docs` session about the app concept) and writes the Product and Conventions sections of `CLAUDE.md`. Do NOT interview the user; just synthesize what you already know.

## When to use

After grilling the product idea — not a single feature, but the whole app. This is a greenfield step: it creates the north star that `/to-spec` and `/to-tickets` later reference for individual features.

## Process

1. Read `CLAUDE.md` to understand its current state. If a Product section already exists, you are updating it — preserve anything still valid and note what changed.

2. Explore the repo to understand the current state of the codebase, if any exists yet. In a true greenfield project there may be nothing beyond infrastructure.

3. Synthesize the grilled conversation into the two sections below, then write them into `CLAUDE.md`:
   - **Product** goes immediately before `## Stack and commands` (after the project description).
   - **Conventions the tests rely on** goes immediately after `## Stack and commands` (before `## How work happens`).

4. **Create a beads issue for each feature** in the Product section. Each issue should be grill-ready — its description must be a single sentence that can be copy-pasted directly into `/grill-with-docs` for Phase 4. Format:

   ```bash
   bd create --title="<Feature name>" \
     --description="<One sentence describing the feature scope, key UX details, and which UI coverage areas it exercises (e.g. states, responsive, focus trap, motion).>" \
     --type=feature \
     --priority=2
   ```

   Order the issues by dependency (foundational features first). If a feature depends on another, add the edge:

   ```bash
   bd dep add <this-feature> <depends-on>
   ```

5. Present the result to the user for review. Do not commit — the user decides when to commit.

## Product section template

<product-template>

## Product

<One sentence: who is the user and what do they do with the app.>

- **<Feature name>** (`<route if any>`): <one-line description of what the user can do>
- **<Feature name>** (`<route if any>`): <one-line description>
- ...

<Data strategy: where data lives, backend or not, persistence model.>

</product-template>

Guidelines for the Product section:

- Each bullet is a feature, not a screen. If a feature spans multiple screens, say so.
- Include the route only if the app has routing.
- Keep each bullet to one line. Detail belongs in feature specs, not here.
- The feature list should be complete enough that "every bullet built = app is done".
- Order features by dependency: foundational ones first.

## Conventions section template

<conventions-template>

## Conventions the tests rely on

- **Fixtures.** <How tests control app state. Name the fixture mechanism and list fixture names.>
- **Dynamic content.** <How time-dependent or random content is marked so screenshots stay stable.>
- **Accessible names.** <Policy: every control has one, tests find elements by role and name only, etc.>

</conventions-template>

Guidelines for the Conventions section:

- Only include conventions that agents and tests need to know. This is not a style guide.
- Be specific: name the query parameter, the data attribute, the exact fixture names.
- If a convention hasn't been decided yet during the grill, flag it with `(TBD)` — the user will fill it in before the first feature spec.
