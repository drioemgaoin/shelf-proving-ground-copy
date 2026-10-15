# qa/

Quality assurance for the sandcastle pipeline and cross-cutting test infrastructure. Product acceptance tests for the shelf app itself stay in `tests/`.

## Directory layout

Organized by **journey** (what the pipeline does) with test type as a sublevel:

```
qa/
├── ticket-flow/          Happy path: pick → build → review → close
│   ├── unit/             Ticket parsing, planner schema, issue selection
│   ├── integration/      Planner → executor handoff
│   └── acceptance/       Pipeline output validation (pipeline-judge)
├── qa-gates/             Check → fix cycle, visual QA, code review
│   ├── unit/             Gate runner, isClean, oscillation detection
│   └── integration/      Full check → fix → recheck cycle
├── fixer/                apply-fixer: patch model, verify, revert
│   └── unit/             Finding validation, patch matching, revert cascade
├── rules-enforcement/    T1/T2/T3 pipeline, audit
│   └── unit/             apply-t2, apply-t3, audit-rules
├── prompt-expansion/     Template expansion pipeline
│   └── unit/             Three-stage expansion
├── review/               Morning review aggregator
│   └── unit/             Tracker data seeding, output verification
├── pipeline-lock/        Concurrency guard
│   └── unit/             Lock acquire/release, stale detection
├── hooks/                PreToolUse hook enforcement
│   └── unit/             Hook spawn, exit code assertions
├── linting/              ESLint + Stylelint custom rules
│   └── unit/             Violation detection, valid-code passthrough
├── invariants/           T2 cross-cutting (a11y, overflow, CLS) — not a journey
├── agent/                Infra probes (smoke, pw-facts) — not a journey
├── bench/                Performance benchmarks (not in CI) — not a journey
└── support/              Shared Playwright fixtures, viewport matrix, UI helpers
```

## Running

| Command          | What it runs                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `npm test`       | Vitest — includes `qa/**/unit/` and `qa/**/integration/`         |
| `npm run qa`     | Playwright — agent probes, invariants, acceptance specs          |
| `npm run qa:judge` | Pipeline judge — validates spec tags and ticket alignment       |
| `npm run e2e`    | Playwright — shelf product acceptance tests only (`tests/`)      |

## Conventions

- **Vitest tests** use `.test.{ts,tsx,mjs}` suffix and live in `<journey>/unit/` or `<journey>/integration/`.
- **Playwright specs** use `.spec.ts` suffix and live in `agent/`, `invariants/`, or `<journey>/acceptance/`.
- **Support files** (`fixtures.ts`, `viewports.ts`, `ui.ts`) are canonical in `qa/support/`.
- Playwright config for this directory: `qa/playwright.config.ts`.
- Journey folders only get sublevel types they actually need — no empty folders for symmetry.
