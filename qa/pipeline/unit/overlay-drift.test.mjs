#!/usr/bin/env node
/**
 * Verifies that skip-worktree'd files (overlay files) have been committed
 * so worktrees receive the correct version.
 *
 * Root cause: When overlay mode is off (default), worktrees get the committed
 * version of every file. If a file was modified locally and marked
 * skip-worktree but never committed, worktrees get the stale version.
 *
 * Two specific bugs this test catches:
 *   1. qa/support/fixtures.ts missing `allowedErrors` export → typecheck
 *      failure in worktrees (invariants.spec.ts uses it).
 *   2. .claude/hooks/backpressure.mjs missing stripNoise/phase-handling →
 *      false blocks on the implementer during build phase.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { execSync } from 'node:child_process';

/**
 * Return the committed (HEAD) content of a file, or null if the file
 * is not tracked. Uses `git show` — the only git call in this file,
 * and it's read-only (no mutations).
 */
function committedContent(path) {
  try {
    return execSync(`git show HEAD:${path}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bug 1: qa/support/fixtures.ts must export allowedErrors
// ---------------------------------------------------------------------------

describe('overlay-drift: qa/support/fixtures.ts', () => {
  const content = committedContent('qa/support/fixtures.ts');

  test('file is tracked', () => {
    assert.ok(content !== null, 'qa/support/fixtures.ts should be tracked by git');
  });

  test('exports allowedErrors fixture option', () => {
    assert.ok(
      content.includes('allowedErrors'),
      'committed fixtures.ts must export allowedErrors — ' +
        'qa/invariants/invariants.spec.ts depends on it. ' +
        'If this fails, the file was modified locally (skip-worktree) but never committed.',
    );
  });

  test('allowedErrors is declared as an option (not just referenced)', () => {
    // Must have the Playwright fixture option declaration syntax
    assert.match(
      content,
      /allowedErrors.*option.*true|option.*true.*allowedErrors/s,
      'allowedErrors must be declared as a Playwright fixture option ({ option: true })',
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 2: .claude/hooks/backpressure.mjs must have modern features
// ---------------------------------------------------------------------------

describe('overlay-drift: .claude/hooks/backpressure.mjs', () => {
  const content = committedContent('.claude/hooks/backpressure.mjs');

  test('file is tracked', () => {
    assert.ok(content !== null, 'backpressure.mjs should be tracked by git');
  });

  test('has stripNoise function', () => {
    assert.ok(
      content.includes('stripNoise'),
      'committed backpressure.mjs must have stripNoise() — ' +
        'without it, timing differences in test output cause false blocks. ' +
        'If this fails, the file was modified locally (skip-worktree) but never committed.',
    );
  });

  test('reads phase from .sandcastle-phase (not .sandcastle/.phase)', () => {
    assert.ok(
      content.includes('.sandcastle-phase'),
      'committed backpressure.mjs must read phase from .sandcastle-phase — ' +
        'the orchestrator (qa-gates.mts setPhase) writes to this path.',
    );
  });

  test('does not block when no QA report exists during build', () => {
    // The committed version must NOT have `if (!report) block(...)` logic.
    // When no report exists, the orchestrator handles QA sequencing.
    assert.ok(
      !content.includes("if (!report) block("),
      'committed backpressure.mjs must not block when no QA report exists — ' +
        'the orchestrator runs visual-qa after the implementer stops.',
    );
  });

  test('skips non-builder phases early (visual-qa, review)', () => {
    // Must exit early for non-builder phases, not just skip the QA check
    assert.ok(
      content.includes("phase !== 'build' && phase !== 'fix'"),
      'committed backpressure.mjs must exit early for non-builder phases',
    );
  });
});
