# Setup guide: from zero to a complete app

Every step in order. Works for any greenfield project — Shelf is just the example. At the end, the app runs with no UX/UI issues.

## Prerequisites

- Node 22+
- Docker
- Claude Code CLI (`claude`)

## Phase 0 — Infrastructure (terminal, ~15 min)

Only what sandcastle needs to run. The app itself gets built by RALPH.

### 1. Initialize git

Sandcastle requires a local git repo (branches, commits, diffs). No remote or push needed — it's internal plumbing.

```bash
git init
```

### 2. Install beads

```bash
brew install beads
```

Or: `npm install -g @beads/bd`

### 3. Initialize sandcastle with beads

Uses the `parallel-planner` template — the same 3-phase plan→execute→merge loop that Matt Pocock's course-video-manager uses.

```bash
npx @ai-hero/sandcastle init \
  --agent claude-code \
  --sandbox docker \
  --template parallel-planner \
  --issue-tracker beads \
  --build-image false
```

### 4. Initialize beads in the project

```bash
bd init
bd setup claude
```

### 5. Create a minimal package.json

Just enough for `npm run sandcastle` to work. The full app scaffold is a ticket.

```bash
npm init -y
npm pkg set name=shelf
npm pkg set scripts.sandcastle="npx tsx .sandcastle/main.mts"
npm install --save-dev @ai-hero/sandcastle tsx zod
```

### 6. Apply the overlay

The overlay replaces the stock `main.mts` and prompts with the full UI-workflow versions (QA gates, fix loops, warm-image Docker, TDD, contract rules, visual-qa scoping, code-review skill). It also patches the Dockerfile for Playwright.

```bash
cp .sandcastle-overlay/main.mts .sandcastle/main.mts
cp .sandcastle-overlay/implement-prompt.md .sandcastle/implement-prompt.md
cp .sandcastle-overlay/review-prompt.md .sandcastle/review-prompt.md
cp .sandcastle-overlay/visual-qa-prompt.md .sandcastle/visual-qa-prompt.md
cp .sandcastle-overlay/CODING_STANDARDS.md .sandcastle/CODING_STANDARDS.md
cp .sandcastle-overlay/Dockerfile.warm .sandcastle/Dockerfile.warm
cp .sandcastle-overlay/build-warm.sh .sandcastle/build-warm.sh
cp .sandcastle-overlay/fix-prompt.md .sandcastle/fix-prompt.md
cp .sandcastle-overlay/reset.mts .sandcastle/reset.mts
cp .sandcastle-overlay/replay.mts .sandcastle/replay.mts
cp .sandcastle-overlay/replay-visual-qa.mts .sandcastle/replay-visual-qa.mts
chmod +x .sandcastle/build-warm.sh
node .sandcastle-overlay/patch-dockerfile.mjs 1.52.0
```

`main.mts` is the full orchestrator: three-phase plan→execute→merge loop with warm-image Docker (`Dockerfile.warm` + `build-warm.sh`), visual QA and code review gates (up to 3 rounds each with fixer agents), codemap generation, ticket-scoped visual QA (only reports failures matching the ticket's acceptance criteria), and `UI_GUARD=afk` backpressure for the implementer.

### 7. Set up authentication

```bash
cp .sandcastle/.env.example .sandcastle/.env
```

Edit `.sandcastle/.env` and set `CLAUDE_CODE_OAUTH_TOKEN` (get it from `claude setup-token`).

### 8. Build the sandbox image

```bash
npx @ai-hero/sandcastle docker build-image
```

### 9. Commit

```bash
git add -A && git reset .sandcastle/.env && git commit -m "chore: sandcastle + beads infra"
```

### Phase 0 checkpoint

```bash
npm run sandcastle
```

Should start, find no tickets, stop cleanly.

---

## Phase 1 — Configure skills (interactive claude session)

```bash
claude
```

### 10. `/setup-matt-pocock-skills`

When prompted:

- **Tracker:** Other — describe it as: *"This project uses beads (bd) for issue tracking. Commands: `bd create "Title" --body "..."` to create, `bd ready --json` to list ready work, `bd show <id>` to view, `bd close <id>` to close, `bd update <id> --claim` to claim. See `bd prime` for full workflow context."*
- **Triage labels:** No, override one — `ready-for-agent` is spelled `Sandcastle`
- **Docs:** Single-context

Commit the result.

### Phase 1 checkpoint

In claude, ask: "add a comment to src/App.tsx". Should be **blocked** by the host lock.

---

## Phase 2 — Design foundation (interactive claude session)

### 12. `/ui-foundation`

Suggested answers: namespace `shelf`, calm and airy, soft corners, system fonts, light and dark, phone and desktop.

This creates:
- `src/styles/tokens.css` — three tiers, dark mode, motion tokens, reduced-motion override
- `.claude/rules/ui-project.md` — project-specific UI rules

Commit.

### Phase 2 checkpoint

- `src/styles/tokens.css` exists with proper token tiers
- `.claude/rules/ui-project.md` exists, under 150 lines, no raw values

---

## Phase 3 — Define the product (interactive claude session)

Before building features you need to know what the app is. This phase produces the Product section of `CLAUDE.md` — the single source of truth for what gets built.

### 13. `/grill-with-docs`

Describe the app in one or two sentences. What is it? Who is it for? The grill challenges scope, complexity, and whether the feature set will exercise the UI surface areas you care about (see the coverage checklist in Phase 4).

For Shelf: *"A personal reading-list app. A reader keeps a list of books they can add, browse, open, and organize by status. Data is in-memory, no backend."*

### 14. `/to-product`

Synthesizes the grill output into the **Product** and **Conventions** sections of `CLAUDE.md`. Same philosophy as `/to-spec` — no interview, just synthesis of what you've already discussed.

Review the result, adjust if needed, then commit.

### Phase 3 checkpoint

- `CLAUDE.md` has a Product section listing every feature the app will ship
- `CLAUDE.md` has a Conventions section covering fixtures, dynamic content, and accessible names
- The feature list, combined with the coverage checklist, covers the full UI review surface

---

## Phase 4 — Features (repeat per feature)

Work features in dependency order. Use `bd ready` to find the next unblocked feature — beads tracks the dependency graph and only surfaces work whose blockers are resolved.

### UI coverage checklist

Your project exists to exercise the full UI review surface. During the grill, check that the set of features built so far (plus the one you're about to add) will eventually cover all of these:

- [ ] States: loading, empty, error, populated
- [ ] Responsive layout: phone and desktop
- [ ] Long / overflowing content
- [ ] Accessibility: keyboard, screen reader, focus management
- [ ] Motion: entrance, exit, reduced-motion override
- [ ] Focus trap (dialog)
- [ ] Inline validation and layout-shift avoidance
- [ ] Dark mode and contrast
- [ ] Persistence across visits

You don't need every feature to hit every box — but by the time you're done, every box should be checked.

### For each feature, repeat steps 16–20:

Each step is a separate interactive `claude` session (or the same session if you prefer). Every step must complete before the next one starts.

#### 16. `/grill-with-docs` — challenge the feature

Find the next feature and feed its description to the grill:

```bash
# In terminal — find the next ready feature
bd ready
bd show <id>
```

```
# In claude — start the grill
/grill-with-docs <paste the feature description from bd show>
```

The grill runs as a multi-round interview. It will:
- Challenge scope, UX decisions, and edge cases
- Ask numbered questions with recommended answers — you answer each
- Continue rounds until the frontier is empty (all decisions resolved)
- Produce ADRs (in `docs/decisions/`) and glossary entries (in `CONTEXT.md`) as side effects

**What to watch for during the grill:**
- Does this feature add coverage your project still needs? (check the UI coverage checklist above)
- Are there scope creep risks? The grill should push back on unnecessary complexity.
- Are edge cases and states fully specified?

**Done when:** The grill says the frontier is empty and you confirm shared understanding.

#### 17. `/to-spec` — synthesize a spec

```
# In claude — immediately after the grill finishes (same session)
/to-spec
```

This synthesizes the grill output into a formal spec. It does NOT interview you — it works from what you already discussed. The spec is published to beads (attached to the feature issue).

**The spec includes:** Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes.

**Verify before moving on:**
- The spec uses domain vocabulary from `CONTEXT.md`, not ad-hoc terms
- The spec avoids specific file paths (uses domain terminology instead)
- The spec was published to the tracker (check with `bd show <id>`)

#### 18. `/ui-contract` — write locked Playwright tests

```
# In claude — can be same session or new
/ui-contract feature <spec reference from step 17>
```

This writes locked Playwright acceptance tests that define what "correct" looks like BEFORE any code is built. Tests go in `e2e/acceptance/`.

**What it produces:**
- Playwright test file(s) in `e2e/acceptance/`
- Tests tagged by concern: `@visual`, `@motion`, `@a11y`, `@layout`, `@stability`, `@perf`
- Elements found by role and accessible name only (never CSS selectors)
- Token values read from the page via `readToken` (no hard-coded colors/sizes)
- A "UI acceptance" section added to the spec listing test names and state inventory

**Key constraints:**
- Tests are **locked** — the sandcastle builder agent cannot edit them, only make them pass
- Tests must import from `../support/fixtures`, never directly from `@playwright/test`
- Tests start **red** (failing) — that's expected and correct
- Max ~25 tests per session; split into multiple files if needed

**Verify before moving on:**
- Tests are committed
- Running `npx playwright test e2e/acceptance/<file> --reporter=line` shows all tests failing (red)

#### 19. `/to-tickets` — break into implementable tickets

```
# In claude — can be same session or new
/to-tickets <spec reference>
```

This breaks the spec into vertical-slice tickets with blocking edges, published to beads.

**What it produces:**
- Beads issues, each a narrow but complete slice (schema → API → UI → tests)
- Blocking edges between tickets (dependency order)
- Each ticket labeled `Sandcastle` (the ready-for-agent label)
- Each ticket lists its acceptance tests from step 18

**Verify before moving on:**
- Run `bd list --status=open` — new tickets should appear
- Each ticket names which acceptance tests from `e2e/acceptance/` it must make pass
- If any ticket is missing its acceptance tests, tell claude: "Add the acceptance tests from the ui-contract to each ticket"

#### 20. Exit claude, run sandcastle

```bash
# Exit the claude session
exit

# Run sandcastle — it picks the next ready ticket automatically
npm run sandcastle
```

**What sandcastle does:** Picks a ready ticket (labeled `Sandcastle`, no open blockers), builds it in a Docker sandbox using TDD, delegates to visual-qa, and runs code-review. It creates a branch for the work.

**After each sandcastle run:**
1. Review the branch it prints
2. Look at every new PNG under `e2e/__screenshots__/`
3. Merge if happy:

```bash
git merge --no-ff <branch-name>
```

4. Repeat `npm run sandcastle` until all tickets for this feature are done

**For hands-off runs** (auto-merge, up to 5 iterations):

```bash
SANDCASTLE_AUTO_MERGE=1 SANDCASTLE_MAX_ITERATIONS=5 npm run sandcastle
```

**When all tickets for this feature are closed:**

```bash
# Close the parent feature issue
bd close <feature-id>

# Check what's now unblocked
bd ready
```

Then go back to step 16 with the next ready feature.

### Done when

Every feature listed in the Product section of `CLAUDE.md` is built, and every box in the UI coverage checklist above is checked.

### Feature checkpoints (verify after each feature)

| Check | Expected |
|---|---|
| Contract before code | `/ui-contract` committed failing tests before sandcastle built anything |
| Tickets | Each names its acceptance tests from `e2e/acceptance/` |
| Sandbox log | Builder used tdd, delegated to visual-qa, got PASS before committing |
| Tests unchanged | `e2e/acceptance/` shows only added baselines, never edited tests |
| Feature closed | `bd close <id>` run, downstream features now unblocked |

---

## Phase 5 — Cover existing screens

### 21. `/ui-contract` (cover mode)

For each route/screen that was built during Phase 4 but doesn't yet have dedicated UI tests, run `/ui-contract` in cover mode:

```
# In claude
/ui-contract cover <route>
```

Cover mode writes tests that start **green** (the screen already works). Any defects that break the UI rules are filed as bugs, not locked in by tests.

Repeat for every route in your app.

### 22. Run sandcastle for any bugs found

```bash
npm run sandcastle
```

---

## Phase 6 — Final verification

### 23. Run the full UI gate

```bash
npm run ui:qa
```

Everything should pass.

### 24. Run the app locally

```bash
npm install
npm run dev
```

Open the app in a browser and verify:
- Every feature listed in the Product section of `CLAUDE.md` works
- Every box in the UI coverage checklist (Phase 4) is checked
- All accessible, responsive, motion-safe, and visually correct in both themes

---

## Cleanup

Once everything passes:

```bash
rm -f TEST-PLAN.md
rm -rf .sandcastle-overlay
```
