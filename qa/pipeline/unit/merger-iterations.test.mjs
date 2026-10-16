#!/usr/bin/env node
/**
 * TGF-13: Merger maxIterations must be 3 (spec says 3, not 1)
 *
 * Single attempt means any merge conflict immediately fails with no retry.
 * Spec: "Merger iterations | 3 | Hard → Escalate merge-failure" (line 1213)
 *
 * Seam: mergeCompleted() configuration in .sandcastle/lib/phases.mts:302
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

// ---------------------------------------------------------------------------
// Read the source and extract maxIterations from the mergeCompleted function
// ---------------------------------------------------------------------------

const phasesSrc = readFileSync('.sandcastle/lib/phases.mts', 'utf8');

// Find the maxIterations value inside mergeCompleted (the timedRun call)
// We look for the pattern after "async function mergeCompleted" to scope it
const mergerSection = phasesSrc.slice(phasesSrc.indexOf('async function mergeCompleted'));
const iterMatch = mergerSection.match(/maxIterations:\s*(\d+)/);

test('TGF-13a: maxIterations is extractable from mergeCompleted', () => {
  assert(iterMatch !== null, 'Could not find maxIterations in mergeCompleted');
});

test('TGF-13b: merger maxIterations === 3 (spec line 1213)', () => {
  assert(iterMatch !== null, 'maxIterations not found');
  const value = Number(iterMatch[1]);
  assert(
    value === 3,
    `Expected maxIterations to be 3, got ${value}`
  );
});

// --- Report ---
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`merger-iterations tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
