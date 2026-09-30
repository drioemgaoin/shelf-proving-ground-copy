# Coding Standards

## Style

- Use camelCase for variables and functions, PascalCase for components and types
- Prefer named exports over default exports
- No nested ternary operators; use switch statements or if/else chains
- Explicit over clever: clarity beats brevity

## TypeScript

- No `any` types; use `unknown` and narrow
- No unsafe casts (`as`); use type guards
- All public function parameters and return types must be typed

## Testing

- Unit tests co-located with source in `__tests__/` or `.test.ts` files
- Acceptance tests in `e2e/acceptance/` are locked; do not edit
- Agent-written integration tests go in `e2e/agent/`
- Use `data-dynamic` on content that changes between runs (dates, relative times)
- Find elements by role and accessible name, never by CSS selector

## Components

- Every interactive control must have an accessible name
- Token values live only in `src/styles/tokens.css`; no raw color/spacing/size values in components
- Follow the rules in `.claude/rules/ui-base.md` and `.claude/rules/ui-project.md`

## Architecture

- Data access through the async API module, never direct state mutation
- Keep modules focused on a single responsibility
- Prefer composition over inheritance
