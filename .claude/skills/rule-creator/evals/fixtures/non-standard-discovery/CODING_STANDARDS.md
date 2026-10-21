# Coding Standards

## Naming

- Use camelCase for variables and functions, PascalCase for classes and types.
- Boolean variables start with `is`, `has`, or `should`.

## Imports

- No wildcard imports (`import * as`). Import only what you use.
- No circular imports between modules.
- Import groups are sorted: external packages first, then internal modules, then relative imports. Separate groups with a blank line.

## Error Handling

- Never swallow errors silently. Always log or re-throw.
- Use custom error classes for domain-specific failures.

## Testing

- Test file names match their source file: `foo.ts` → `foo.test.ts`.
- No test should depend on the execution order of other tests.
