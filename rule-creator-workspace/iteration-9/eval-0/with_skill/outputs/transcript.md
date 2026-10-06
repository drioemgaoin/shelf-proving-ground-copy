# Transcript: Adding enforcement blocks to Python error handling rules

## Step 1: Discovery

Read the rules file at `evals/fixtures/python-project/.claude/rules/python-standards.md`. Found one rules file with sections: Error handling, Imports, Naming, Testing, Security. No existing enforcement blocks on any rule. Zero T3 rules, zero scopeless T3, zero critical T3 -- all budgets clear.

## Step 2: Identify target rules

The two rules to classify:
1. "No bare `except:` clauses. Always catch a specific exception type."
2. "No `type: ignore` comments without an error code (e.g., `type: ignore[override]` is OK, bare `type: ignore` is not)."

## Step 3: Sorting test -- Rule 1 (bare except)

**Step 1 of the sorting test: Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

Yes. A bare `except:` clause has a clear syntactic signature: the keyword `except` followed by a colon with no exception type in between. The regex `\bexcept\s*:` matches this pattern. There is no context where `except:` (bare) is syntactically valid but semantically correct under this rule. No adjective trap -- the rule is objective.

**Classification: T1** (deterministic, pre-commit).

Rule ID: `python-standards:error-handling:t1` (first rule under that heading).

## Step 4: Sorting test -- Rule 2 (bare type: ignore)

**Step 1 of the sorting test: Can a tool catch it?**

Ask: "Can a regex, AST walker, or lint rule detect every violation of this rule without understanding intent?"

Yes. A bare `type: ignore` comment without an error code has a clear syntactic signature: the comment `# type: ignore` NOT followed by `[`. The regex `#\s*type:\s*ignore(?!\[)` matches bare `type: ignore` while allowing `type: ignore[override]` and similar. This is purely syntactic -- no intent judgment needed.

**Classification: T1** (deterministic, pre-commit).

Rule ID: `python-standards:error-handling:t1` (second rule under that heading).

## Step 5: Generate enforcement blocks

Generated T1 enforcement blocks following the template from `references/tier-formats.md`:

### Rule 1 block:
```yaml
enforcement:
  tier: T1
  pattern: "\\bexcept\\s*:"
  assert: "No bare except: clauses -- always catch a specific exception type"
  scope: "**/*.py"
  fix: "Replace bare except: with a specific exception type (e.g., except ValueError:)"
```

### Rule 2 block:
```yaml
enforcement:
  tier: T1
  pattern: "#\\s*type:\\s*ignore(?!\\[)"
  assert: "No bare type: ignore comments -- must include an error code (e.g., type: ignore[override])"
  scope: "**/*.py"
  fix: "Add the specific mypy error code: type: ignore[<error-code>]"
```

## Step 6: Placement

Both rules are in a bulleted list, so the enforcement blocks are indented to match list nesting, placed immediately after each rule's text, before the next bullet.

## Step 7: Budget check

After adding the blocks:

| Budget | File: python-standards.md | Total | Limit | Status |
|--------|--------------------------|-------|-------|--------|
| Total T3 rules | 0 | 0 | 150 warn / 200 soft / 300 hard | OK |
| Scopeless T3 | 0 | 0 | 10 | OK |
| Critical T3 | 0 | 0 | 10 | OK |

Both new rules are T1, so no T3 budget impact. All budgets well within limits.
