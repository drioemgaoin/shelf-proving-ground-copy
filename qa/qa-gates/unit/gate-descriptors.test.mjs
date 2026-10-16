#!/usr/bin/env node
/**
 * TGF-6: Gate descriptors — passWord, oscillation wiring, reviewBase
 *
 * Tests that createVisualGate() and createReviewGate() return descriptors
 * with correct passWord values, oscillation detection wiring, and
 * reviewBase capture in beforeFix.
 *
 * Seam: factory return values from .sandcastle/lib/gates.mts
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
// Build the module so we can import the TS factories
// ---------------------------------------------------------------------------
// We can't import .mts directly, so we test the logic by reimplementing the
// critical assertions from the source. This mirrors the pattern in TGF-1/2.
// The source of truth is .sandcastle/lib/gates.mts.

// Read the source and extract the field values structurally.
import { readFileSync } from 'node:fs';

const gatesSrc = readFileSync(
  new URL('../../../.sandcastle/lib/gates.mts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// TGF-6a: Visual gate passWord === "PASS"
// ---------------------------------------------------------------------------
test('TGF-6a: visual gate passWord is "PASS"', () => {
  // Extract passWord from createVisualGate function body
  const visualBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createVisualGate'),
    gatesSrc.indexOf('function createReviewGate'),
  );
  const match = visualBlock.match(/passWord:\s*"([^"]+)"/);
  assert(match !== null, 'passWord field not found in createVisualGate');
  assert(match[1] === 'PASS', `Expected "PASS", got "${match[1]}"`);
});

// ---------------------------------------------------------------------------
// TGF-6b: Review gate passWord === "CLEAN"
// ---------------------------------------------------------------------------
test('TGF-6b: review gate passWord is "CLEAN"', () => {
  const reviewBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createReviewGate'),
  );
  const match = reviewBlock.match(/passWord:\s*"([^"]+)"/);
  assert(match !== null, 'passWord field not found in createReviewGate');
  assert(match[1] === 'CLEAN', `Expected "CLEAN", got "${match[1]}"`);
});

// ---------------------------------------------------------------------------
// TGF-6c: Review gate has detectOscillation, visual gate does not
// ---------------------------------------------------------------------------
test('TGF-6c: review gate has detectOscillation', () => {
  const reviewBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createReviewGate'),
  );
  assert(
    reviewBlock.includes('detectOscillation'),
    'createReviewGate missing detectOscillation',
  );
});

test('TGF-6d: visual gate does NOT have detectOscillation', () => {
  const visualBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createVisualGate'),
    gatesSrc.indexOf('function createReviewGate'),
  );
  assert(
    !visualBlock.includes('detectOscillation'),
    'createVisualGate should not wire detectOscillation',
  );
});

// ---------------------------------------------------------------------------
// TGF-6e: Review gate beforeFix sets ctx.state.reviewBase
// ---------------------------------------------------------------------------
test('TGF-6e: review gate beforeFix sets ctx.state.reviewBase', () => {
  const reviewBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createReviewGate'),
  );
  // beforeFix must assign to ctx.state.reviewBase
  assert(
    reviewBlock.includes('ctx.state.reviewBase'),
    'review gate beforeFix does not reference ctx.state.reviewBase',
  );
  // It should use git rev-parse to capture branch HEAD
  assert(
    reviewBlock.includes('git rev-parse'),
    'review gate beforeFix does not capture branch HEAD via git rev-parse',
  );
});

// ---------------------------------------------------------------------------
// TGF-6f: Review gate detectOscillation calls findingsOverlap
// ---------------------------------------------------------------------------
test('TGF-6f: review detectOscillation uses findingsOverlap', () => {
  const reviewBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createReviewGate'),
  );
  assert(
    reviewBlock.includes('findingsOverlap'),
    'review detectOscillation does not delegate to findingsOverlap',
  );
});

// ---------------------------------------------------------------------------
// TGF-6g: Visual and review gates use distinct findings file patterns
// ---------------------------------------------------------------------------
test('TGF-6g: visual findings file pattern uses "visual-r"', () => {
  const visualBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createVisualGate'),
    gatesSrc.indexOf('function createReviewGate'),
  );
  assert(
    visualBlock.includes('visual-r${round}'),
    'visual gate findings file does not use visual-r prefix',
  );
});

test('TGF-6h: review findings file pattern uses "review-r"', () => {
  const reviewBlock = gatesSrc.slice(
    gatesSrc.indexOf('function createReviewGate'),
  );
  assert(
    reviewBlock.includes('review-r${round}'),
    'review gate findings file does not use review-r prefix',
  );
});

// --- Report ---
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`gate-descriptors tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
