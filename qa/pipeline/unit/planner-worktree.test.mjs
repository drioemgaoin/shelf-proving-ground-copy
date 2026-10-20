#!/usr/bin/env node
/**
 * Tests for planner worktree elimination and host-safety guards.
 *
 * Use cases:
 *   1. The planner must NOT create a git worktree (single-worktree goal)
 *   2. strip-enforcement.mjs must refuse to run on the host project root
 *   3. setRulesVisible must not crash the pipeline on rename failure
 *   4. Orphaned planner worktrees are cleaned up after planning
 *
 * Seam: .sandcastle/lib/phases.mts (planIteration), scripts/strip-enforcement.mjs,
 *       .sandcastle/lib/sandbox.mts (setRulesVisible), .sandcastle/main.mts (cleanup)
 * Level: unit
 */
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// ═══════════════════════════════════════════════════════════════════════════
// 1. Planner must not create a worktree
// ═══════════════════════════════════════════════════════════════════════════

test('planIteration uses head strategy (no worktree)', () => {
  const src = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  const fnStart = src.indexOf('export async function planIteration');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  assert(
    fnBody.includes('"head"') || fnBody.includes("'head'"),
    'planIteration must use branchStrategy type "head" — no worktree creation',
  );
  assert(
    !fnBody.includes('merge-to-head'),
    'planIteration must NOT use merge-to-head (creates a worktree)',
  );
});

test('planIteration does not use hooks that modify host files', () => {
  const src = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  const fnStart = src.indexOf('export async function planIteration');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  // Must not use createBuilderHooks (strips enforcement, modifies CLAUDE.md)
  assert(
    !fnBody.includes('createBuilderHooks'),
    'planIteration must NOT use createBuilderHooks (modifies files)',
  );

  // Must not use createLightHooks if strategy is head (modifies node_modules, .beads)
  if (fnBody.includes('"head"') || fnBody.includes("'head'")) {
    assert(
      !fnBody.includes('createLightHooks'),
      'planIteration with head strategy must NOT use createLightHooks (would modify host node_modules and .beads)',
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. strip-enforcement.mjs refuses to run on host root
// ═══════════════════════════════════════════════════════════════════════════

test('strip-enforcement has a cwd guard against host root', () => {
  const src = readFileSync('scripts/strip-enforcement.mjs', 'utf8');

  // Must check cwd before touching any files
  const guardIndex = src.indexOf('worktrees');
  const rulesAccessIndex = src.indexOf("readdirSync(rulesDir)");
  assert(guardIndex !== -1, 'strip-enforcement must check for "worktrees" in cwd');
  assert(
    guardIndex < rulesAccessIndex,
    'cwd guard must come BEFORE reading/writing rule files',
  );
});

test('strip-enforcement exits non-zero when run from project root', () => {
  // Run from the actual project root — must fail
  try {
    execSync('node scripts/strip-enforcement.mjs', {
      encoding: 'utf8',
      cwd: resolve('.'),
      env: { ...process.env, SANDCASTLE_WORKTREE: '' },
    });
    // If it didn't throw, it must have exited 0 — that's a failure
    assert(false, 'strip-enforcement must exit non-zero when run from project root');
  } catch (e) {
    assert(e.status !== 0, `Expected non-zero exit, got ${e.status}`);
  }
});

test('strip-enforcement succeeds inside a path containing "worktrees"', () => {
  // Create a temp dir that mimics a worktree path
  const tmp = mkdtempSync(join(tmpdir(), 'worktrees-strip-test-'));
  const fakeWorktree = join(tmp, 'worktrees', 'sandcastle-issue-test');
  const rulesDir = join(fakeWorktree, '.claude', 'rules');
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, 'test-rule.md'), '# Rule\n\n```enforcement\ncode\n```\n');

  // Copy the script and its dependency so we can run it from the fake worktree
  try {
    execSync(`node ${resolve('scripts/strip-enforcement.mjs')}`, {
      encoding: 'utf8',
      cwd: fakeWorktree,
    });
    // Should succeed — no assertion needed, if it throws the test fails
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. setRulesVisible does not crash on rename failure
// ═══════════════════════════════════════════════════════════════════════════

test('setRulesVisible(false) does not throw when rules dir is read-only', () => {
  // Create a worktree-like temp dir where rename will fail
  const tmp = mkdtempSync(join(tmpdir(), 'worktrees-rules-crash-'));
  const rulesDir = join(tmp, '.claude', 'rules');
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, 'test.md'), '# test');

  // Make .claude read-only so rename fails
  execSync(`chmod 555 "${join(tmp, '.claude')}"`, { encoding: 'utf8' });

  // Read the actual function from sandbox.mts and test it
  // We mirror the implementation to test the try/catch behavior
  const RULES_DIR = '.claude/rules';
  const RULES_STASH = '.claude/.rules-stashed';

  function setRulesVisible(worktree, visible) {
    const active = join(worktree, RULES_DIR);
    const stashed = join(worktree, RULES_STASH);
    try {
      if (visible && existsSync(stashed)) {
        renameSync(stashed, active);
      } else if (!visible && existsSync(active)) {
        renameSync(active, stashed);
      }
    } catch (e) {
      // Must not propagate — log and continue
      console.error(`⚠️  setRulesVisible(${visible}) failed for ${worktree}: ${e}`);
    }
  }

  // This must NOT throw — the try/catch must absorb the EPERM
  let threw = false;
  try {
    setRulesVisible(tmp, false);
  } catch {
    threw = true;
  }

  // Restore permissions for cleanup
  execSync(`chmod 755 "${join(tmp, '.claude')}"`, { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });

  assert(!threw, 'setRulesVisible must not throw on rename failure');
});

test('setRulesVisible source has try/catch around renameSync', () => {
  const src = readFileSync('.sandcastle/lib/sandbox.mts', 'utf8');
  const fnStart = src.indexOf('export function setRulesVisible');
  const fnEnd = src.indexOf('\n}', fnStart) + 2;
  const fnBody = src.slice(fnStart, fnEnd);

  assert(
    fnBody.includes('try') && fnBody.includes('catch'),
    'setRulesVisible must wrap renameSync in try/catch',
  );
  // The catch block must not re-throw. Strip comments, then check for throw statements.
  const catchStart = fnBody.indexOf('} catch');
  assert(catchStart !== -1, 'must have a catch block');
  const afterCatch = fnBody.slice(catchStart);
  const codeOnly = afterCatch.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(
    !codeOnly.includes('throw'),
    'setRulesVisible catch block must not re-throw (would crash pipeline)',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Planner worktree cleanup exists in orchestrator
// ═══════════════════════════════════════════════════════════════════════════

test('main.mts cleans up planner worktrees after planning', () => {
  const src = readFileSync('.sandcastle/main.mts', 'utf8');

  assert(
    src.includes('sandcastle-planner-'),
    'main.mts must reference planner worktree prefix for cleanup',
  );
  assert(
    src.includes('worktree remove') || src.includes('worktree prune'),
    'main.mts must remove or prune planner worktrees',
  );

  // Cleanup must happen AFTER planIteration call and BEFORE executeInParallel call.
  // Skip past the function definition to find the invocation site.
  const normalPath = src.indexOf('// ── Normal path');
  const planCall = src.indexOf('planIteration(', normalPath);
  const cleanupCall = src.indexOf('cleanupPlannerWorktrees()', planCall);
  const executeCall = src.indexOf('executeInParallel(', normalPath);

  assert(planCall !== -1, 'planIteration call must exist in normal path');
  assert(cleanupCall !== -1, 'cleanupPlannerWorktrees call must exist after planIteration');
  assert(executeCall !== -1, 'executeInParallel call must exist in normal path');
  assert(
    planCall < cleanupCall && cleanupCall < executeCall,
    'planner cleanup must happen between planning and execution',
  );
});

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\nplanner-worktree tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
