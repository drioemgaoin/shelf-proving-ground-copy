#!/usr/bin/env node
/**
 * RED/GREEN tests for ticket distillation.
 *
 * Each test verifies that tracker-specific noise is removed while signal
 * (spec body, acceptance criteria, test commands) is preserved.
 *
 * RED:   old compressIssueDetails (whitespace-only cleanup) preserves noise
 * GREEN: new distillBeads / distillMarkdownTicket strips it
 *
 * Seam: .sandcastle/lib/distill.mts (pure functions, no I/O)
 * Level: unit
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
// Mirror the OLD compressIssueDetails (main.mts pre-change) for RED checks
// ---------------------------------------------------------------------------

function oldCompress(raw) {
  return raw
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------
// Mirror distill functions from .sandcastle/lib/distill.mts — EXACTLY.
// This matches the project test pattern (no TS loader, functions mirrored).
// ---------------------------------------------------------------------------

function distillBeads(raw) {
  const lines = raw.split("\n");
  const out = [];
  let skip = false;
  let inDescSubsection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    if (/^[○●✓✗] .+\[P\d+ · \w+\]/.test(trimmed)) continue;
    if (/^Created by: .+ · Type: /.test(trimmed)) continue;
    if (/^Created: \d{4}-\d{2}-\d{2} · Updated: \d{4}-\d{2}-\d{2}/.test(trimmed)) continue;
    if (/^DESCRIPTION$/.test(trimmed)) continue;
    if (/^💡 Tip:/.test(trimmed)) continue;

    if (/^LABELS:/.test(trimmed)) { skip = true; continue; }
    if (/^(?:PARENT|BLOCKS|DEPENDS ON)$/.test(trimmed)) { skip = true; continue; }

    if (skip) {
      if (trimmed === "") continue;
      if (/^[ \t]/.test(line) || /^[↑←→✓○●✗]/.test(trimmed)) continue;
      skip = false;
    }

    if (/^\s+## Parent\b/.test(line)) { inDescSubsection = true; continue; }
    if (/^\s+## Blocked by\b/.test(line)) { inDescSubsection = true; continue; }
    if (inDescSubsection) {
      if (/^\s+## /.test(line) && !/^\s+## Parent\b/.test(line) && !/^\s+## Blocked by\b/.test(line)) {
        inDescSubsection = false;
      } else if (/^\S/.test(line) && trimmed !== "") {
        inDescSubsection = false;
      } else {
        continue;
      }
    }

    out.push(line);
  }
  return out.join("\n");
}

function distillMarkdownTicket(raw) {
  return raw
    .replace(/^# \d+:.*$/m, "")
    .replace(/^\*\*Blocked by:\*\*.*$/m, "")
    .replace(/^\*\*Status:\*\*.*$/m, "");
}

function distillIssueDetails(raw, distiller) {
  const afterDistill = distiller ? distiller(raw) : raw;
  return afterDistill
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Realistic test fixtures
// ---------------------------------------------------------------------------

// Full bd show output — modeled after actual shelf-proving-ground-djk.1
const BEADS_TICKET = [
  '○ shelf-proving-ground-djk.1 · Shelf grid: page load with grid and skeletons   [P2 · OPEN]',
  'Created by: drioemgaoin · Type: task                                              ',
  'Created: 2026-09-30 · Updated: 2026-10-17                                        ',
  '',
  'DESCRIPTION',
  '',
  '  ## Parent                                                                   ',
  '                                                                              ',
  '  shelf-proving-ground-djk (Shelf grid spec)                                  ',
  '                                                                              ',
  '  ## What to build                                                            ',
  '                                                                              ',
  '  When the page loads, the user sees a fluid responsive card grid of all their',
  '  books in newest-first order, with a filter chip bar above it and skeleton   ',
  '  placeholders while data is loading.                                         ',
  '                                                                              ',
  '  ## Acceptance criteria                                                      ',
  '                                                                              ',
  '  [ ] Shelf grid: shows all books by default                                  ',
  '  [ ] Shelf grid: newest-first order                                          ',
  '  [ ] Shelf grid: "All" chip is selected on load                              ',
  '                                                                              ',
  '  ## Tests to turn green                                                      ',
  '                                                                              ',
  '  File: e2e/acceptance/shelf-grid.spec.ts                                     ',
  '  Run: npx playwright test --grep "@djk.1" --grep-invert "@visual"            ',
  '                                                                              ',
  '  ## Blocked by                                                               ',
  '                                                                              ',
  '  None (can start immediately).                                               ',
  '',
  '',
  '',
  'LABELS: Sandcastle, ready-for-agent, ticket',
  '',
  'PARENT',
  '  ↑ ○ shelf-proving-ground-djk: Shelf grid P2',
  '',
  'BLOCKS',
  '  ← ○ shelf-proving-ground-djk.2: Shelf grid: filter chips P2',
  '  ← ○ shelf-proving-ground-djk.3: Shelf grid: stagger entrance animation P2',
].join('\n');

// Beads output with DEPENDS ON section and tip line
const BEADS_TICKET_WITH_DEPENDS = [
  '○ shelf-proving-ground-2s9 · Error state   [P2 · OPEN]',
  'Created by: drioemgaoin · Type: feature',
  'Created: 2026-09-30 · Updated: 2026-09-30',
  '',
  'DESCRIPTION',
  '',
  '  Full-page error screen with message and Try Again button (reloads shelf),   ',
  '  shown when fixture=error.                                                   ',
  '',
  '',
  '',
  'DEPENDS ON',
  '  → ✓ shelf-proving-ground-513: Fixture system P2',
  '',
  '',
  '💡 Tip: Install the beads plugin for automatic workflow context, or run \'bd setup claude\' for CLI-only mode',
].join('\n');

// Markdown ticket file content
const MARKDOWN_TICKET = [
  '# 01: T1 enforcement end-to-end — bad write gets blocked',
  '',
  '**What to build:** When an agent writes code that violates a T1 rule, the hook blocks it.',
  '',
  '**Blocked by:** None (can start immediately).',
  '',
  '**Status:** ready-for-agent',
  '',
  '- [ ] `discoverRulesFiles()` scans `.claude/rules/`',
  '- [ ] `parseEnforcementBlocks()` extracts enforcement fences',
  '- [ ] Tests via `scripts/test-hooks.mjs` harness pattern',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════
// Test A: beads header line removed
// ═══════════════════════════════════════════════════════════════════════════

test('A: distillBeads removes header line', () => {
  const old = oldCompress(BEADS_TICKET);
  // RED: old compression preserves the header
  assert(old.includes('○ shelf-proving-ground-djk.1'), 'precondition: old preserves header');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!distilled.includes('○ shelf-proving-ground-djk.1'), 'header line must be removed');
  assert(!(/\[P\d+ · \w+\]/.test(distilled)), 'priority/status badge must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test B: beads metadata + timestamps removed
// ═══════════════════════════════════════════════════════════════════════════

test('B: distillBeads removes metadata and timestamps', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(old.includes('Created by:'), 'precondition: old preserves Created by');
  assert(old.includes('Created: 2026'), 'precondition: old preserves timestamps');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!distilled.includes('Created by:'), 'Created by line must be removed');
  assert(!(/^Created: \d{4}/m.test(distilled)), 'timestamps line must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test C: beads DESCRIPTION label removed
// ═══════════════════════════════════════════════════════════════════════════

test('C: distillBeads removes DESCRIPTION section header', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(/^DESCRIPTION$/m.test(old), 'precondition: old preserves DESCRIPTION');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!(/^DESCRIPTION$/m.test(distilled)), 'standalone DESCRIPTION header must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test D: beads ## Parent subsection removed
// ═══════════════════════════════════════════════════════════════════════════

test('D: distillBeads removes ## Parent subsection from description', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(old.includes('## Parent'), 'precondition: old preserves ## Parent');
  assert(old.includes('Shelf grid spec'), 'precondition: old preserves parent ref');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!distilled.includes('## Parent'), '## Parent heading must be removed');
  assert(!distilled.includes('Shelf grid spec'), 'parent reference text must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test E: beads ## Blocked by subsection removed
// ═══════════════════════════════════════════════════════════════════════════

test('E: distillBeads removes ## Blocked by subsection from description', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(old.includes('## Blocked by'), 'precondition: old preserves ## Blocked by');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!distilled.includes('## Blocked by'), '## Blocked by heading must be removed');
  assert(!distilled.includes('can start immediately'), 'blocked-by body must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test F: beads LABELS/PARENT/BLOCKS/DEPENDS ON sections removed
// ═══════════════════════════════════════════════════════════════════════════

test('F: distillBeads removes LABELS section', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(old.includes('LABELS:'), 'precondition: old preserves LABELS');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!distilled.includes('LABELS:'), 'LABELS section must be removed');
});

test('F: distillBeads removes PARENT section', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(/^PARENT$/m.test(old), 'precondition: old preserves PARENT');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!(/^PARENT$/m.test(distilled)), 'PARENT section header must be removed');
  assert(!distilled.includes('↑ ○'), 'PARENT content must be removed');
});

test('F: distillBeads removes BLOCKS section', () => {
  const old = oldCompress(BEADS_TICKET);
  assert(/^BLOCKS$/m.test(old), 'precondition: old preserves BLOCKS');

  const distilled = distillBeads(BEADS_TICKET);
  assert(!(/^BLOCKS$/m.test(distilled)), 'BLOCKS section header must be removed');
  assert(!distilled.includes('← ○'), 'BLOCKS content must be removed');
});

test('F: distillBeads removes DEPENDS ON section', () => {
  const old = oldCompress(BEADS_TICKET_WITH_DEPENDS);
  assert(/^DEPENDS ON$/m.test(old), 'precondition: old preserves DEPENDS ON');

  const distilled = distillBeads(BEADS_TICKET_WITH_DEPENDS);
  assert(!(/^DEPENDS ON$/m.test(distilled)), 'DEPENDS ON section header must be removed');
  assert(!distilled.includes('→ ✓'), 'DEPENDS ON content must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test G: beads signal preserved — spec body survives distillation
// ═══════════════════════════════════════════════════════════════════════════

test('G: distillBeads preserves spec signal', () => {
  const distilled = distillBeads(BEADS_TICKET);

  const requiredSignal = [
    '## What to build',
    'fluid responsive card grid',
    '## Acceptance criteria',
    'shows all books by default',
    'newest-first order',
    '"All" chip is selected on load',
    '## Tests to turn green',
    'npx playwright test --grep "@djk.1"',
    'e2e/acceptance/shelf-grid.spec.ts',
  ];

  for (const text of requiredSignal) {
    assert(distilled.includes(text), `signal "${text.slice(0, 40)}..." must survive distillation`);
  }
});

test('G: distillBeads preserves signal in DEPENDS ON variant', () => {
  const distilled = distillBeads(BEADS_TICKET_WITH_DEPENDS);
  assert(distilled.includes('Full-page error screen'), 'description body must survive');
  assert(distilled.includes('fixture=error'), 'fixture reference must survive');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test H: markdown ticket noise removed
// ═══════════════════════════════════════════════════════════════════════════

test('H: distillMarkdownTicket removes title header', () => {
  const old = oldCompress(MARKDOWN_TICKET);
  assert(old.includes('# 01:'), 'precondition: old preserves title header');

  const distilled = distillMarkdownTicket(MARKDOWN_TICKET);
  assert(!(/^# \d+:/m.test(distilled)), '# N: Title header must be removed');
});

test('H: distillMarkdownTicket removes Blocked by line', () => {
  const old = oldCompress(MARKDOWN_TICKET);
  assert(old.includes('**Blocked by:**'), 'precondition: old preserves Blocked by');

  const distilled = distillMarkdownTicket(MARKDOWN_TICKET);
  assert(!distilled.includes('**Blocked by:**'), '**Blocked by:** line must be removed');
});

test('H: distillMarkdownTicket removes Status line', () => {
  const old = oldCompress(MARKDOWN_TICKET);
  assert(old.includes('**Status:**'), 'precondition: old preserves Status');

  const distilled = distillMarkdownTicket(MARKDOWN_TICKET);
  assert(!distilled.includes('**Status:**'), '**Status:** line must be removed');
});

test('H: distillMarkdownTicket preserves acceptance criteria', () => {
  const distilled = distillMarkdownTicket(MARKDOWN_TICKET);
  assert(distilled.includes('discoverRulesFiles()'), 'criteria must survive');
  assert(distilled.includes('parseEnforcementBlocks()'), 'criteria must survive');
  assert(distilled.includes('What to build'), 'spec body must survive');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test I: structural compression still applied by distillIssueDetails
// ═══════════════════════════════════════════════════════════════════════════

test('I: distillIssueDetails applies structural compression', () => {
  const withPadding = 'line one   \n\n\n\nline two\t  \n';
  const result = distillIssueDetails(withPadding);
  assert(!(/[ \t]+$/m.test(result)), 'trailing whitespace must be stripped');
  assert(!result.includes('\n\n\n'), 'triple blank lines must be collapsed');
  assert(result.includes('line one'), 'content must survive');
  assert(result.includes('line two'), 'content must survive');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test J: no distiller = identity + compression (backward compat)
// ═══════════════════════════════════════════════════════════════════════════

test('J: distillIssueDetails without distiller only does structural cleanup', () => {
  const raw = 'DESCRIPTION\n\nsome text   \n\n\n\nmore text\n';
  const result = distillIssueDetails(raw);
  // Without a distiller, DESCRIPTION header is preserved (only structural cleanup)
  assert(result.includes('DESCRIPTION'), 'without distiller, semantic content preserved');
  assert(!(/[ \t]+$/m.test(result)), 'structural: trailing whitespace stripped');
  assert(!result.includes('\n\n\n'), 'structural: blank lines collapsed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test K: beads tips removed
// ═══════════════════════════════════════════════════════════════════════════

test('K: distillBeads removes beads tip lines', () => {
  const old = oldCompress(BEADS_TICKET_WITH_DEPENDS);
  assert(old.includes('💡 Tip:'), 'precondition: old preserves tip');

  const distilled = distillBeads(BEADS_TICKET_WITH_DEPENDS);
  assert(!distilled.includes('💡 Tip:'), 'beads tip line must be removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Test L: meaningful size reduction achieved
// ═══════════════════════════════════════════════════════════════════════════

test('L: beads distillation achieves >= 35% reduction vs raw', () => {
  const distilled = distillIssueDetails(BEADS_TICKET, distillBeads);
  const reduction = 1 - distilled.length / BEADS_TICKET.length;
  assert(
    reduction >= 0.35,
    `Expected >= 35% reduction, got ${(reduction * 100).toFixed(1)}%`,
  );
});

test('L: beads distillation outperforms old compress by >= 15pp', () => {
  const oldResult = oldCompress(BEADS_TICKET);
  const newResult = distillIssueDetails(BEADS_TICKET, distillBeads);
  const oldReduction = 1 - oldResult.length / BEADS_TICKET.length;
  const newReduction = 1 - newResult.length / BEADS_TICKET.length;
  const improvement = newReduction - oldReduction;
  assert(
    improvement >= 0.15,
    `Expected >= 15pp improvement over old compress, got ${(improvement * 100).toFixed(1)}pp ` +
    `(old: ${(oldReduction * 100).toFixed(1)}%, new: ${(newReduction * 100).toFixed(1)}%)`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: distill.mts is wired into main.mts and tracker.mts
// ═══════════════════════════════════════════════════════════════════════════

test('Integration: main.mts imports distillIssueDetails', () => {
  const mainSrc = readFileSync('.sandcastle/main.mts', 'utf8');
  assert(mainSrc.includes('distillIssueDetails'), 'main.mts must use distillIssueDetails');
});

test('Integration: main.mts no longer defines compressIssueDetails', () => {
  const mainSrc = readFileSync('.sandcastle/main.mts', 'utf8');
  assert(
    !mainSrc.includes('function compressIssueDetails'),
    'compressIssueDetails should be removed from main.mts (replaced by distill module)',
  );
});

test('Integration: tracker.mts exports DISTILL', () => {
  const trackerSrc = readFileSync('.sandcastle/config/tracker.mts', 'utf8');
  assert(trackerSrc.includes('DISTILL'), 'tracker.mts must export DISTILL');
});

test('Integration: replay-review uses distill', () => {
  const src = readFileSync('.sandcastle/replay/replay-review.mts', 'utf8');
  assert(
    src.includes('distillIssueDetails') || src.includes('distillBeads'),
    'replay-review.mts must use distill functions',
  );
});

test('Integration: replay-visual-qa uses distill', () => {
  const src = readFileSync('.sandcastle/replay/replay-visual-qa.mts', 'utf8');
  assert(
    src.includes('distillIssueDetails') || src.includes('distillBeads'),
    'replay-visual-qa.mts must use distill functions',
  );
});

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
