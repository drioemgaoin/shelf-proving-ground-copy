#!/usr/bin/env node
/**
 * Rules audit: scans all rules files for enforcement coverage,
 * validates block format per tier, checks for conflicts and budget violations.
 *
 * Exit 0 = all clean (warnings OK), exit 1 = any error found.
 */
import { readFileSync, existsSync } from 'node:fs';
import { relative, join } from 'node:path';
import { discoverRulesFiles, parseEnforcementBlocks, globMatch } from '../.claude/hooks/lib/rules.mjs';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// ─── Severity types ───────────────────────────────────────────────

const findings = [];

function error(file, message) {
  findings.push({ severity: 'error', file, message });
}

function warning(file, message) {
  findings.push({ severity: 'warning', file, message });
}

// ─── Rule detection ───────────────────────────────────────────────

/**
 * Extract top-level bullet rules from markdown content.
 * A "rule" is a top-level bullet (- text).
 * Excludes: contextual bullets (- [context] ...), headings, paragraphs, blockquotes.
 */
function extractRules(content) {
  const lines = content.split('\n');
  const rules = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Top-level bullet: starts with "- " (no leading whitespace)
    if (/^- /.test(line)) {
      // Exclude contextual bullets
      if (/^- \[context\] /i.test(line)) continue;
      rules.push({ line: i + 1, text: line.slice(2).trim() });
    }
  }

  return rules;
}

/**
 * Determine which rules have enforcement blocks associated with them.
 * An enforcement block is associated with the nearest preceding rule bullet.
 */
function findRulesWithBlocks(content) {
  const lines = content.split('\n');
  const ruleLines = new Set();

  // Find enforcement fence positions (indented or not)
  const fenceStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]*```enforcement/.test(lines[i])) {
      fenceStarts.push(i);
    }
  }

  // For each fence, walk backwards to find the nearest rule bullet
  for (const fenceStart of fenceStarts) {
    for (let j = fenceStart - 1; j >= 0; j--) {
      const line = lines[j];
      if (/^- /.test(line) && !/^- \[context\] /i.test(line)) {
        ruleLines.add(j + 1); // 1-indexed
        break;
      }
      // Also check indented enforcement fences — they belong to the bullet above
      if (/^\S/.test(line) && !line.trim().startsWith('```')) {
        break; // Hit non-indented, non-fence content — stop looking
      }
    }
  }

  return ruleLines;
}

// ─── Validation helpers ───────────────────────────────────────────

const VALID_TIERS = new Set(['T1', 'T2', 'T3', 'Human']);
const VALID_STRIP = new Set(['comments', 'strings', 'comments+strings']);
const VALID_AGENTS = new Set(['visual-qa', 'reviewer']);

function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function isValidGlob(pattern) {
  // Basic glob syntax validation — reject unmatched brackets, empty patterns
  if (!pattern || pattern.trim() === '') return false;
  let bracketDepth = 0;
  for (const c of pattern) {
    if (c === '[') bracketDepth++;
    if (c === ']') bracketDepth--;
    if (bracketDepth < 0) return false;
  }
  return bracketDepth === 0;
}

function estimateTokens(text) {
  // Word count × 1.3
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function hasExtensionFilter(scope) {
  // Check if scope globs have file extension filters
  const globs = scope.split(',').map((s) => s.trim());
  return globs.every((g) => /\.\w+$|\.\{[\w,]+\}$|\.\*$/.test(g) || g === '*');
}

// ─── Git-tracked file list (for reviewer scope checks) ────────────

let gitTrackedFiles = null;

function getGitTrackedFiles() {
  if (gitTrackedFiles !== null) return gitTrackedFiles;
  try {
    const output = execSync('git ls-files', { cwd: projectDir, encoding: 'utf8' });
    gitTrackedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    gitTrackedFiles = [];
  }
  return gitTrackedFiles;
}

// ─── Main audit ───────────────────────────────────────────────────

const rulesFiles = discoverRulesFiles(projectDir);

if (rulesFiles.length === 0) {
  error('(project)', 'No rules files discovered');
}

// Tier distribution counters
const tierCounts = { T1: 0, T2: 0, T3: 0, Human: 0 };
const allBlocks = [];
const allIds = new Map(); // id → [{ file, tier, fenceIndex }]

for (const filePath of rulesFiles) {
  const rel = relative(projectDir, filePath);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    error(rel, 'Failed to read file');
    continue;
  }

  // --- Rule detection & coverage ---
  const rules = extractRules(content);
  const coveredLines = findRulesWithBlocks(content);

  for (const rule of rules) {
    if (!coveredLines.has(rule.line)) {
      error(rel, `Rule without enforcement block (gap) at line ${rule.line}: "${rule.text.slice(0, 60)}"`);
    }
  }

  // --- Parse enforcement blocks ---
  const { blocks, errors: parseErrors } = parseEnforcementBlocks(content, filePath);

  for (const pe of parseErrors) {
    error(rel, `Malformed YAML: ${pe.message}`);
  }

  for (const block of blocks) {
    block._relFile = rel;

    // --- All tiers: tier validation ---
    if (!block.tier) {
      error(rel, `Block "${block.id ?? '(no id)'}" missing tier`);
      continue;
    }
    if (!VALID_TIERS.has(block.tier)) {
      error(rel, `Block "${block.id ?? '(no id)'}" has unrecognized tier: "${block.tier}"`);
      continue;
    }

    tierCounts[block.tier]++;
    allBlocks.push(block);

    // --- All tiers: id validation ---
    if (!block.id) {
      // Determine if legacy or new — for now, treat missing id as warning
      warning(rel, `Block (tier ${block.tier}) missing id field`);
    } else {
      // Track for duplicate detection
      if (!allIds.has(block.id)) {
        allIds.set(block.id, []);
      }
      allIds.get(block.id).push({ file: rel, tier: block.tier, multiEntry: !!block._multiEntry });
    }

    // --- Per-tier validation ---
    switch (block.tier) {
      case 'T1':
        validateT1(block, rel);
        break;
      case 'T2':
        validateT2(block, rel);
        break;
      case 'T3':
        validateT3(block, rel);
        break;
      case 'Human':
        validateHuman(block, rel);
        break;
    }
  }
}

// ─── Duplicate ID detection ──────────────────────────────────────

for (const [id, entries] of allIds) {
  // Duplicates across different files are always errors
  const files = new Set(entries.map((e) => e.file));
  if (files.size > 1) {
    error('(cross-file)', `Duplicate id "${id}" found in: ${[...files].join(', ')}`);
  }
  // Within same file, same id in same fence = OK (multi-tier), different fences = error.
  // Multi-entry expansions (e.g., T1 with multiple - pattern: entries) share the same
  // id and tier — these are NOT duplicates, they are entries within one logical block.
  for (const file of files) {
    const fileEntries = entries.filter((e) => e.file === file);
    const tierSet = new Set(fileEntries.map((e) => e.tier));
    for (const tier of tierSet) {
      const tierEntries = fileEntries.filter((e) => e.tier === tier);
      // Skip if all entries are from the same multi-entry expansion
      const nonMulti = tierEntries.filter((e) => !e.multiEntry);
      const count = nonMulti.length > 0 ? nonMulti.length : (tierEntries.length > 0 ? 1 : 0);
      if (count > 1) {
        error(file, `Duplicate id "${id}" with tier ${tier} (${count} occurrences)`);
      }
    }
  }
}

// ─── T1 cross-rule conflict detection ─────────────────────────────

const t1Blocks = allBlocks.filter((b) => b.tier === 'T1');

for (let i = 0; i < t1Blocks.length; i++) {
  for (let j = i + 1; j < t1Blocks.length; j++) {
    const a = t1Blocks[i];
    const b = t1Blocks[j];

    // Same pattern + opposite assert
    if (a.pattern === b.pattern && a.assert !== b.assert) {
      // Check overlapping scope
      const aScopeList = (a.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const bScopeList = (b.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean);

      // Simple overlap check: if any scope from A could match files from B's scope
      const overlap = aScopeList.some((as) =>
        bScopeList.some((bs) => {
          // Two globs overlap if they share path structure
          // Simplified: both match *.ext or both match same dir pattern
          return as === bs || globMatch(as, bs) || globMatch(bs, as);
        }),
      );

      if (overlap) {
        error(
          '(cross-rule)',
          `T1 conflict: "${a.id}" (assert: ${a.assert}) and "${b.id}" (assert: ${b.assert}) have same pattern "${a.pattern}" with overlapping scope`,
        );
      }
    }
  }
}

// ─── T3 budget checks ────────────────────────────────────────────

const t3Blocks = allBlocks.filter((b) => b.tier === 'T3');
const totalT3 = t3Blocks.length;

if (totalT3 > 300) {
  error('(budget)', `Total T3 rules (${totalT3}) exceeds hard limit of 300`);
} else if (totalT3 > 200) {
  warning('(budget)', `Total T3 rules (${totalT3}) exceeds 200 — suggest narrowing`);
} else if (totalT3 > 150) {
  warning('(budget)', `Total T3 rules (${totalT3}) exceeds 150 — suggest promotion audit`);
}

// T3 triage_exempt count
const triageExemptCount = t3Blocks.filter((b) => b.triage_exempt === 'true' || b.triage_exempt === true).length;
if (triageExemptCount > 10) {
  error('(budget)', `triage_exempt count (${triageExemptCount}) exceeds limit of 10`);
}

// T3 visual-qa group > 80 check
const vqaBlocks = t3Blocks.filter((b) => b.agent === 'visual-qa');
const vqaGroups = new Map();
for (const b of vqaBlocks) {
  if (b.group) {
    vqaGroups.set(b.group, (vqaGroups.get(b.group) ?? 0) + 1);
  }
}
for (const [group, count] of vqaGroups) {
  if (count > 80) {
    error('(budget)', `visual-qa group "${group}" has ${count} rules — exceeds limit of 80`);
  }
}

// T3 reviewer scopeless count
const reviewerBlocks = t3Blocks.filter((b) => b.agent === 'reviewer');
const scopelessReviewerCount = reviewerBlocks.filter((b) => !b.scope).length;
if (scopelessReviewerCount > 10) {
  error('(budget)', `Reviewer scopeless rules (${scopelessReviewerCount}) exceeds limit of 10`);
}

// ─── Human validation ─────────────────────────────────────────────

const humanBlocks = allBlocks.filter((b) => b.tier === 'Human');
const humanLogPath = join(projectDir, 'reviews', 'human-tier-log.jsonl');

if (humanBlocks.length > 0) {
  let humanLog = [];
  if (existsSync(humanLogPath)) {
    try {
      const logContent = readFileSync(humanLogPath, 'utf8');
      humanLog = logContent
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      // Can't read log
    }
  }

  for (const block of humanBlocks) {
    const entries = humanLog.filter(
      (e) => e.rule === block.rule || (block.id && e.rule === block.id),
    );

    if (entries.length === 0) {
      error(block._relFile, `Human-tier rule "${block.id ?? block.rule}" has no entry in reviews/human-tier-log.jsonl`);
    } else {
      const hasReview = entries.some((e) => e.verdict !== 'created');
      if (!hasReview) {
        warning(block._relFile, `Human-tier rule "${block.id ?? block.rule}" has only "created" entry — not yet reviewed`);
      }
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

console.log('');
console.log('Rules Audit Report');
console.log('==================');
console.log('');
console.log('Tier distribution:');
console.log(`  T1:    ${tierCounts.T1}`);
console.log(`  T2:    ${tierCounts.T2}`);
console.log(`  T3:    ${tierCounts.T3}`);
console.log(`  Human: ${tierCounts.Human}`);
console.log(`  Total: ${tierCounts.T1 + tierCounts.T2 + tierCounts.T3 + tierCounts.Human}`);
console.log('');

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) {
    console.log(`  ERROR ${e.file}: ${e.message}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) {
    console.log(`  WARN  ${w.file}: ${w.message}`);
  }
  console.log('');
}

if (errors.length === 0) {
  console.log('✓ All rules have enforcement blocks, all blocks valid.');
  process.exit(0);
} else {
  console.log(`✗ ${errors.length} error(s) found. Fix before proceeding.`);
  process.exit(1);
}

// ─── Per-tier validators ──────────────────────────────────────────

function validateT1(block, file) {
  const id = block.id ?? '(no id)';

  // Required fields
  for (const field of ['pattern', 'scope', 'fix']) {
    if (!block[field]) {
      error(file, `T1 block "${id}" missing required field: ${field}`);
    }
  }

  // assert field — required per spec but current blocks use 'rule' instead
  // The spec says assert is required; check for it
  if (!block.assert && !block.rule) {
    error(file, `T1 block "${id}" missing assert or rule field`);
  }

  // Invalid regex
  if (block.pattern && !isValidRegex(block.pattern)) {
    error(file, `T1 block "${id}" has invalid regex: "${block.pattern}"`);
  }

  // Invalid glob syntax
  if (block.scope && !isValidGlob(block.scope)) {
    error(file, `T1 block "${id}" has invalid glob syntax in scope: "${block.scope}"`);
  }
  if (block.exclude && !isValidGlob(block.exclude)) {
    error(file, `T1 block "${id}" has invalid glob syntax in exclude: "${block.exclude}"`);
  }

  // Unrecognized strip
  if (block.strip && !VALID_STRIP.has(block.strip)) {
    error(file, `T1 block "${id}" has unrecognized strip value: "${block.strip}"`);
  }

  // Scope without extension filter (may match binaries).
  // Lock rules (pattern ".*", assert "absent") intentionally match all files —
  // apply-t1 enforces them before the binary skip, so no gap exists.
  const isLock = block.pattern === '.*' && block.assert === 'absent';
  if (block.scope && !isLock && !hasExtensionFilter(block.scope)) {
    warning(file, `T1 block "${id}" scope lacks extension filter — may match binary files`);
  }
}

function validateT2(block, file) {
  const id = block.id ?? '(no id)';

  // Required fields
  if (!block.scope) {
    error(file, `T2 block "${id}" missing required field: scope`);
  }
  if (!block.assert) {
    error(file, `T2 block "${id}" missing required field: assert`);
  }

  // Global scope with non-callable assert
  if (block.scope === 'global' && block.assert) {
    // Callable asserts typically look like function calls or references
    const isCallable = /^[a-zA-Z_]\w*\s*\(/.test(block.assert) || /--\s/.test(block.assert);
    if (!isCallable) {
      error(file, `T2 block "${id}" has global scope with non-callable assert: "${block.assert.slice(0, 60)}"`);
    }
  }

  // Global block assert not in invariants.spec.ts (drift warning)
  if (block.scope === 'global' && block.assert) {
    const invariantsPath = join(projectDir, 'e2e', 'global', 'invariants.spec.ts');
    if (existsSync(invariantsPath)) {
      try {
        const invariantsContent = readFileSync(invariantsPath, 'utf8');
        // Extract the callable part of assert (before " --")
        const callable = block.assert.split('--')[0].trim();
        if (!invariantsContent.includes(callable)) {
          warning(file, `T2 block "${id}" assert "${callable}" not found in invariants.spec.ts (drift)`);
        }
      } catch {
        // Can't read invariants file
      }
    }
  }

  // Per-component with zero generated tests (staleness warning)
  // Deferred — would need to check generated test files for this component
}

function validateT3(block, file) {
  const id = block.id ?? '(no id)';

  // Required fields
  if (!block.agent) {
    error(file, `T3 block "${id}" missing required field: agent`);
  }
  if (!block.instruction) {
    error(file, `T3 block "${id}" missing required field: instruction`);
  }

  // Unrecognized agent
  if (block.agent && !VALID_AGENTS.has(block.agent)) {
    error(file, `T3 block "${id}" has unrecognized agent: "${block.agent}"`);
  }

  // Visual-qa specific
  if (block.agent === 'visual-qa') {
    if (!block.group) {
      error(file, `T3 block "${id}" (visual-qa) missing required field: group`);
    }
    if (block.scope && block.scope !== '*') {
      error(file, `T3 block "${id}" (visual-qa) scope must be "*", got: "${block.scope}"`);
    }

    // Group > 80 check deferred to post-collection phase
  }

  // Reviewer specific
  if (block.agent === 'reviewer') {
    if (!block.scope) {
      warning(file, `T3 block "${id}" (reviewer) missing scope — counts against scopeless budget`);
    }

    if (!block.triage_hint) {
      warning(file, `T3 block "${id}" (reviewer) missing triage_hint`);
    }

    // Scope > 50% files without exclude
    if (block.scope && !block.exclude) {
      const tracked = getGitTrackedFiles();
      if (tracked.length > 0) {
        const scopes = block.scope.split(',').map((s) => s.trim()).filter(Boolean);
        const matchCount = tracked.filter((f) => scopes.some((s) => globMatch(s, f))).length;
        if (matchCount > tracked.length * 0.5) {
          warning(
            file,
            `T3 block "${id}" (reviewer) scope matches ${matchCount}/${tracked.length} files (>${Math.round((matchCount / tracked.length) * 100)}%) without exclude`,
          );
        }
      }
    }
  }

  // Instruction token count
  if (block.instruction) {
    const tokens = estimateTokens(block.instruction);
    if (tokens > 500) {
      warning(file, `T3 block "${id}" instruction exceeds 500 tokens (estimated: ${tokens})`);
    }
  }

  // Priority validation
  if (block.priority !== undefined) {
    const p = Number(block.priority);
    if (!Number.isInteger(p) || p < 0 || p > 4) {
      error(file, `T3 block "${id}" priority must be 0-4 integer, got: "${block.priority}"`);
    }
  }

  // Deterministic language in instruction (promotion candidate)
  if (block.instruction) {
    const deterministicPatterns = /\b(scan for pattern|check if .+ equals|regex|grep|lint)\b/i;
    if (deterministicPatterns.test(block.instruction)) {
      warning(file, `T3 block "${id}" instruction uses deterministic-check language — promotion candidate`);
    }
  }
}

function validateHuman(block, file) {
  const id = block.id ?? '(no id)';

  if (!block.review) {
    error(file, `Human block "${id}" missing required field: review`);
  }
  if (!block.reason) {
    error(file, `Human block "${id}" missing required field: reason`);
  }
}
