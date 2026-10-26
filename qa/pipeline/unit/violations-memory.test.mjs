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

test('VIOLATIONS_MEMORY is before ESCALATION in prompt', () => {
  // Violations must be visible before the agent reaches the escalation/completion
  // sections. COLD START is in the static prefix (for caching), so we check
  // against ESCALATION which follows the dynamic CONTEXT block.
  const content = readFileSync('.sandcastle/prompts/implementer.prompt.md', 'utf8');
  const vmIdx = content.indexOf('{{VIOLATIONS_MEMORY}}');
  const escIdx = content.indexOf('# ESCALATION');
  assert(vmIdx >= 0, 'VIOLATIONS_MEMORY not found');
  assert(escIdx >= 0, 'ESCALATION not found');
  assert(vmIdx < escIdx, 'VIOLATIONS_MEMORY should appear before ESCALATION');
});

test('phases.mts imports loadViolationsMemory', () => {
  const content = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  assert(content.includes('loadViolationsMemory'), 'phases.mts does not import loadViolationsMemory');
});

test('phases.mts passes VIOLATIONS_MEMORY to implementer args', () => {
  const content = readFileSync('.sandcastle/lib/phases.mts', 'utf8');
  assert(content.includes('VIOLATIONS_MEMORY: loadViolationsMemory()'), 'phases.mts does not pass VIOLATIONS_MEMORY to args');
});

test('gates.mts imports recordViolation and loadViolationsMemory', () => {
  const content = readFileSync('.sandcastle/lib/gates.mts', 'utf8');
  assert(content.includes('recordViolation'), 'gates.mts does not import recordViolation');
  assert(content.includes('loadViolationsMemory'), 'gates.mts does not import loadViolationsMemory');
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

test('violations-memory.mts groups by ruleId and direction', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('MAX_CHARS_IN_PROMPT'), 'No MAX_CHARS_IN_PROMPT budget constant');
  assert(content.includes('groupViolations'), 'No groupViolations function');
  assert(content.includes('normalizeWrote'), 'No normalizeWrote fallback for entries without direction');
});

test('violations-memory.mts supports direction field in ViolationEntry', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('direction?:'), 'No direction field on ViolationEntry');
});

test('violations-memory.mts supports filterRuleIds parameter', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('filterRuleIds'), 'loadViolationsMemory does not accept filterRuleIds');
});

test('violations-memory.mts formats as "Past violations" header', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('Past violations'), 'Missing "Past violations" header in format');
  assert(content.includes('do not repeat'), 'Missing "do not repeat" in format');
});

test('violations-memory.mts is fail-safe (returns empty on missing file)', () => {
  const content = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');
  assert(content.includes('if (!existsSync(VIOLATIONS_FILE)) return ""'), 'Not fail-safe on missing file');
});

test('fixer prompt template includes {{VIOLATIONS_MEMORY}}', () => {
  const content = readFileSync('.sandcastle/prompts/fixer.prompt.md', 'utf8');
  assert(content.includes('{{VIOLATIONS_MEMORY}}'), '{{VIOLATIONS_MEMORY}} not in fixer prompt');
});

test('gates.mts builds fixer args with filtered VIOLATIONS_MEMORY', () => {
  const content = readFileSync('.sandcastle/lib/gates.mts', 'utf8');
  assert(content.includes('extractRuleIdsFromFindings'), 'gates.mts does not extract ruleIds for fixer filtering');
  assert(content.includes('VIOLATIONS_MEMORY: violationsMemory'), 'gates.mts does not pass VIOLATIONS_MEMORY to fixer args');
});

test('gates-test-author.mts imports recordViolation', () => {
  const content = readFileSync('.sandcastle/lib/gates-test-author.mts', 'utf8');
  assert(content.includes('recordViolation'), 'gates-test-author.mts does not import recordViolation');
});

test('gates-test-author.mts records technical-obstacle compromises', () => {
  const content = readFileSync('.sandcastle/lib/gates-test-author.mts', 'utf8');
  assert(content.includes('technical-obstacle'), 'gates-test-author.mts does not parse technical-obstacle compromises');
  assert(content.includes('dropped-coverage'), 'gates-test-author.mts does not tag direction as dropped-coverage');
});

test('all agent prompts have scope-reduction behavioral rule', () => {
  const prompts = ['implementer', 'fixer', 'reviewer', 'visual-qa', 'test-author'];
  for (const p of prompts) {
    const content = readFileSync(`.sandcastle/prompts/${p}.prompt.md`, 'utf8');
    assert(
      content.includes('Never reduce scope and report success') || content.includes('Never drop coverage'),
      `${p}.prompt.md missing behavioral rule`
    );
  }
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
