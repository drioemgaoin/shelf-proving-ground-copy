# Rule Creator Transcript — Multi-file Budget Eval

## Discovery

Found two rules files:
- `ui-rules.md` (scoped to `src/components/**/*`)
- `code-rules.md` (scoped to `src/**/*`)

## Existing enforcement inventory (before changes)

### ui-rules.md
- 8 T3 blocks
- 2 critical (`dark mode invisible text`, `loading states`)
- 3 scopeless/`scope: "*"` (`headings hierarchy`, `body text readability`, `dark mode invisible text`)

### code-rules.md
- 4 T3 blocks
- 0 critical
- 0 scopeless

### Aggregated totals (before)
- Total T3: 12
- Critical: 2
- Scopeless: 3

## Three new rules to classify

### Rule 1: "Utility functions must be pure -- no side effects, no I/O, no state mutation."

**Sorting test:**
- Step 1 (Can a tool catch it?): Partially. Common side-effect patterns (fetch, console.*, fs.*) have syntactic signatures, but subtle mutations (modifying object references, writing to closures) do not. The adjective trap does not apply here -- "pure" has a well-defined technical meaning (no side effects), and reviewers would converge on what constitutes a side effect. However, catching all forms requires reading code and understanding data flow, not just pattern matching.
- Step 2 (Can a test catch it?): No deterministic runtime assertion for purity in general.
- Step 3 (Does it need LLM judgment?): Yes, and reviewers would converge -- purity is a well-defined concept in programming. A code reviewer can identify side effects by reading the function body.
- **Classification: T3 (reviewer)**, scoped to `src/utils/**/*.ts`.

### Rule 2: "Test files must not import from other test files."

**Sorting test:**
- Step 1 (Can a tool catch it?): Yes. Import statements in test files that resolve to other test files (matching `.test.ts`, `.spec.ts`, or `__tests__/` patterns) are a pure syntactic violation. A regex or lint rule can detect this without understanding intent.
- **Classification: T1**, scoped to `src/**/*.{test,spec}.{ts,tsx}`.

### Rule 3: "Components must not exceed 200 lines including template/JSX."

**Sorting test:**
- Step 1 (Can a tool catch it?): Yes. This is a hard threshold -- a pre-commit hook or lint rule can count lines in component files and flag any exceeding 200. The "200 lines" is the enforceable part. The implicit qualifier about keeping components focused describes why the threshold exists but is not separately enforced.
- **Classification: T1**, scoped to `src/components/**/*.tsx`.

## Generated enforcement blocks

### Rule 1 (T3 reviewer)
```yaml
enforcement:
  tier: T3
  agent: reviewer
  scope: "src/utils/**/*.ts"
  instruction: "Check that utility functions do not perform side effects. A violation is any function that calls fetch, console.*, fs.*, mutates parameters, writes to module-level variables, or performs I/O. Correct: functions take inputs and return outputs without observable side effects."
  triage_hint: "Utility function performs side effect or I/O"
  group: architecture
  priority: 2
  critical: false
```

Rule ID: `code-rules:purity-and-size:T3`

### Rule 2 (T1)
```yaml
enforcement:
  tier: T1
  pattern: "import .*(\\.(test|spec)|(/__tests__/))"
  assert: "Test files do not import from other test files"
  scope: "src/**/*.{test,spec}.{ts,tsx}"
  fix: "Extract shared test helpers into a dedicated test-utils module (e.g., src/test-utils/) and import from there instead"
```

Rule ID: `code-rules:purity-and-size:T1` (first T1)

### Rule 3 (T1)
```yaml
enforcement:
  tier: T1
  pattern: "wc -l > 200"
  assert: "Component files do not exceed 200 lines"
  scope: "src/components/**/*.tsx"
  fix: "Split the component into smaller sub-components or extract logic into hooks/utils"
```

Rule ID: `code-rules:purity-and-size:T1` (second T1)

## Budget check (after changes)

### Per-file breakdown

| File | T3 count | Critical | Scopeless (`*`) |
|------|----------|----------|-----------------|
| ui-rules.md (unchanged) | 8 | 2 | 3 |
| code-rules.md | 5 (+1) | 0 | 0 |

### Aggregated totals (after)

| Budget | Limit | Current | Status |
|--------|-------|---------|--------|
| Total T3 | 150 warn / 200 soft / 300 hard | 13 | OK |
| Scopeless T3 | 10 | 3 | OK |
| Critical T3 | 10 | 2 | OK |

Two of the three new rules classified as T1, keeping T3 growth minimal. All budgets are well within limits.
