# Transcript: Classifying Go Rules with Enforcement Blocks

## Task

Analyze rules under "Types" and "Error handling" in `go-standards.md`, identify which ones have syntactic shortcuts for enforcement, and add enforcement blocks to each.

## Analysis and Classification

### Types

**Rule 1: "Use `any` instead of `interface{}`"**
- Classification: **syntactic**
- Reasoning: This is a pure text substitution rule. `interface{}` is a literal token that can be found with a simple regex. Every match is a true violation since Go 1.18 made `any` the canonical alias.
- Pattern: `interface\{\}` across all `.go` files.

**Rule 2: "Prefer named return values only when they clarify the function signature. Do not use them just for naked returns."**
- Classification: **semantic** (with syntactic heuristic)
- Reasoning: The "clarify" judgment is inherently subjective and requires understanding the function's purpose. However, the most common violation — using named returns solely to enable naked `return` statements — is syntactically detectable. A bare `return` on its own line in a function with named returns is a strong signal. I classified this as semantic but included a search heuristic for the naked-return case.

### Error handling

**Rule 1: "Always check returned errors. Never discard with `_`."**
- Classification: **syntactic**
- Reasoning: The "never discard with `_`" part is syntactically detectable by searching for patterns like `, _ :=` or `, _ =`. The broader "always check" requirement technically needs semantic analysis (knowing which return values are errors), but the `_` discard pattern is the primary syntactic shortcut. I added a caveat noting that the grep may flag non-error discards (e.g., discarding a loop index).

**Rule 2: "Wrap errors with context using `fmt.Errorf(\"doing X: %w\", err)`"**
- Classification: **syntactic**
- Reasoning: Two syntactic shortcuts exist: (1) `return err` — a bare error return without any wrapping, and (2) `fmt.Errorf` calls whose format string lacks a colon, suggesting no context prefix. Both are grep-detectable. I included a caveat about false positives at package boundaries.

**Rule 3: "Error messages start with lowercase and do not end with punctuation."**
- Classification: **syntactic**
- Reasoning: Fully syntactic. Four patterns cover it: `fmt.Errorf("` or `errors.New("` followed by an uppercase letter (catches capitalized messages), and the same prefixes with a format string ending in `.`, `!`, or `?` before the closing quote (catches trailing punctuation). These are standard Go conventions from the Go wiki.

## Actions Taken

1. Read the fixture file at the specified path.
2. Analyzed each rule in "Types" and "Error handling" for enforcement feasibility.
3. Added `<!-- enforcement: ... -->` comment blocks after each rule with:
   - `type`: syntactic or semantic
   - `search`: grep-compatible pattern(s) and glob
   - `message`: human-readable violation message
   - `caveat` or `rationale`: where limitations or edge cases exist
4. Left the other sections (Concurrency, Structure, Testing) untouched as they were out of scope.
5. Saved the modified file as `go-standards.md` and this transcript as `transcript.md` in the outputs directory.
