# Transcript: Adding enforcement blocks to code-quality.md (without skill)

## Task
Add enforcement blocks to all 5 rules in `.claude/rules/code-quality.md`.

## Input analysis
The fixture file contained 5 rules across 3 sections (Naming, Imports, Error handling), each stated as a single bullet point with no enforcement mechanism. The file uses a `paths: "src/**/*"` frontmatter scope.

## Approach
For each rule, I wrote an `<enforcement>` block that tells the agent:
1. **When** to check (trigger condition tied to the file scope)
2. **What** constitutes a violation (concrete, observable signals)
3. **What to do** when a violation is found (corrective action)

## Rules and enforcement rationale

### 1. "Use descriptive variable names"
- Enforcement bans single-letter names (with pragmatic exceptions for loop indices and event/error callbacks), cryptic abbreviations, and overly generic names like `data` or `temp`.
- Corrective action: rename to reflect purpose.

### 2. "Functions should do one thing well"
- Enforcement flags functions with "and" in the name, unrelated logical sections, or excessive length (~40+ lines) as signs of multiple responsibilities.
- Corrective action: decompose into separate well-named functions.

### 3. "No unused imports"
- Enforcement requires scanning the import block against usage in the file body, including a re-check after edits since refactoring can orphan imports.
- Corrective action: remove the unused import.

### 4. "Group imports by source"
- Enforcement specifies the exact ordering (external first, then internal) with a blank line separator, and defines what counts as external vs internal.
- Corrective action: reorder interleaved imports.

### 5. "Log errors with sufficient context"
- Enforcement requires every catch block to log the error object plus the operation that failed. Explicitly rejects bare `console.error(err)` and empty catches.
- Corrective action: add contextual information (function name, parameters, action).

## Output
- `/rule-creator-workspace/iteration-7/eval-5/without_skill/outputs/code-quality.md` -- the modified rules file with all 5 enforcement blocks added.
