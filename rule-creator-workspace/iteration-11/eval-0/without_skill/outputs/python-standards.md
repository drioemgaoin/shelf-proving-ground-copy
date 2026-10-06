---
paths: "**/*.py"
---

# Python Standards

## Error handling

- No bare `except:` clauses. Always catch a specific exception type.

  <!-- ENFORCEMENT:
  classification: ban
  search_pattern: "except\\s*:"
  search_exclude_pattern: "except\\s+\\w"
  applies_to: "**/*.py"
  autofix: false
  rationale: >
    Bare except clauses catch all exceptions including SystemExit, KeyboardInterrupt,
    and GeneratorExit, which masks bugs and makes debugging difficult. Always specify
    the exception type (e.g., except ValueError:).
  -->

- No `type: ignore` comments without an error code (e.g., `type: ignore[override]` is OK, bare `type: ignore` is not).

  <!-- ENFORCEMENT:
  classification: ban
  search_pattern: "#\\s*type:\\s*ignore(?!\\[)"
  applies_to: "**/*.py"
  autofix: false
  rationale: >
    Bare type: ignore comments suppress all type errors on a line, hiding real issues.
    Always specify the error code (e.g., type: ignore[override]) so only the intended
    error is suppressed and new errors remain visible.
  -->

- Never silence exceptions with `pass` in an except block without a comment explaining why.

## Imports

- Standard library imports come first, then third-party, then local. Separate groups with a blank line.
- No wildcard imports (`from module import *`).

## Naming

- Use `snake_case` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE` for module-level constants.

## Testing

- Every public function has at least one test.
- Test names follow `test_<function>_<scenario>_<expected>` pattern.

## Security

- Never log secrets, tokens, or passwords. Use a sanitizer for structured logging.
- SQL queries use parameterized statements. No string interpolation in queries.
