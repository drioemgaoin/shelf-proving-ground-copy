#!/usr/bin/env node
/**
 * TGF-12: MAX_GATE_ROUNDS vs MAX_ROUNDS — dual constant drift
 *
 * constants.mts exports MAX_GATE_ROUNDS=3, qa-gates.mts defines a local
 * MAX_ROUNDS=3. If someone updates one without the other, gate rounds
 * silently drift. The fix is for qa-gates.mts to import from constants.mts
 * instead of defining its own local constant.
 *
 * Seam: gate round constants
 * Source: .sandcastle/config/constants.mts:5, .sandcastle/lib/qa-gates.mts:68
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
// Read source files
// ---------------------------------------------------------------------------

const constantsSrc = readFileSync('.sandcastle/config/constants.mts', 'utf8');
const qaGatesSrc = readFileSync('.sandcastle/lib/qa-gates.mts', 'utf8');

// Extract MAX_GATE_ROUNDS numeric value from constants.mts
function extractNumericExport(src, name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(\\d+)`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not extract ${name} from constants.mts`);
  return Number(m[1]);
}

const MAX_GATE_ROUNDS = extractNumericExport(constantsSrc, 'MAX_GATE_ROUNDS');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('TGF-12a: qa-gates.mts imports MAX_GATE_ROUNDS from constants.mts (no local duplicate)', () => {
  // The local "const MAX_ROUNDS = 3" should not exist — qa-gates.mts should
  // import the canonical constant from config/constants.mts instead.
  const hasLocalMaxRounds = /^\s*const\s+MAX_ROUNDS\s*=/m.test(qaGatesSrc);
  assert(
    !hasLocalMaxRounds,
    'qa-gates.mts still defines a local MAX_ROUNDS — should import MAX_GATE_ROUNDS from constants.mts'
  );
});

test('TGF-12b: qa-gates.mts imports MAX_GATE_ROUNDS from constants', () => {
  const importsConstant = qaGatesSrc.includes('MAX_GATE_ROUNDS');
  assert(
    importsConstant,
    'qa-gates.mts does not reference MAX_GATE_ROUNDS — should import from ../config/constants.mts'
  );
});

test('TGF-12c: MAX_GATE_ROUNDS equals 3 (spec: "max 3 rounds")', () => {
  assert(
    MAX_GATE_ROUNDS === 3,
    `Expected MAX_GATE_ROUNDS === 3, got ${MAX_GATE_ROUNDS}`
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nTGF-12 gate-round-constants: ${passed} passed, ${failed} failed`);
if (failures.length) { failures.forEach(f => console.error(f)); process.exit(1); }
