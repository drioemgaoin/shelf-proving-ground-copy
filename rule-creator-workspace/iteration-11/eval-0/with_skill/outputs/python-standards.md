---
paths: "**/*.py"
---

# Python Standards

## Error handling

- No bare `except:` clauses. Always catch a specific exception type.

  ```yaml
  enforcement:
    tier: T1
    pattern: "except\\s*:"
    assert: "No bare except: — always specify an exception type"
    scope: "**/*.py"
    fix: "Replace bare except: with a specific exception type (e.g., except ValueError:, except Exception:)"
  ```

- No `type: ignore` comments without an error code (e.g., `type: ignore[override]` is OK, bare `type: ignore` is not).

  ```yaml
  enforcement:
    tier: T1
    pattern: "#\\s*type:\\s*ignore(?!\\[)"
    assert: "type: ignore comments must include an error code in brackets"
    scope: "**/*.py"
    fix: "Add the specific mypy error code: type: ignore[error-code]"
  ```

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
