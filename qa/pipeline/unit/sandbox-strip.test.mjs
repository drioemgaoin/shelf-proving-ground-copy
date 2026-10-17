#!/usr/bin/env node
/**
 * RED/GREEN tests for the sandbox CLAUDE.md stripping hook.
 *
 * RED:   CLAUDE.md contains ~800 tokens of Beads tracker and Agent skills
 *        content that is irrelevant to the sandboxed implementer agent.
 * GREEN: The sed commands in sandbox.mts strip the Beads block and Agent
 *        skills section while preserving all other content.
 *
 * Seam: .sandcastle/lib/sandbox.mts → createHooks() sed commands
 * Level: unit
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const CLAUDE_MD = 'CLAUDE.md';
const original = readFileSync(CLAUDE_MD, 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// RED: CLAUDE.md contains Beads block and Agent skills section
// ═══════════════════════════════════════════════════════════════════════════

assert(
  'RED: CLAUDE.md contains BEGIN BEADS marker',
  original.includes('<!-- BEGIN BEADS'),
  'CLAUDE.md must have the Beads integration block to strip',
);

assert(
  'RED: CLAUDE.md contains END BEADS marker',
  original.includes('<!-- END BEADS'),
  'CLAUDE.md must have the closing Beads marker',
);

assert(
  'RED: CLAUDE.md contains Agent skills section',
  original.includes('## Agent skills'),
  'CLAUDE.md must have the Agent skills section to strip',
);

// Count Beads-specific content that's irrelevant inside sandbox
const beadsStart = original.indexOf('<!-- BEGIN BEADS');
const beadsEnd = original.indexOf('<!-- END BEADS');
const beadsBlock = original.slice(beadsStart, beadsEnd + original.slice(beadsEnd).indexOf('\n') + 1);

assert(
  'RED: Beads block is non-trivial (>500 chars)',
  beadsBlock.length > 500,
  `Expected >500 chars, got ${beadsBlock.length}`,
);

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: sed commands strip the right content
// ═══════════════════════════════════════════════════════════════════════════

// Copy to temp file and run the exact sed commands from sandbox.mts
const tmpFile = join(tmpdir(), `claude-md-strip-test-${process.pid}.md`);
copyFileSync(CLAUDE_MD, tmpFile);

// These are the EXACT commands from sandbox.mts createHooks()
execSync(
  `sed -i.bak '/<!-- BEGIN BEADS/,/<!-- END BEADS/d' ${tmpFile} && ` +
  `sed -i.bak '/^## Agent skills$/,$d' ${tmpFile} && ` +
  `rm -f ${tmpFile}.bak`,
);

const stripped = readFileSync(tmpFile, 'utf8');

// Clean up
try { unlinkSync(tmpFile); } catch {}

// Beads block must be gone
assert(
  'GREEN: BEGIN BEADS marker removed',
  !stripped.includes('<!-- BEGIN BEADS'),
  'Beads start marker must not survive stripping',
);

assert(
  'GREEN: END BEADS marker removed',
  !stripped.includes('<!-- END BEADS'),
  'Beads end marker must not survive stripping',
);

assert(
  'GREEN: Beads Quick Reference removed',
  !stripped.includes('### Quick Reference'),
  'Beads Quick Reference section must not survive stripping',
);

assert(
  'GREEN: Agent Context Profiles removed',
  !stripped.includes('Agent Context Profiles'),
  'Agent Context Profiles section must not survive stripping',
);

assert(
  'GREEN: Session Completion removed',
  !stripped.includes('Session Completion'),
  'Session Completion protocol must not survive stripping',
);

// Agent skills section must be gone
assert(
  'GREEN: Agent skills heading removed',
  !stripped.includes('## Agent skills'),
  'Agent skills section must not survive stripping',
);

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: essential content preserved
// ═══════════════════════════════════════════════════════════════════════════

const required = [
  ['## Product', 'Product section'],
  ['## Stack and commands', 'Stack section'],
  ['npm run dev', 'Dev command'],
  ['## Conventions the tests rely on', 'Conventions section'],
  ['## How work happens', 'How work happens section'],
  ['## UI rules', 'UI rules section'],
  ['ui-base.md', 'ui-base reference'],
];

for (const [text, label] of required) {
  assert(
    `GREEN: preserved — ${label}`,
    stripped.includes(text),
    `"${text}" must survive stripping`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: meaningful size reduction
// ═══════════════════════════════════════════════════════════════════════════

const reduction = 1 - stripped.length / original.length;
assert(
  'GREEN: ≥25% size reduction',
  reduction >= 0.25,
  `Only ${(reduction * 100).toFixed(1)}% reduction — expected ≥25%`,
);

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
