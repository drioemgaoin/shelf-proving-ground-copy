#!/usr/bin/env node
/**
 * Tests for violations memory system.
 * Validates the wiring: prompt whitelist, template placeholder, imports, calls.
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${label}`); }
  catch (e) { failed++; failures.push(`FAIL: ${label} \u2014 ${e.message}`); console.log(`  \u2717 ${label}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ═══════════════════════════════════════════════════════════════════

console.log('\n--- Violations memory wiring ---');

test('VIOLATIONS_MEMORY is in the prompt whitelist', () => {
  const content = readFileSync('.sandcastle/lib/prompt.mts', 'utf8');
  assert(content.includes('"VIOLATIONS_MEMORY"'), 'VIOLATIONS_MEMORY not in STAGE1_WHITELIST');
});

test('implementer prompt template includes {{VIOLATIONS_MEMORY}}', () => {
  const content = readFileSync('.sandcastle/prompts/implementer.prompt.md', 'utf8');
  assert(content.includes('{{VIOLATIONS_MEMORY}}'), '{{VIOLATIONS_MEMORY}} not in implementer prompt');
});

test('VIOLATIONS_MEMORY is before COLD START in prompt', () => {
  const content = readFileSync('.sandcastle/prompts/implementer.prompt.md', 'utf8');
  const vmIdx = content.indexOf('{{VIOLATIONS_MEMORY}}');
  const csIdx = content.indexOf('# COLD START');
  assert(vmIdx >= 0, 'VIOLATIONS_MEMORY not found');
  assert(csIdx >= 0, 'COLD START not found');
  assert(vmIdx < csIdx, 'VIOLATIONS_MEMORY should appear before COLD START');
});

test('phases.mts imports loadViolationsMemory', () => {
  const content = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  assert(content.includes('loadViolationsMemory'), 'phases.mts does not import loadViolationsMemory');
});

test('phases.mts passes VIOLATIONS_MEMORY to implementer args', () => {
  const content = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  assert(content.includes('VIOLATIONS_MEMORY: loadViolationsMemory()'), 'phases.mts does not pass VIOLATIONS_MEMORY to args');
});

test('gates.mts imports recordViolation', () => {
  const content = readFileSync('.sandcastle/lib/gates.mts', 'utf8');
  assert(content.includes('import { recordViolation }'), 'gates.mts does not import recordViolation');
});

test('gates.mts afterFix calls recordViolation', () => {
  const content = readFileSync('.sandcastle/lib/gates.mts', 'utf8');
  assert(content.includes('recordViolation('), 'gates.mts afterFix does not call recordViolation');
});

test('violations-memory.mts exports loadViolationsMemory', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('export function loadViolationsMemory'), 'loadViolationsMemory not exported');
});

test('violations-memory.mts exports recordViolation', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('export function recordViolation'), 'recordViolation not exported');
});

test('violations-memory.mts limits entries to MAX_ENTRIES_IN_PROMPT', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('MAX_ENTRIES_IN_PROMPT'), 'No MAX_ENTRIES_IN_PROMPT constant');
  assert(content.includes('.slice(-MAX_ENTRIES_IN_PROMPT)'), 'Not slicing to last N entries');
});

test('violations-memory.mts formats as "Past violations" header', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('Past violations'), 'Missing "Past violations" header in format');
  assert(content.includes('learn from these'), 'Missing learning instruction in format');
});

test('violations-memory.mts is fail-safe (returns empty on missing file)', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('if (!existsSync(VIOLATIONS_FILE)) return ""'), 'Not fail-safe on missing file');
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
