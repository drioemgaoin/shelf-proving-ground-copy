---
paths: "**/*.py"
---

# Python Standards

## Error handling

- No bare `except:` clauses. Always catch a specific exception type.

  <!-- enforcement:lintable -->
  **Classification:** lintable
  **Detection:** grep for the pattern `except\s*:` (bare except with no exception type). Alternatively, use ruff rule `E722` or flake8 `E722` (do not use bare except).
  **Command:** `ruff check --select E722 .` or `grep -rn --include='*.py' 'except\s*:' .`
  **Fix:** Replace bare `except:` with a specific exception type, e.g., `except Exception:` or a narrower type appropriate to the context.
  <!-- /enforcement -->

- No `type: ignore` comments without an error code (e.g., `type: ignore[override]` is OK, bare `type: ignore` is not).

  <!-- enforcement:lintable -->
  **Classification:** lintable
  **Detection:** grep for `# type: ignore` not followed by `[`. The regex pattern is `#\s*type:\s*ignore(?!\[)`.
  **Command:** `grep -rPn --include='*.py' '#\s*type:\s*ignore(?!\[)' .`
  **Fix:** Add the specific mypy error code in brackets, e.g., change `# type: ignore` to `# type: ignore[override]` or the applicable error code.
  <!-- /enforcement -->

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
