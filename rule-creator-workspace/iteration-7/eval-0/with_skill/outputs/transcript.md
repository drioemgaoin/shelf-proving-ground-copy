# Transcript: Adding enforcement blocks to Python error handling rules

## Task

Add enforcement blocks to two rules in `python-standards.md`:
1. "No bare `except:` clauses"
2. "No `type: ignore` comments without an error code"

## Discovery

Found one rules file: `.claude/rules/python-standards.md` (scoped to `**/*.py`).
No existing enforcement blocks in the file. Zero T3, zero scopeless, zero critical rules.

## Sorting test: Rule 1 — No bare `except:` clauses

**Step 1: Can a tool catch it?**
Yes. A bare `except:` has a clear syntactic signature: the keyword `except` followed by a colon with no exception type between them. The regex `\bexcept\s*:` matches this pattern. There is no context where `except:` (without a type) is valid Python that should be allowed. This is a textbook T1 case — the SKILL.md itself lists "bare `except:`" as a canonical T1 example.

**Classification: T1**

**Enforcement block fields:**
- `pattern`: `\bexcept\s*:` — matches bare except clauses
- `assert`: Explains what the check verifies
- `scope`: `**/*.py` — applies to all Python files (matches the file's frontmatter)
- `fix`: Replace with a specific exception type

## Sorting test: Rule 2 — No `type: ignore` without error code

**Step 1: Can a tool catch it?**
Yes. A bare `type: ignore` comment looks like `# type: ignore` NOT followed by `[`. The valid form includes brackets with an error code: `# type: ignore[override]`. The regex `#\s*type:\s*ignore(?!\[)` uses a negative lookahead to match bare `type: ignore` while allowing the bracketed form. Again, this is listed as a canonical T1 example in the SKILL.md ("type: ignore without code").

**Classification: T1**

**Enforcement block fields:**
- `pattern`: `#\s*type:\s*ignore(?!\[)` — matches bare type: ignore without brackets
- `assert`: Explains the requirement
- `scope`: `**/*.py`
- `fix`: Add the specific mypy error code

## Budget check

After adding these two blocks:
- T1 rules: 2 (no budget concern)
- T3 rules: 0 (well under 150 warn threshold)
- Scopeless T3: 0 (under 10 limit)
- Critical T3: 0 (under 10 limit)

No budget concerns.

## Rule IDs (derived, not written into blocks)

1. `python-standards:error-handling:T1` (bare except)
2. `python-standards:error-handling:T1` (type ignore)

Note: Both rules share the same parent heading, so in practice a parser would need sub-indexing or would use rule text hashing to disambiguate.

## Output

Modified `python-standards.md` with enforcement blocks appended after each of the two target rules, indented to match the bulleted list structure per the SKILL.md placement guidelines.
