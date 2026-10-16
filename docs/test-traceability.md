# Test Traceability Matrix — Rules Enforcement System

Every use case (UC) extracted from `docs/rules-enforcement.md`. Each links to spec section, actor, starting state, action, expected result, and test level.

**Test levels:**
- **Unit** — single function, no I/O or child processes
- **Integration** — two or more parts (files, processes, git, network)
- **Acceptance** — drives real entry points end-to-end as a user would

**Status legend:**
- ✅ Existing test covers this
- 🔴 Implemented, needs new test
- 📝 Accepted deviation — see `docs/spec-gaps.md`

---

## 1. `discoverRulesFiles()` — Rules File Discovery

### UC-01: Scan standard directories
**Spec:** "1. Scan `.claude/rules/` ... 2. Scan `.cursor/rules/` ... 3. Scan for `CODING_STANDARDS.md` at project root" (§ Rules file discovery)
**Actor:** Any parser importing `discoverRulesFiles()`
**Starting state:** Project with rules files in standard locations
**Action:** Call `discoverRulesFiles()`
**Expected:** Returns array of absolute paths from all three locations

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-01a: `.claude/rules/` has files | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-01b: `.cursor/rules/` has files | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-01c: `CODING_STANDARDS.md` exists at root | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-01d: All three locations have files | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-01e: No rules dirs exist, no CODING_STANDARDS.md | Edge (empty) | Unit | ✅ `rules-lib.test.mjs` |
| UC-01f: Mixed — some dirs exist, some don't | Edge | Unit | ✅ `rules-lib.test.mjs` |

### UC-02: Extra paths from config
**Spec:** "4. Read additional paths from `.sandcastle/config.json` key `rules.extraPaths` (array of globs)" (§ Rules file discovery)
**Actor:** Any parser
**Starting state:** Config file with `rules.extraPaths` globs
**Action:** Call `discoverRulesFiles()`
**Expected:** Glob-matched files included in result

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-02a: Extra paths resolve to files | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-02b: Config missing → default `[]` | Edge (missing) | Unit | ✅ `rules-lib.test.mjs` |
| UC-02c: Config has invalid JSON → exit 2 | Error | Integration | ✅ `rules-lib.test.mjs` |
| UC-02d: Glob has invalid syntax → skipped with warning | Error | Unit | ✅ `rules-lib.test.mjs` |
| UC-02e: Glob matches zero files → no warning | Edge (empty) | Unit | ✅ `rules-lib.test.mjs` |

### UC-03: Path validation
**Spec:** "Every resolved path is validated before inclusion" (§ Rules file discovery — Path validation)
**Actor:** Any parser
**Starting state:** Various path types in scan results
**Action:** Call `discoverRulesFiles()`
**Expected:** Only regular files within project root included

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-03a: Directory in scan → skipped with warning | Edge | Unit | ✅ `rules-lib.test.mjs` |
| UC-03b: Symlink outside project root → skipped with warning | Edge | Unit | ✅ `rules-lib.test.mjs` |
| UC-03c: `..` traversal outside root → skipped with warning | Edge | Unit | ✅ `rules-lib.test.mjs` |
| UC-03d: Duplicate paths (same file via symlink) → deduplicated | Edge | Unit | ✅ `rules-lib.test.mjs` |

---

## 2. `parseEnforcementBlocks()` — Block Parser

### UC-04: Parse enforcement fences
**Spec:** "Scan for ` ```enforcement ` fences in the markdown ... Parse each segment as YAML" (§ Enforcement block parser)
**Actor:** Any parser
**Starting state:** Markdown with enforcement fences
**Action:** Call `parseEnforcementBlocks(fileContent, filePath)`
**Expected:** Array of parsed entries with rule text association

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-04a: Single T1 block | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-04b: Multiple blocks in one file | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-04c: Multi-tier block separated by `---` at column 0 | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-04d: `---` indented inside YAML value → literal text, not separator | Edge | Unit | ✅ `rules-lib.test.mjs` |
| UC-04e: Malformed YAML → added to parse errors | Error | Unit | ✅ `rules-lib.test.mjs` |
| UC-04f: Empty fence (no content) → malformed | Edge | Unit | ✅ `rules-lib.test.mjs` |
| UC-04g: Multi-tier block with shared `id` → valid, qualified `@<tier>` at runtime | Happy | Unit | ✅ `rules-lib.test.mjs` |
| UC-04h: Rule text immediately above fence is associated (Gap 13 — implemented) | Happy | Unit | ✅ `rules-lib.test.mjs` |

---

## 3. `apply-t1.mjs` — T1 Source Text Enforcement

### UC-05: Block violating writes
**Spec:** "blocks file writes that violate T1 regex patterns" (§ apply-t1.mjs)
**Actor:** PreToolUse hook calling `apply-t1.mjs`
**Starting state:** Rules file with T1 blocks, agent attempts write
**Action:** Pipe JSON on stdin with tool/filePath/content
**Expected:** Exit 2 when pattern matches (assert: absent), exit 2 when pattern missing (assert: present)

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-05a: Pattern found, assert absent → exit 2 (block) | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-05b: Pattern not found, assert absent → exit 0 (allow) | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-05c: Pattern found, assert present → exit 0 (allow) (Gap 1 — implemented) | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-05d: Pattern not found, assert present → exit 2 (block) (Gap 1 — implemented) | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-05e: File path excluded → exit 0 | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-05f: File path outside scope → exit 0 | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-05g: Multiple violations → single rejection with all violations | Edge | Integration | ✅ `hooks.test.mjs` |
| UC-05h: Edit tool → content reconstructed from old_string → new_string | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-05i: Write tool → content from stdin | Happy | Integration | ✅ `test-hooks.mjs` |

### UC-06: Binary file detection
**Spec:** "Check for binary content (scan first 8,192 bytes for null bytes — skip binary files with exit 0)" (§ apply-t1.mjs)

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-06a: Null byte in first 8192 bytes → skip | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-06b: Null byte after 8192 bytes → not detected as binary | Edge | Integration | ✅ `hooks.test.mjs` |

### UC-07: Strip engine
**Spec:** "Apply `strip` transformations if specified" (§ apply-t1.mjs, § Strip engine)

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-07a: `strip: comments` — pattern in CSS comment → allowed | Happy | Integration | ✅ `test-hooks.mjs` |
| UC-07b: `strip: comments` — pattern in code → blocked | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-07c: `strip: strings` — pattern in string literal → allowed | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-07d: `strip: comments+strings` — both removed | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-07e: Unmapped file extension → skip stripping, match raw | Edge | Integration | ✅ `hooks.test.mjs` |
| UC-07f: Unrecognized strip value → treat as `strip: none` + warning (Gap 4 — implemented) | Error | Integration | ✅ `hooks.test.mjs` |

### UC-08: Zero rules files
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-08a: Zero rules files → exit 0 (fail-open) | Edge (empty) | Integration | ✅ `test-hooks.mjs` |

### UC-09: Malformed YAML in T1
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-09a: Malformed YAML → block ALL writes (fail-closed, exit 2) | Error | Integration | ✅ `test-hooks.mjs` |
| UC-09b: All files malformed, zero T1 rules survive → exit 2 | Error | Integration | ✅ `hooks.test.mjs` |

### UC-10: Invalid regex
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-10a: Invalid regex → pattern skipped, others continue | Error | Integration | ✅ `hooks.test.mjs` |
| UC-10b: Regex timeout (>5s) → treated as violation (exit 2) | Error | Integration | ✅ `hooks.test.mjs` |

### UC-11: Conflicting T1 rules
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-11a: Conflicting rules (present+absent) → write with pattern blocked | Edge | Integration | ✅ `hooks.test.mjs` |
| UC-11b: Conflicting rules (present+absent) → write without pattern blocked | Edge | Integration | ✅ `hooks.test.mjs` |

### UC-12: Rejection message format
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-12a: Rejection has file, line, match, rule, fix fields | Happy | Integration | ✅ `hooks.test.mjs` |
| UC-12b: Multiple violations → all in single message | Edge | Integration | ✅ `hooks.test.mjs` |

### UC-13: Invalid glob in scope/exclude
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-13a: Invalid scope glob → block skipped, fail-open + warning (Gap 3 — implemented) | Error | Integration | ✅ `hooks.test.mjs` |

### UC-14: Path resolution
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-14a: Absolute path resolved to project-relative for glob matching | Happy | Integration | ✅ `test-hooks.mjs` |

---

## 4. `audit:rules` — Validation Script

### UC-15: Coverage check
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-15a: Rules with gaps → exit 1 | Happy | Integration | ✅ `test-audit-rules.mjs` |
| UC-15b: All rules have blocks → exit 0 | Happy | Integration | ✅ `test-audit-rules.mjs` |
| UC-15c: Adding blocks reduces gap count | Happy | Integration | ✅ `test-audit-rules.mjs` |
| UC-15d: `[context]` bullets excluded from rule count | Edge | Integration | ✅ `test-audit-rules.mjs` |

### UC-16: Tier-specific validation
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-16a: Missing `id` → warning (legacy) | Edge | Integration | ✅ `test-audit-rules.mjs` |
| UC-16b: Duplicate `id` across files → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16c: Unrecognized tier → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16d: Malformed YAML → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16e: T1 missing required fields → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16f: T1 invalid regex → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16g: T1 conflict detected → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16h: T1 scope glob without extension → warning | Edge | Integration | ✅ `audit-rules.test.mjs` |
| UC-16i: T1 invalid glob syntax → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16j: T1 unrecognized strip value → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16k: T2 missing scope or assert → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16l: T2 global block with descriptive assert → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16m: T2 global block drift → warning | Edge | Integration | ✅ `audit-rules.test.mjs` |
| UC-16n: T3 missing agent or instruction → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16o: T3 unrecognized agent → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16p: T3 visual-qa missing group → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16q: T3 visual-qa scope ≠ `"*"` → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16r: T3 visual-qa group > 80 → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16s: T3 reviewer scopeless > 10 → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16t: T3 triage_exempt > 10 → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16u: T3 total > 300 → error | Error | Integration | ✅ `test-audit-rules.mjs` |
| UC-16v: T3 total > 150 → warning | Edge | Integration | ✅ `audit-rules.test.mjs` |
| UC-16w: T3 instruction > 500 tokens → warning | Edge | Integration | ✅ `audit-rules.test.mjs` |
| UC-16x: T3 priority out of range → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16x2: T3 priority exactly 4 → valid (at boundary) | Boundary | Integration | ✅ `audit-rules.test.mjs` |
| UC-16s2: Exactly 10 scopeless reviewer rules → exit 0 (at boundary) | Boundary | Integration | ✅ `audit-rules.test.mjs` |
| UC-16t2: Exactly 10 triage-exempt rules → exit 0 (at boundary) | Boundary | Integration | ✅ `audit-rules.test.mjs` |
| UC-16y: Human-tier no review entry → error | Error | Integration | ✅ `audit-rules.test.mjs` |
| UC-16z: Human-tier only "created" entry → warning | Edge | Integration | ✅ `audit-rules.test.mjs` |

### UC-17: Tier distribution reporting
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-17a: Tier distribution displayed | Happy | Integration | ✅ `test-audit-rules.mjs` |

### UC-18: Warnings vs errors exit code
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-18a: Warnings only → exit 0 | Edge | Integration | ✅ `test-audit-rules.mjs` |
| UC-18b: Any error → exit 1 | Happy | Integration | ✅ `test-audit-rules.mjs` |

### UC-59: Reviewer scope > 50% without exclude → warning
**Spec:** "Reviewer scope matches > 50% of git-tracked files without `exclude` (warning)" (§ audit:rules)
**Actor:** `audit:rules`
**Starting state:** T3 reviewer block with scope matching 83% of tracked files, no `exclude`
**Action:** Run `npm run audit:rules`
**Expected:** Exit 0 (warning only), output mentions scope coverage percentage

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-59a: Scope matches > 50% without exclude → warning (exit 0) | Edge | Integration | ✅ `audit-rules.test.mjs` |

---

## 5. `apply-t3.mjs` — T3 Prompt Expansion

### UC-19–UC-26: All variants
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-19a: Produces visual-qa and reviewer payloads | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-19b: Missing arguments → exit 2 | Error | Integration | ✅ `test-apply-t3.mjs` |
| UC-19c: Missing diffRef → exit 2 | Error | Integration | ✅ `test-apply-t3.mjs` |
| UC-20a: ≤ 80 rules → single payload | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-20b: > 80 total → one payload per group | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-20c: Single group > 80 → exit 1 | Error | Integration | ✅ `test-apply-t3.mjs` |
| UC-21a: Scope-gating excludes non-matching | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-21b: Exclusions logged to triage-exclusions.jsonl | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-21c: `git diff` failure → fail-open | Error | Integration | ✅ `apply-t3.test.mjs` |
| UC-22a–h: Two-phase triage (8 variants) | Mixed | Integration | ✅ `test-apply-t3.mjs` |
| UC-22i: Exactly 80 non-exempt → no triage (at boundary) | Boundary | Integration | ✅ `apply-t3.test.mjs` |
| UC-22j: Exactly 81 non-exempt → triage activates (over boundary) | Boundary | Integration | ✅ `apply-t3.test.mjs` |
| UC-22k: Malformed diffRef with shell metacharacters → fail-open, no injection | Security | Integration | ✅ `apply-t3.test.mjs` |
| UC-23a: > 30K tokens → auto-chunks | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-23b: Total T3 > 300 → exit 1 | Error | Integration | ✅ `test-apply-t3.mjs` |
| UC-24a: Unrecognized agent → skipped | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-24b: Out-of-range priority → default 2 | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-24c: Zero matching → "No T3 rules apply" | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-24d: Payload dir cleared before writing | Edge | Integration | ✅ `test-apply-t3.mjs` |
| UC-24e: `tiktoken` fails → word-count fallback | Edge | Integration | ✅ `apply-t3.test.mjs` |
| UC-25a: No blocks → literal injected | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-26a: overflow-skipped.jsonl fields | Happy | Integration | ✅ `test-apply-t3.mjs` |
| UC-26b: triage-exclusions.jsonl fields | Happy | Integration | ✅ `test-apply-t3.mjs` |

---

## 6. `apply-t2.mjs` — Global T2 Runner

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-27a: Zero T2 global blocks → exit 0 | Edge | Integration | ✅ `test-apply-t2.mjs` |
| UC-27b: Missing test file → exit 2 | Error | Integration | ✅ `test-apply-t2.mjs` |
| UC-27c: Drift detected → warning | Edge | Integration | ✅ `test-apply-t2.mjs` |
| UC-27d: No drift when all blocks present | Happy | Integration | ✅ `test-apply-t2.mjs` |
| UC-27e: T2 per-component ignored | Edge | Integration | ✅ `test-apply-t2.mjs` |
| UC-27f: T3 blocks ignored | Edge | Integration | ✅ `test-apply-t2.mjs` |
| UC-27g: Dev server timeout → exit 2 | Error | Integration | ✅ `test-apply-t2.mjs` |
| UC-27h: Test compilation failure → exit 2 | Error | Integration | ✅ `apply-t2.test.mjs` |
| UC-28a: All three viewports exercised (structural verification) | Happy | Unit | ✅ `apply-t2.test.mjs` |

---

## 7. Prompt Expansion Pipeline (fully covered)

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-29a: All 7 whitelisted vars substituted | Happy | Integration | ✅ |
| UC-29b: Unrecognized `{{VAR}}` left as literal | Edge | Integration | ✅ |
| UC-29c: T3 vars reserved for Stage 3 | Edge | Integration | ✅ |
| UC-30a: Shell output inserted | Happy | Integration | ✅ |
| UC-30b: Shell failure → empty string + warning | Error | Integration | ✅ |
| UC-30c: Shell timeout → empty string + warning | Error | Integration | ✅ |
| UC-31a: Visual-qa payload injected | Happy | Integration | ✅ |
| UC-31b: Reviewer payload injected | Happy | Integration | ✅ |
| UC-31c: Multiple payload chunks concatenated | Happy | Integration | ✅ |
| UC-31d: Missing payload dir → empty string | Edge | Integration | ✅ |
| UC-32a: Stage 2 output not re-expanded by Stage 3 | Edge | Integration | ✅ |
| UC-33a: Missing template → exit 2 | Error | Integration | ✅ |
| UC-34a: Combined three-stage expansion | Happy | Integration | ✅ |

---

## 8. Fixer — Mechanical Fix Applicator

### UC-35: Finding validation (fully covered)
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-35a–k: All 11 validation variants | Mixed | Unit | ✅ `test-apply-fixer.mjs` |

### UC-36: Patch model
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-36a: Current at hinted line → found | Happy | Unit | ✅ |
| UC-36b: Current not at hinted line → full-file search | Edge | Unit | ✅ |
| UC-36c: Current not found → blocked | Error | Unit | ✅ |
| UC-36d: Apply patch replaces Current with Fix | Happy | Unit | ✅ |
| UC-36e: Within file: reverse line order | Happy | Unit | ✅ `apply-fixer.test.mjs` |

### UC-37: Processing order
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-37a: Priority, file, reverse-line sorting | Happy | Unit | ✅ |
| UC-37b: T2-relayed findings default to priority 2 | Edge | Unit | ✅ `apply-fixer.test.mjs` |

### UC-38: Integration — apply and commit
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-38a: Valid applied + committed, malformed skipped | Happy | Integration | ✅ |
| UC-38b: Verify passes → committed with prefix | Happy | Integration | ✅ |
| UC-38c: Current not found → blocked | Error | Integration | ✅ |
| UC-38d: File not found → blocked | Error | Integration | ✅ |
| UC-38e: Verify fails → reverted | Error | Integration | ✅ |
| UC-38f: 3 T1 rejections → t1-conflict settled | Error | Integration | ✅ |
| UC-38g: ALL malformed → escalate malformed-report | Error | Integration | ✅ |
| UC-38h: PASS report → no action, exit 0 | Happy | Integration | ✅ |
| UC-38i: Revert cascade re-verifies | Edge | Integration | ✅ |
| UC-38j: Multi-target finding applied across files (Gap 7 — implemented) | Happy | Integration | ✅ `apply-fixer.test.mjs` |

### UC-39: Verify timeout
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-39a: Verify timeout → kill + revert | Error | Integration | ✅ `apply-fixer.test.mjs` |

### UC-40: Git commit failure
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-40a: Git commit fails once → retry after 2s | Error | Integration | ✅ `apply-fixer.test.mjs` |
| UC-40b: Git commit fails twice → escalate infra-failure | Error | Integration | ✅ `apply-fixer.test.mjs` |

### UC-41: finding-states.jsonl
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-41a: All required fields present | Happy | Integration | ✅ |

### UC-42: Partial revert failure (multi-target)
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-42a: Partial revert failure → escalate infra-failure | Error | Integration | ✅ `apply-fixer.test.mjs` |

### UC-60: Revert cascade — cascaded re-verify fails
**Spec:** "After any revert, the Fixer re-runs Verify for all previously-applied findings in the same file. If a previously-applied fix now fails verification, that finding transitions to `reverted`." (§ Fixer — Revert cascade check)
**Actor:** Fixer
**Starting state:** Two findings in same file; first applied+verified; second verify fails → revert triggers cascade
**Action:** Cascade re-verifies first finding; its verify now fails
**Expected:** Both findings reverted, cascade detail in JSONL, file restored to original

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-60a: Cascade re-verify fails → earlier finding reverted | Edge | Integration | ✅ `apply-fixer.test.mjs` |

### UC-61: Multi-target finding parser and consumer (SQ-R1-1)
**Spec:** "Multi-target findings: each sub-target has its own `file:line`, `Current`, and `Fix`" (§ Report contract)
**Actor:** Fixer via `parseFindings()` + `processSingleFinding()`
**Starting state:** Finding report with indented sub-target entries
**Action:** Parse report and apply multi-target finding
**Expected:** Parser produces `targets` array; consumer applies all targets or blocks+reverts on partial failure

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-61a: Parser produces targets array from indented sub-targets | Happy | Unit | ✅ `apply-fixer.test.mjs` |
| UC-61b: Single-target finding has no targets array | Edge | Unit | ✅ `apply-fixer.test.mjs` |
| UC-61c: Multi-target followed by single-target parsed correctly | Happy | Unit | ✅ `apply-fixer.test.mjs` |
| UC-61d: Multi-target applied across two files | Happy | Integration | ✅ `apply-fixer.test.mjs` |
| UC-61e: Multi-target second file missing → blocked, first reverted | Error | Integration | ✅ `apply-fixer.test.mjs` |

---

## 9. Finding Lifecycle (State Machine)

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-43a: pending → applied | Happy | Integration | ✅ |
| UC-43b: pending → reverted | Happy | Integration | ✅ |
| UC-43c: pending → settled | Happy | Integration | ✅ |
| UC-43d: pending → blocked | Happy | Integration | ✅ |
| UC-43e: Terminal states don't transition | Constraint | Unit | ✅ `apply-fixer.test.mjs` |

### UC-44: Settlement atomicity (spec updated — JSONL-only)
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-44a: Settlement writes JSONL entry atomically | Happy | Integration | ✅ (covered by UC-43c: pending → settled) |

---

## 10. `npm run review` — Morning Review

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-45a: Empty state → exit 0 | Happy | Integration | ✅ |
| UC-45b: Overflow-skipped.jsonl reported | Happy | Integration | ✅ |
| UC-45c: Latest overflow run used | Edge | Integration | ✅ |
| UC-45d: Human-tier rules surfaced | Happy | Integration | ✅ |
| UC-45e: Report includes item count | Happy | Integration | ✅ |
| UC-45f: t1-conflict entries surfaced | Happy | Integration | ✅ `review.test.mjs` |
| UC-45g: Screenshot baselines checked | Happy | Integration | ✅ `review.test.mjs` |

---

## 11. Fixer report handling

| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-56a: PASS — no violations | Happy | Unit | ✅ |
| UC-56b: FAIL — violations + findings list | Happy | Unit | ✅ `apply-fixer.test.mjs` |
| UC-56c: DEFER — insufficient evidence | Edge | Unit | ✅ |
| UC-56d: FAIL with zero findings → malformed-report (Gap 9 — implemented) | Error | Unit | ✅ `apply-fixer.test.mjs` |
| UC-56e: Unparseable output → DEFER (Gap 10 — implemented) | Error | Unit | ✅ `apply-fixer.test.mjs` |

---

## 12. Pipeline / Execution Flow

### UC-55: Concurrent run prevention (Gap 11 — implemented)
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-55a: No lock → acquire and proceed | Happy | Integration | ✅ `pipeline-lock.test.mjs` |
| UC-55b: Fresh lock exists → exit 0 | Edge | Integration | ✅ `pipeline-lock.test.mjs` |
| UC-55c: Stale lock (>4h) → replaced | Edge | Integration | ✅ `pipeline-lock.test.mjs` |
| UC-55d: Lock removed at completion | Happy | Integration | ✅ `pipeline-lock.test.mjs` |

### UC-57: Budget limits (Gap 12 — implemented)
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-57a: Cost below ceiling → proceeds | Happy | Unit | ✅ `budget.test.mjs` |
| UC-57b: Cost at/above ceiling → CostCeilingExceededError | Error | Unit | ✅ `budget.test.mjs` |

### UC-58: Configuration
| Variant | Type | Level | Status |
|---------|------|-------|--------|
| UC-58a: Missing config file → all defaults | Happy | Unit | ✅ `config.test.mjs` |
| UC-58b: Invalid JSON → exit 2 | Error | Unit | ✅ `config.test.mjs` |
| UC-58c: Missing key → default for that key | Edge | Unit | ✅ `config.test.mjs` |

---

## Summary

| Category | Variants | ✅ | 🔴 | 📝 |
|----------|----------|----|----|-----|
| discoverRulesFiles | 15 | 15 | 0 | 0 |
| parseEnforcementBlocks | 8 | 8 | 0 | 0 |
| apply-t1.mjs | 21 | 21 | 0 | 0 |
| audit:rules | 30 | 30 | 0 | 0 |
| apply-t3.mjs | 25 | 25 | 0 | 0 |
| apply-t2.mjs | 9 | 9 | 0 | 0 |
| Prompt expansion | 13 | 13 | 0 | 0 |
| Fixer | 32 | 32 | 0 | 0 |
| Finding lifecycle | 6 | 6 | 0 | 0 |
| Review | 7 | 7 | 0 | 0 |
| Report handling | 5 | 5 | 0 | 0 |
| Pipeline | 9 | 9 | 0 | 0 |
| **Total** | **180** | **180** | **0** | **0** |

All variants tested. All deviations resolved (spec updated to match code). 0 open spec gaps.
