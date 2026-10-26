#!/usr/bin/env node
/**
 * Eval: violations-memory defer support
 *
 * Verifies the violations-memory module supports deferred violations —
 * items that need human decision rather than automated fixing.
 *
 * This is a universal mechanism: any gate (review, visual-qa, implementer)
 * can defer a finding when rules conflict or when a design decision is needed.
 * Deferred items are surfaced separately in the prompt so implementers know
 * not to touch them, and will be visible in a future human-facing UI.
 *
 * Real-case: the motion-tokens shimmer conflict from djk.1 (spec says slow,
 * T3 says slow = large layout changes) was the first deferred item.
 *
 * Seam: .sandcastle/lib/violations-memory.mts
 * Level: unit
 */
import { readFileSync } from 'node:fs';

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

const src = readFileSync('.sandcastle/lib/violations-memory.mts', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// Interface: ViolationEntry supports defer status
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'interface: status field exists',
  src.includes('status?:') || src.includes('status :'),
  'ViolationEntry must have an optional status field',
);

assert(
  'interface: status is typed (not just string)',
  src.includes('"defer"') && src.includes('"violation"'),
  'status must be a union type with "defer" and "violation" values',
);

assert(
  'interface: reason field exists',
  src.includes('reason?:') || src.includes('reason :'),
  'ViolationEntry must have an optional reason field for deferred items',
);

// ═══════════════════════════════════════════════════════════════════════════
// Formatting: violations and deferred items are separated
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'format: filters violations (status !== defer)',
  src.includes('status !== "defer"') || src.includes("status !== 'defer'"),
  'loadViolationsMemory must separate violations from deferred items',
);

assert(
  'format: identifies deferred (status === defer)',
  src.includes('status === "defer"') || src.includes("status === 'defer'"),
  'loadViolationsMemory must identify deferred items',
);

assert(
  'format: deferred section has human-facing header',
  src.includes('Deferred') || src.includes('deferred'),
  'Deferred items must have a distinct section header',
);

assert(
  'format: deferred section tells implementer not to touch',
  src.includes('Do not attempt') || src.includes('do not') || src.includes('human'),
  'Deferred section must instruct implementer to leave these items alone',
);

assert(
  'format: deferred items show reason',
  src.includes('.reason'),
  'Deferred items must display their reason in the formatted output',
);

// ═══════════════════════════════════════════════════════════════════════════
// Real-case validation: violations.jsonl has well-formed entries
// ═══════════════════════════════════════════════════════════════════════════

const jsonl = readFileSync('.sandcastle/violations.jsonl', 'utf8');
const lines = jsonl.trim().split('\n').filter(Boolean);
const entries = lines.map(l => JSON.parse(l));

const deferEntries = entries.filter(e => e.status === 'defer');

assert(
  'real-case: defer entries exist',
  deferEntries.length > 0,
  'violations.jsonl must have at least one defer entry to validate the mechanism',
);

assert(
  'real-case: every defer entry has a reason',
  deferEntries.every(e => typeof e.reason === 'string' && e.reason.length > 20),
  'Every defer entry must have a substantive reason explaining why it was deferred',
);

assert(
  'real-case: every defer entry has standard fields',
  deferEntries.every(e => e.ts && e.issueId && e.ruleId && e.file && e.gate),
  'Defer entries must have all standard violation fields (ts, issueId, ruleId, file, gate)',
);

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
