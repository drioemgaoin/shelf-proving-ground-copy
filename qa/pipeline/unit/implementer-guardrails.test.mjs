#!/usr/bin/env node
/**
 * Structural invariants for the implementer pipeline.
 *
 * These tests catch real issues found in sandcastle run djk.1 (2026-10-26):
 *   - test-setup.ts inside src/ gets reverted every run
 *   - implementer pipes output through tail, hiding errors
 *   - no prompt guidance for incremental output
 *
 * Seam: vitest.config.ts, .sandcastle/prompts/implementer.prompt.md
 * Level: unit
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue #1: test-setup.ts must survive src/ reverts
//
// Real scenario: sandcastle reverts src/ to pre-sandcastle state.
// vitest.config.ts (outside src/) references a setupFile.
// If that file is inside src/, it gets deleted and all unit tests fail
// with "Does the file exist?" — wasting a turn every run.
// ═══════════════════════════════════════════════════════════════════════════

{
  const vitestConfig = readFileSync('vitest.config.ts', 'utf8');
  const setupMatch = vitestConfig.match(/setupFiles\s*:\s*\[([^\]]*)\]/);

  assert(
    'vitest setupFiles exists',
    setupMatch !== null,
    'vitest.config.ts must have a setupFiles entry for jest-dom',
  );

  if (setupMatch) {
    const paths = setupMatch[1].match(/['"]([^'"]+)['"]/g)?.map(s => s.replace(/['"]/g, '')) ?? [];

    for (const p of paths) {
      // The path must NOT be inside src/ — src/ gets reverted by sandcastle
      const normalized = p.replace(/^\.\//, '');
      assert(
        `setupFile "${normalized}" is outside src/`,
        !normalized.startsWith('src/'),
        'Files inside src/ are reverted by sandcastle reprocessing. Setup files must live outside src/ to survive.',
      );

      // The file must actually exist on disk
      const fullPath = resolve(process.cwd(), p);
      assert(
        `setupFile "${normalized}" exists on disk`,
        existsSync(fullPath),
        `vitest.config.ts references ${p} but the file does not exist`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue #5: implementer must not truncate verification output
//
// Real scenario: implementer runs `npm test 2>&1 | tail -30`.
// A typecheck error at line 5 of 200 lines of output gets truncated.
// Agent sees "18 passed" but misses the error above the fold.
// The fixer prompt already has this instruction; implementer doesn't.
// ═══════════════════════════════════════════════════════════════════════════

{
  const implPrompt = readFileSync('.sandcastle/prompts/implementer.prompt.md', 'utf8');

  // The prompt must warn against output truncation
  assert(
    'implementer prompt warns against tail/head truncation',
    /[Dd]o not pipe.*tail|[Dd]o not.*truncat|full output|without piping/i.test(implPrompt),
    'Implementer prompt must contain instruction to show full verification output — without it, agents pipe through tail and miss errors above the fold',
  );

  // The pre-commit gate command in the prompt must not contain | tail or | head
  const gateMatch = implPrompt.match(/Pre-commit gate.*?`([^`]+)`/);
  if (gateMatch) {
    const gateCommand = gateMatch[1];
    assert(
      'pre-commit gate command has no tail/head pipe',
      !/\|\s*(tail|head)/.test(gateCommand),
      `The suggested gate command itself must not pipe through tail/head: "${gateCommand}"`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Issue #2: implementer should start coding incrementally
//
// Real scenario: agent reads 8 files, then goes silent for 5 minutes
// generating a massive internal plan before any tool call. This burns
// tokens with no visible progress. A brief plan + immediate first
// component write is cheaper and more observable.
// ═══════════════════════════════════════════════════════════════════════════

{
  const implPrompt = readFileSync('.sandcastle/prompts/implementer.prompt.md', 'utf8');

  assert(
    'implementer prompt encourages incremental coding',
    /[Bb]rief plan|[Ss]tart (writing|coding) immediately|first component|one component at a time|do not plan all/i.test(implPrompt),
    'Implementer prompt should guide the agent to produce a brief plan then start writing immediately, avoiding long silent generation gaps',
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
