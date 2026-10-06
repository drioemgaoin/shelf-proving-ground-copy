# Transcript: Adding console.log Rule

## Task
Add a rule to `team-standards.md` preventing developers from leaving `console.log` statements in committed code.

## Reasoning

1. **Read the existing file.** The file already has a "Debugging" section with a guideline about using a logger utility instead of raw `console.*` calls. This is the natural place to add the new rule.

2. **Scope the rule broadly but practically.** Developers commonly use `console.log`, `console.debug`, `console.info`, and `console.warn` for debugging. All four should be covered. `console.error` is intentionally excluded because it often serves a legitimate runtime purpose (error boundaries, catch blocks).

3. **Provide a clear alternative.** The rule points developers to the project's logger utility so they know what to use instead.

4. **Add an enforcement block.** An HTML comment block with structured enforcement metadata was added. It specifies:
   - **trigger**: `pre-commit` — catches violations before code lands in the repository.
   - **check**: A `grep` command scanning `src/` for the banned console methods in `.ts` and `.tsx` files.
   - **expect**: `no_match` — the check passes only when no matches are found.
   - **message**: A human-readable explanation shown when the check fails.

5. **Placement.** The new bullet was appended to the existing "Debugging" section, and the enforcement block was placed immediately after that section, before "Testing".

## Actions Taken
- Copied the fixture file to the outputs directory.
- Added a new bullet point under "Debugging" prohibiting `console.log/debug/info/warn` in source files.
- Added an enforcement comment block with a pre-commit grep check.
- Saved the final file as `team-standards.md` in the outputs directory.
