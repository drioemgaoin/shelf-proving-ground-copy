# Transcript: Adding enforcement blocks to Python error handling rules

## Task

Add enforcement blocks to two error handling rules in `python-standards.md`:
1. "No bare `except:` clauses"
2. "No `type: ignore` comments without an error code"

## Step 1: Discovery

Read the rules file at the fixture path. Found one rules file: `python-standards.md` with frontmatter `paths: "**/*.py"`. The file contains rules across five sections (Error handling, Imports, Naming, Testing, Security). No existing enforcement blocks in any rule.

## Step 2: Count existing enforcement blocks

- T1: 0
- T2: 0
- T3: 0
- Human: 0

No budget concerns.

## Step 3: Sorting test for Rule 1 — "No bare `except:` clauses"

**Step 1 of the sorting test: Can a tool catch it?**

Yes. A bare `except:` clause has a clear syntactic signature: the keyword `except` followed by a colon with no exception type between them. The regex `except\s*:` catches this pattern. There is no context where `except:` (without a type) is syntactically valid yet correct by this rule's standard. This is purely syntactic.

**Classification: T1** (deterministic, pre-commit).

**Rule ID:** `python-standards:error-handling:T1` (first rule in section)

## Step 4: Sorting test for Rule 2 — "No `type: ignore` comments without an error code"

**Step 1 of the sorting test: Can a tool catch it?**

Yes. A bare `type: ignore` comment without an error code has a syntactic signature: the text `# type: ignore` NOT followed by `[`. The regex `#\s*type:\s*ignore(?!\[)` uses a negative lookahead to match bare `type: ignore` while allowing `type: ignore[override]` and similar. This is purely syntactic -- no judgment about intent is needed.

**Classification: T1** (deterministic, pre-commit).

**Rule ID:** `python-standards:error-handling:T1` (second rule in section)

## Step 5: Generate enforcement blocks

Used the T1 template from `references/tier-formats.md`:

```yaml
enforcement:
  tier: T1
  pattern: "<regex>"
  assert: "<human-readable check>"
  scope: "<file glob>"
  fix: "<auto-fix instruction>"
```

For Rule 1 (bare except):
- `pattern`: `except\s*:` -- matches the bare except syntax
- `assert`: Describes what the check enforces
- `scope`: `**/*.py` -- matches the frontmatter paths
- `fix`: Describes the remediation (replace with specific exception type)

For Rule 2 (bare type: ignore):
- `pattern`: `#\s*type:\s*ignore(?!\[)` -- negative lookahead to exclude `type: ignore[code]`
- `assert`: Describes the requirement for error codes in brackets
- `scope`: `**/*.py` -- matches the frontmatter paths
- `fix`: Describes the remediation (add error code in brackets)

## Step 6: Placement

Both rules are in a bulleted list, so enforcement blocks are indented to match the list item, with a blank line before the code fence, per the skill's placement instructions.

## Step 7: Budget check

After adding these blocks:
- T1: 2 (no limit concern)
- T2: 0
- T3: 0 (well under 150 warn threshold)
- Scopeless T3: 0 (under 10 limit)
- Critical T3: 0 (under 10 limit)

All budgets healthy. No action needed.

## Output

Modified file saved to the outputs directory with enforcement blocks appended to both error handling rules. No other rules were modified.
