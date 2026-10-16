#!/usr/bin/env node
/**
 * TGF-7: Ticket selection — Sandcastle label required
 *
 * LIST_READY_COMMAND must include --label=Sandcastle so the pipeline only
 * picks up tickets tagged for automated building — not specs, manual tasks,
 * or human-only work.
 *
 * Seam: LIST_READY_COMMAND constant (string inspection).
 * Source: .sandcastle/config/tracker.mts:8
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
// Read the constant from source (mirrors .sandcastle/config/tracker.mts:8)
// We read the file as text and extract the value to avoid .mts import issues.
// ---------------------------------------------------------------------------

const trackerSrc = readFileSync('.sandcastle/config/tracker.mts', 'utf8');

function extractExport(src, name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not extract ${name} from tracker.mts`);
  return m[1];
}

const LIST_READY_COMMAND = extractExport(trackerSrc, 'LIST_READY_COMMAND');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('TGF-7a: LIST_READY_COMMAND includes --label=Sandcastle', () => {
  assert(
    LIST_READY_COMMAND.includes('--label=Sandcastle'),
    `Expected --label=Sandcastle in: "${LIST_READY_COMMAND}"`
  );
});

test('TGF-7b: LIST_READY_COMMAND label value is exactly Sandcastle (not substring)', () => {
  // Guard against --label=SandcastleFoo or --label=NotSandcastle
  const match = LIST_READY_COMMAND.match(/--label=(\S+)/);
  assert(match !== null, `No --label flag found in: "${LIST_READY_COMMAND}"`);
  assert(
    match[1] === 'Sandcastle',
    `Expected label value "Sandcastle", got "${match[1]}"`
  );
});

// ---------------------------------------------------------------------------
// TGF-8: Label policy — additive-only enforcement
//
// LABEL_TASK_COMMAND must use "label add", never "label set".
// If changed to "set", existing labels (bug, settled, Sandcastle) are wiped.
// Spec: "Pipeline labels are additive-only" (line 824)
// Source: .sandcastle/config/tracker.mts:13
// ---------------------------------------------------------------------------

const LABEL_TASK_COMMAND = extractExport(trackerSrc, 'LABEL_TASK_COMMAND');

test('TGF-8a: LABEL_TASK_COMMAND uses additive labeling (label add)', () => {
  assert(
    LABEL_TASK_COMMAND.includes('label add'),
    `Expected "label add" in: "${LABEL_TASK_COMMAND}"`
  );
});

test('TGF-8b: LABEL_TASK_COMMAND does not use destructive labeling (label set)', () => {
  assert(
    !LABEL_TASK_COMMAND.includes('label set'),
    `Found "label set" (destructive) in: "${LABEL_TASK_COMMAND}"`
  );
});

// --- Report ---
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`tracker-commands tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
