# Transcript: Adding enforcement blocks to code-quality.md

## Task

Add enforcement blocks to all 5 rules in code-quality.md.

## Discovery

Found the rules file at the fixture path with 5 rules across 3 sections (Naming, Imports, Error handling). No existing enforcement blocks.

## Sorting test results

### Rule 1: "Use descriptive variable names that convey purpose and meaning."

- **Step 1 (Can a tool catch it?):** No. "Descriptive" is a qualifying adjective -- the adjective trap called out in the skill. No regex can judge whether `x` is descriptive enough in a given context. A pattern would produce false positives on perfectly valid short variable names (loop counters, well-known abbreviations).
- **Step 3 (LLM judgment?):** Reviewers would disagree on what's "descriptive enough." The skill explicitly lists "use descriptive variable names" as a Human example in both Step 4 and the tier-formats reference.
- **Classification: Human**
- **Rule ID:** `code-quality:naming:Human`

### Rule 2: "Functions should do one thing well and have a name that describes that thing."

- **Step 1:** No. "One thing well" is inherently subjective. A linter could check function length but that's a different rule. No syntactic proxy for cohesion.
- **Step 3:** Reviewers would disagree -- "single responsibility" is listed as a Human example in the skill.
- **Classification: Human**
- **Rule ID:** `code-quality:naming:Human` (second rule under same heading)

### Rule 3: "No unused imports."

- **Step 1:** Yes. ESLint's `no-unused-imports` rule or the TypeScript compiler detect unused imports deterministically. The violation has a clear syntactic signature: an import binding that appears nowhere else in the file.
- **Classification: T1**
- **Rule ID:** `code-quality:imports:T1`

### Rule 4: "Group imports by source: external packages first, then internal modules."

- **Step 1:** Yes. `eslint-plugin-import/order` or `simple-import-sort` can detect out-of-order import groups deterministically. The violation is structural: an internal import appearing before external imports.
- **Classification: T1**
- **Rule ID:** `code-quality:imports:T1` (second rule under same heading)

### Rule 5: "Log errors with sufficient context to diagnose the issue in production."

- **Step 1:** Partially. A regex can detect bare `console.error(err)` calls with no context string -- that's a syntactic proxy for the structural violation. However, "sufficient context" is a qualifying adjective that requires judgment. Following the skill's guidance for "mostly, but not entirely" T1 cases: classify at T1 for the enforceable part and surface the gap.
- **Classification: T1** (with gap noted -- "sufficient" requires separate Human-tier rule if the team wants it enforced)
- **Rule ID:** `code-quality:error-handling:T1`

## Budget check

| Budget | Count | Limit | Status |
|--------|-------|-------|--------|
| Total T3 rules | 0 | 150 warn | OK |
| Scopeless T3 | 0 | 10 | OK |
| Critical T3 | 0 | 10 | OK |

No T3 rules were added. All rules classified as T1 (3) or Human (2). Budget is clean.

## Output

Final file written to `outputs/code-quality.md` with all 5 enforcement blocks appended after their respective rule text, indented to match the bulleted list format per the skill's placement guidance.
