# {{PROJECT_NAME}}

{{One or two sentences: what is this project and what is its real purpose.}}

<!-- /to-product inserts ## Product here -->

## Stack and commands

{{Stack summary, e.g. "Vite, React, TypeScript. Vitest for unit tests, Playwright for UI tests."}}

| Command              | Does                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Start the app                                                      |
| `npm run typecheck`  | Type-check app and tests                                           |
| `npm run lint`       | Lint                                                               |
| `npm test`           | Unit tests                                                         |
| `npm run e2e`        | All Playwright tests                                               |
| `npm run ui:qa`      | UI gate: all projects, compact summary, report for the finish hook |
| `npm run sandcastle` | Build the next ready ticket in a sandbox                           |

<!-- /to-product inserts ## Conventions the tests rely on here -->

## How work happens

All app code is written in Sandcastle, never in an interactive session. A hook blocks edits to `src/` on the host (except `src/styles/tokens.css`, owned by ui-foundation).

**Day shift (you, interactive `claude`):** decide and specify.

| Situation                | Flow                                                           |
| ------------------------ | -------------------------------------------------------------- |
| New product (greenfield) | grill-with-docs → to-product                                   |
| New feature              | grill-with-docs → to-spec → ui-contract (feature) → to-tickets |
| Bug report               | triage → ui-contract (bug)                                     |
| Old screen without tests | ui-contract (cover)                                            |
| Design change            | ui-foundation                                                  |

**Specs vs tickets.** Issues carry a kind label (see `docs/agents/issue-kinds.md`). A `spec` is a parent issue with the full design — not buildable by itself. A `ticket` is a child issue scoped for one context window — buildable by an agent. to-spec creates specs; to-tickets creates child tickets under them. A spec is complete when all its child tickets are closed. The tracker determines how parent/child relationships are expressed (Beads: `--parent=<id>`; GitHub: reference in body + label; custom: whatever the project uses).

**to-tickets default input.** When `to-tickets` is invoked without an explicit spec reference, it must automatically find the first available spec — using the project's tracker (e.g. `bd ready` for Beads, the oldest open `spec`-labeled issue for GitHub) — and use that as the spec to break down. Do not prompt the user to choose.

**Night shift (`npm run sandcastle`):** one ticket per run in Docker. The builder uses the tdd skill, makes the ticket's acceptance tests pass, delegates to the visual-qa agent, and can't finish until the checks pass. Then a reviewer runs the code-review skill.

**Morning (you):** review the branch, look at every new screenshot under `e2e/__screenshots__/`, merge. Merging approves the baselines. Triage anything visual-qa filed.

Tickets ready for an agent carry the `Sandcastle` label.

## UI rules

`.claude/rules/ui-base.md` (universal) and `.claude/rules/ui-project.md` (this project) load automatically when working in `src/`. Token values live only in `src/styles/tokens.css`.

<!-- bd setup claude inserts ## Beads Issue Tracker ... ## Session Completion here -->

<!-- /setup-matt-pocock-skills inserts ## Agent skills here -->
