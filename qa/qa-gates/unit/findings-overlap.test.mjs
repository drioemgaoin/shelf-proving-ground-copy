#!/usr/bin/env node
/**
 * TGF-2: findingsOverlap — oscillation detection
 *
 * findingsOverlap(prev, curr) detects when consecutive gate rounds raise
 * the same findings (same file + similar description), indicating the
 * reviewer and fixer are fighting. Reimplements qa-gates.mts:182-225.
 */

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

// --- Reimplementation (mirrors qa-gates.mts:182-225) ---

function findingsOverlap(prev, curr) {
  const normalize = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const similarity = (a, b) => {
    const setA = new Set(a.split(' ').filter((w) => w.length > 2));
    const setB = new Set(b.split(' ').filter((w) => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let overlap = 0;
    for (const w of setA) { if (setB.has(w)) overlap++; }
    return overlap / Math.min(setA.size, setB.size);
  };

  const extract = (text) => {
    const findings = [];
    for (const m of text.matchAll(/^- `?(src\/[^\s:]+)[:\s\d-]*\s*[—–-]\s*(.+)/gm)) {
      findings.push({ file: m[1], desc: normalize(m[2]) });
    }
    return findings;
  };

  const prevFindings = extract(prev);
  const currFindings = extract(curr);
  let matches = 0;
  for (const cf of currFindings) {
    for (const pf of prevFindings) {
      if (cf.file === pf.file && similarity(cf.desc, pf.desc) > 0.5) {
        matches++;
        break;
      }
    }
  }
  return currFindings.length > 0 && matches / currFindings.length > 0.5;
}

// --- Tests ---

test('TGF-2a: overlapping findings (same file + same desc) → true', () => {
  const prev = '- src/App.tsx:10 — Missing aria-label on button\n- src/Card.tsx:5 — Color contrast too low';
  const curr = '- src/App.tsx:10 — Missing aria-label on button\n- src/Card.tsx:5 — Color contrast too low';
  assert(findingsOverlap(prev, curr) === true, 'Expected true for identical findings');
});

test('TGF-2b: non-overlapping findings (different files) → false', () => {
  const prev = '- src/App.tsx:10 — Missing aria-label on button';
  const curr = '- src/Header.tsx:3 — Font size below minimum';
  assert(findingsOverlap(prev, curr) === false, 'Expected false for different files');
});

test('TGF-2c: same file, different description → false', () => {
  const prev = '- src/App.tsx:10 — Missing aria-label on button';
  const curr = '- src/App.tsx:10 — Font size below minimum threshold';
  assert(findingsOverlap(prev, curr) === false, 'Expected false for same file but unrelated descriptions');
});

test('TGF-2d: empty inputs → false', () => {
  assert(findingsOverlap('', '') === false, 'Expected false for both empty');
  assert(findingsOverlap('- src/App.tsx:10 — Missing label', '') === false, 'Expected false for empty curr');
  assert(findingsOverlap('', '- src/App.tsx:10 — Missing label') === false, 'Expected false for empty prev (no match possible)');
});

test('TGF-2e: boundary — exactly 50% match ratio → false (>50% required)', () => {
  // 2 current findings, 1 matches → 50% exactly → should be false
  const prev = '- src/App.tsx:10 — Missing aria-label on button';
  const curr = '- src/App.tsx:10 — Missing aria-label on button\n- src/Header.tsx:3 — Font size below minimum';
  assert(findingsOverlap(prev, curr) === false, 'Expected false at exactly 50% (threshold is >50%)');
});

test('TGF-2f: just above 50% match ratio → true', () => {
  // 3 current findings, 2 match → 66.7% > 50% → true
  const prev = [
    '- src/App.tsx:10 — Missing aria-label on button',
    '- src/Card.tsx:5 — Color contrast too low',
  ].join('\n');
  const curr = [
    '- src/App.tsx:10 — Missing aria-label on button',
    '- src/Card.tsx:5 — Color contrast too low',
    '- src/Header.tsx:3 — Font size below minimum',
  ].join('\n');
  assert(findingsOverlap(prev, curr) === true, 'Expected true at 66.7% match ratio');
});

// --- Report ---
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(f); console.log(''); }
console.log(`findingsOverlap tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
