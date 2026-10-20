#!/usr/bin/env node
/**
 * RED/GREEN tests for setRulesVisible — hide .claude/rules during checker
 * runs (rules arrive via T3 payloads) and restore for fixer runs (fixers
 * write code and need the full rules context).
 *
 * RED:  before this feature, rules stayed visible for all gate agents
 * GREEN: runGateLoop hides before checker, restores before fixer
 *
 * Seam: setRulesVisible() in .sandcastle/lib/qa-gates.mts
 * Level: unit
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ---------------------------------------------------------------------------
// Mirror setRulesVisible from .sandcastle/lib/qa-gates.mts — EXACTLY
// ---------------------------------------------------------------------------

import { renameSync } from 'node:fs';

const RULES_DIR = ".claude/rules";
const RULES_STASH = ".claude/.rules-stashed";

function setRulesVisible(worktree, visible) {
  const active = join(worktree, RULES_DIR);
  const stashed = join(worktree, RULES_STASH);
  if (visible && existsSync(stashed)) {
    renameSync(stashed, active);
  } else if (!visible && existsSync(active)) {
    renameSync(active, stashed);
  }
}

// ---------------------------------------------------------------------------
// Helper: create a temp worktree with rules
// ---------------------------------------------------------------------------

function makeTempWorktree() {
  const tmp = mkdtempSync(join(tmpdir(), 'rules-vis-test-'));
  const rulesDir = join(tmp, RULES_DIR);
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, 'ui-base.md'), '# UI Base rules');
  writeFileSync(join(rulesDir, 'ui-project.md'), '# UI Project rules');
  writeFileSync(join(rulesDir, 'coding-standards.md'), '# Coding standards');
  return tmp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Test A: hide moves rules to stash
// ═══════════════════════════════════════════════════════════════════════════

test('A: setRulesVisible(false) hides .claude/rules', () => {
  const tmp = makeTempWorktree();
  assert(existsSync(join(tmp, RULES_DIR)), 'precondition: rules dir exists');

  setRulesVisible(tmp, false);

  assert(!existsSync(join(tmp, RULES_DIR)), 'rules dir must be gone after hide');
  assert(existsSync(join(tmp, RULES_STASH)), 'stash dir must exist after hide');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test B: restore moves stash back to rules
// ═══════════════════════════════════════════════════════════════════════════

test('B: setRulesVisible(true) restores .claude/rules', () => {
  const tmp = makeTempWorktree();
  setRulesVisible(tmp, false);
  assert(!existsSync(join(tmp, RULES_DIR)), 'precondition: rules hidden');

  setRulesVisible(tmp, true);

  assert(existsSync(join(tmp, RULES_DIR)), 'rules dir must be back after restore');
  assert(!existsSync(join(tmp, RULES_STASH)), 'stash dir must be gone after restore');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test C: files survive the round-trip
// ═══════════════════════════════════════════════════════════════════════════

test('C: all rule files survive hide → restore round-trip', () => {
  const tmp = makeTempWorktree();
  const originalFiles = readdirSync(join(tmp, RULES_DIR)).sort();

  setRulesVisible(tmp, false);
  setRulesVisible(tmp, true);

  const restoredFiles = readdirSync(join(tmp, RULES_DIR)).sort();
  assert(
    JSON.stringify(originalFiles) === JSON.stringify(restoredFiles),
    `files changed: was [${originalFiles}], now [${restoredFiles}]`,
  );

  // Verify content intact
  assert(
    readFileSync(join(tmp, RULES_DIR, 'ui-base.md'), 'utf8') === '# UI Base rules',
    'ui-base.md content must survive round-trip',
  );

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test D: double-hide is a no-op (idempotent)
// ═══════════════════════════════════════════════════════════════════════════

test('D: setRulesVisible(false) twice is idempotent', () => {
  const tmp = makeTempWorktree();
  setRulesVisible(tmp, false);
  setRulesVisible(tmp, false); // second call — must not throw

  assert(existsSync(join(tmp, RULES_STASH)), 'stash must still exist');
  assert(!existsSync(join(tmp, RULES_DIR)), 'rules must still be hidden');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test E: double-restore is a no-op (idempotent)
// ═══════════════════════════════════════════════════════════════════════════

test('E: setRulesVisible(true) twice is idempotent', () => {
  const tmp = makeTempWorktree();
  setRulesVisible(tmp, false);
  setRulesVisible(tmp, true);
  setRulesVisible(tmp, true); // second call — must not throw

  assert(existsSync(join(tmp, RULES_DIR)), 'rules must still be visible');
  assert(!existsSync(join(tmp, RULES_STASH)), 'stash must not exist');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test F: no rules dir — hide is a no-op
// ═══════════════════════════════════════════════════════════════════════════

test('F: setRulesVisible(false) is safe when no rules dir exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'rules-vis-test-'));
  mkdirSync(join(tmp, '.claude'), { recursive: true });
  // No rules dir created

  setRulesVisible(tmp, false); // must not throw
  assert(!existsSync(join(tmp, RULES_STASH)), 'no stash created from nothing');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test G: runGateLoop wiring — source code calls setRulesVisible
// ═══════════════════════════════════════════════════════════════════════════

test('G: runGateLoop calls setRulesVisible before checker and fixer', () => {
  const src = readFileSync('.sandcastle/lib/qa-gates.mts', 'utf8');

  // Extract runGateLoop function body
  const fnStart = src.indexOf('export async function runGateLoop');
  const fnBody = src.slice(fnStart, src.indexOf('\n// ----', fnStart));

  // Before checker: setRulesVisible(ctx.worktree, false)
  const checkerSection = fnBody.slice(
    fnBody.indexOf('// --- Checker ---'),
    fnBody.indexOf('// --- Evaluate'),
  );
  assert(
    checkerSection.includes('setRulesVisible') && checkerSection.includes('false'),
    'runGateLoop must call setRulesVisible(worktree, false) before checker',
  );

  // Before fixer: setRulesVisible(ctx.worktree, true)
  const fixerSection = fnBody.slice(
    fnBody.indexOf('// --- Fixer ---'),
    fnBody.indexOf('gate.afterFix'),
  );
  assert(
    fixerSection.includes('setRulesVisible') && fixerSection.includes('true'),
    'runGateLoop must call setRulesVisible(worktree, true) before fixer',
  );

  // Finally block: always restore rules regardless of exit path
  assert(
    fnBody.includes('finally'),
    'runGateLoop must have a finally block to restore rules on all exit paths',
  );
  const finallySection = fnBody.slice(fnBody.indexOf('finally'));
  assert(
    finallySection.includes('setRulesVisible') && finallySection.includes('true'),
    'finally block must call setRulesVisible(worktree, true)',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test H: setRulesVisible is the single source of truth in sandbox.mts
// ═══════════════════════════════════════════════════════════════════════════

test('H: setRulesVisible is exported from sandbox.mts', () => {
  const src = readFileSync('.sandcastle/lib/sandbox.mts', 'utf8');
  assert(
    src.includes('export function setRulesVisible'),
    'setRulesVisible must be exported from sandbox.mts',
  );
});

test('H2: qa-gates.mts imports setRulesVisible from sandbox.mjs', () => {
  const src = readFileSync('.sandcastle/lib/qa-gates.mts', 'utf8');
  assert(
    src.includes('import') && src.includes('setRulesVisible') && src.includes('./sandbox.mjs'),
    'qa-gates.mts must import setRulesVisible from sandbox.mjs',
  );
  assert(
    !src.includes('export function setRulesVisible'),
    'qa-gates.mts must NOT define its own setRulesVisible',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test I: checker → fixer → checker cycle preserves rules
// ═══════════════════════════════════════════════════════════════════════════

test('I: simulated checker→fixer→checker cycle', () => {
  const tmp = makeTempWorktree();
  const rulesPath = join(tmp, RULES_DIR);

  // Round 1: checker (hidden) → fixer (visible)
  setRulesVisible(tmp, false);
  assert(!existsSync(rulesPath), 'r1 checker: rules must be hidden');

  setRulesVisible(tmp, true);
  assert(existsSync(rulesPath), 'r1 fixer: rules must be visible');
  assert(readdirSync(rulesPath).length === 3, 'r1 fixer: all 3 rule files present');

  // Round 2: checker (hidden) → fixer (visible)
  setRulesVisible(tmp, false);
  assert(!existsSync(rulesPath), 'r2 checker: rules must be hidden');

  setRulesVisible(tmp, true);
  assert(existsSync(rulesPath), 'r2 fixer: rules must be visible');
  assert(readdirSync(rulesPath).length === 3, 'r2 fixer: all 3 rule files present');

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test J: setRulesVisible only accepts worktree strings (no hooks overload)
// ═══════════════════════════════════════════════════════════════════════════

test('J: setRulesVisible has no hooks overload (host safety)', () => {
  const src = readFileSync('.sandcastle/lib/sandbox.mts', 'utf8');

  // Must NOT have the old SandboxHooks overload — removed to prevent
  // host-bind-mount mutations via head strategy
  assert(
    !src.includes('setRulesVisible(hooks: SandboxHooks'),
    'setRulesVisible must NOT have a SandboxHooks overload (host safety)',
  );

  // Must only accept worktree strings
  assert(
    src.includes('setRulesVisible(worktree: string'),
    'setRulesVisible must accept worktree path strings',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test K: planner and merger do NOT use setRulesVisible (no hooks overload)
// ═══════════════════════════════════════════════════════════════════════════

test('K: planIteration uses head strategy with no hooks (no host mutation)', () => {
  const src = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  const fnStart = src.indexOf('export async function planIteration');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  assert(
    fnBody.includes('"head"') || fnBody.includes("'head'"),
    'planIteration must use head branch strategy (no worktree)',
  );
  assert(
    !fnBody.includes('createLightHooks') && !fnBody.includes('createBuilderHooks'),
    'planIteration with head must NOT use hooks that modify host files',
  );
  assert(
    !fnBody.includes('setRulesVisible'),
    'planIteration must NOT call setRulesVisible',
  );
});

test('K2: mergeCompleted uses deterministic PR merge (no LLM agent)', () => {
  const src = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  const fnStart = src.indexOf('export async function mergeCompleted');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  assert(
    fnBody.includes('gh pr create'),
    'mergeCompleted must create PRs via gh CLI',
  );
  assert(
    fnBody.includes('gh pr merge'),
    'mergeCompleted must merge PRs via gh CLI',
  );
  assert(
    !fnBody.includes('setRulesVisible'),
    'mergeCompleted must NOT call setRulesVisible',
  );
  assert(
    !fnBody.includes('timedRun'),
    'mergeCompleted must NOT use an LLM agent',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test L: executeIssue does NOT hide rules (implementer needs them)
// ═══════════════════════════════════════════════════════════════════════════

test('L: executeIssue does not call setRulesVisible', () => {
  const src = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  const fnStart = src.indexOf('async function executeIssue');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  assert(
    !fnBody.includes('setRulesVisible'),
    'executeIssue must NOT call setRulesVisible — the implementer writes code and needs rules',
  );
});

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\nrules-visibility tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
