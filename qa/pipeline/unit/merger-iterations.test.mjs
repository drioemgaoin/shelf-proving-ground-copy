#!/usr/bin/env node
/**
 * TGF-13: mergeCompleted uses deterministic PR merge (no LLM agent)
 *
 * Previously the Merger was an LLM agent with maxIterations: 3.
 * Now it's deterministic: git push + gh pr create + gh pr merge.
 * This test verifies the new approach is in place.
 *
 * Seam: mergeCompleted() in .sandcastle/lib/phases.mts
 * Level: unit (source inspection)
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const phasesSrc = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
const mergerSection = phasesSrc.slice(phasesSrc.indexOf('export async function mergeCompleted'));

test('TGF-13a: mergeCompleted does not use timedRun (no LLM agent)', () => {
  assert(
    !mergerSection.includes('timedRun'),
    'mergeCompleted must not call timedRun — merger is now deterministic',
  );
});

test('TGF-13b: mergeCompleted pushes branches to remote', () => {
  assert(
    mergerSection.includes('git push'),
    'mergeCompleted must push branches to the remote',
  );
});

test('TGF-13c: mergeCompleted creates PRs via gh CLI', () => {
  assert(
    mergerSection.includes('gh pr create'),
    'mergeCompleted must create PRs via gh CLI',
  );
});

test('TGF-13d: mergeCompleted merges PRs via gh CLI', () => {
  assert(
    mergerSection.includes('gh pr merge'),
    'mergeCompleted must merge PRs via gh CLI',
  );
});

// --- Report ---
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`merger tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
