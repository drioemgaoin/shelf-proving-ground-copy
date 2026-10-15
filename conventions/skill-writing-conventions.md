---
generated: 2026-08-25
source: conventions/skill-writing-conventions.md
conventions: 24 STRONG (of 29 total)
purpose: Agent-consumable checklist for skill-authoring workflows
---
# Skill Writing Conventions — Checklist

## 1. Body Structure and Size
- **SCONV-01**: Keep SKILL.md body under 500 lines / ~5,000 tokens. Hard Read limit at 10K tokens.
- **SCONV-02**: Use 3-tier progressive disclosure: catalog (~100 tokens) → body on activation (<5K) → references/ on demand. Reduces initial context by 94-99%.
- **SCONV-03**: Move API docs, schemas, and large examples into `references/` subdirectory. Combined skill budget caps at 25K tokens.

## 2. Step Decomposition
- **SCONV-10**: Include full workflow in the SKILL.md body (in-context) rather than fragmenting across orchestration nodes. In-context wins all 15 comparisons (p<0.005).
- **SCONV-11**: Minimize step count. Reliability = p^n; at p=0.95, 10 steps = ~60% success. Each step multiplies failure probability.
- **SCONV-12**: Frame workflows as 4-5 guiding principles with MUST/NEVER markers, not exhaustive 20-step procedures. Rigid sequences cause freezing on unexpected scenarios.
- **SCONV-13**: State the complete specification upfront. Single-shot outperforms emergent specification on 16/20 papers (p=0.0003). Never reveal requirements progressively across steps.

## 3. Frontmatter and Naming
- **SCONV-20**: Use only spec-defined frontmatter fields. Required: `name`, `description`. Optional: `license`, `compatibility`, `metadata`, `allowed-tools`. Unknown fields trigger validation errors.
- **SCONV-21**: Name must match parent directory exactly. Max 64 chars, lowercase-letters-numbers-hyphens only. No consecutive hyphens, no leading/trailing hyphens.
- **SCONV-22**: Description must include trigger phrases: state the capability, add "Use when..." with literal user phrases, include domain-adjacent keywords. Description carries the entire trigger burden.
- **SCONV-23**: Front-load trigger phrases in first 200 chars. Silent truncation at 1,024-1,536 chars. Write for the matcher, not for humans browsing.

## 4. Validation and Verification
- **SCONV-30**: Insert explicit validation checks between steps that produce output consumed downstream. Error propagation compounds across 3-4 reasoning steps. Halt on failure, don't propagate.
- **SCONV-31**: Use architecturally independent verifiers (scripts, linters, test suites), not the same LLM. Replacing trained verifier with generator eliminates most rescues.
- **SCONV-32**: When verification can be expressed as a script, schema check, or test execution, use that over LLM-based judgment. Self-verification breaks correct responses after multiple iterations.

## 5. Composability
- **SCONV-40**: One skill, one verb. Split when a skill serves two distinct trigger patterns. Large inventories increase selection ambiguity.
- **SCONV-41**: Use only `name`, `description`, and plain Markdown body for cross-platform portability. Spec-compliant skills run on Claude Code, Codex CLI, Copilot, Cursor.
- **SCONV-42**: Inline workflow steps rather than delegating to sub-skills. Orchestration failure rates are 2-4x higher. Delegate only for genuinely independent, well-bounded sub-tasks.

## 6. Error Recovery and Execution Bounds
- **SCONV-50**: Define concrete SUCCESS and FAILED exit conditions with measurable criteria. Without explicit exit conditions, models retry infinitely.
- **SCONV-51**: Set hard iteration caps (e.g., max 3 retries), token budgets, and timeouts for every loop/retry path. 63 documented budget-overrun incidents in production.
- **SCONV-52**: Never retry denied/failed tool calls identically. Diagnose the cause, adjust approach, then retry differently. Cascading identical retries are a top agent failure mode.

## 7. Formatting and Compliance
- **SCONV-60**: Use XML tags (`<critical>`, `<example>`, `<output>`) for structural boundaries. XML tags outperform prose in adherence testing across all major providers.
- **SCONV-61**: Place all constraints and hard boundaries at the top of the body, before procedural steps. Exploits U-shaped attention curve. 90% panel consensus.
- **SCONV-62**: Show expected output as concrete examples (code blocks, JSON) rather than prose descriptions. Prose agents hallucinate non-existent commands; structured agents retrieve verbatim.

## 8. Security and Trust
- **SCONV-70**: Declare `allowed-tools` in frontmatter to restrict to minimum required tools. 36.8% of scanned skills contain flaws; tool restriction reduces blast radius.
- **SCONV-71**: Never instruct agents to execute shell commands from untrusted input. Use parameterized scripts with validated arguments. 1,184 malicious skills found on ClawHub.
- **SCONV-72**: No angle brackets, instruction-like text, or executable content in frontmatter. Keep frontmatter purely declarative. Angles can inject instructions into system prompt.
- **SCONV-73**: Scan all third-party skills before installation and after updates. Skills benign at install can turn malicious on update (TOCTOU). Scanners catch ~61.5% of attacks.
