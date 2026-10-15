#!/usr/bin/env node
/**
 * Pipeline Judge — validates the pipeline output for the shelf-grid spec.
 *
 * Runs 10 checks against the spec file and external tooling (bd, playwright).
 * Exit 0 if all pass, 1 if any fail.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const SPEC_PATH = resolve(ROOT, 'tests/acceptance/shelf-grid/shelf-grid.spec.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TICKET_TAG_RE = /@djk\.(\d+)/g;

/**
 * Parse the spec file and extract every test(...) call with its name and tags.
 * Tags appear as `{ tag: '@foo' }` or `{ tag: ['@foo', '@bar'] }`.
 */
function parseTests(src) {
  const tests = [];

  // Match test('name', ...) or test('name', { tag: ... }, ...)
  // We look for test( followed by a quoted string (the name), then optionally
  // a tag options object before the async function.
  const testCallRe = /\btest\(\s*(?:'([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = testCallRe.exec(src)) !== null) {
    const name = m[1] ?? m[2];
    const startIdx = m.index + m[0].length;

    // Look ahead for a tag options object: { tag: '...' } or { tag: ['...', '...'] }
    // It must appear before the `async` keyword for this test.
    const rest = src.slice(startIdx);
    const asyncIdx = rest.indexOf('async');
    const snippet = asyncIdx >= 0 ? rest.slice(0, asyncIdx) : rest.slice(0, 200);

    const ticketTags = [];
    let tagMatch;
    const tagRe = /@djk\.(\d+)/g;
    while ((tagMatch = tagRe.exec(snippet)) !== null) {
      ticketTags.push(`@djk.${tagMatch[1]}`);
    }

    tests.push({ name, ticketTags });
  }

  return tests;
}

/**
 * Run a shell command, return stdout. Throws on non-zero exit.
 */
function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Count listed tests from `npx playwright test --grep ... --list` output.
 * The --list output has test names indented; we count non-empty lines that
 * look like test entries (lines containing the test name pattern or indented lines
 * after the header). A robust approach: count lines matching the test title pattern.
 */
function countPlaywrightListedTests(grepPattern) {
  const out = run(`npx playwright test --grep "${grepPattern}" --project=desktop --list`);
  // Playwright --list outputs lines like:
  //   [chromium] > file.spec.ts > describe > test name
  // or in some versions just lines with test names.
  // Count lines that contain the spec file name or contain ">" which is the listing format.
  const lines = out.split('\n').filter((l) => l.includes('shelf-grid.spec.ts'));
  return lines.length;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const results = [];

function check(num, label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      results.push({ num, label, pass: true });
    } else {
      results.push({ num, label, pass: false, detail: result });
    }
  } catch (err) {
    results.push({ num, label, pass: false, detail: err.message });
  }
}

const src = readFileSync(SPEC_PATH, 'utf-8');
const tests = parseTests(src);

// Checks 1-3: Tag integrity
check(1, 'Each test has exactly one ticket tag', () => {
  const bad = tests.filter((t) => t.ticketTags.length !== 1);
  if (bad.length > 0) {
    return `${bad.length} test(s) do not have exactly one ticket tag: ${bad.map((t) => `"${t.name}" has ${t.ticketTags.length} tags`).join('; ')}`;
  }
  return true;
});

check(2, 'No orphan tests (zero ticket tags)', () => {
  const orphans = tests.filter((t) => t.ticketTags.length === 0);
  if (orphans.length > 0) {
    return `${orphans.length} orphan test(s): ${orphans.map((t) => `"${t.name}"`).join(', ')}`;
  }
  return true;
});

check(3, 'No double-assigned tests', () => {
  const doubles = tests.filter((t) => t.ticketTags.length > 1);
  if (doubles.length > 0) {
    return doubles.map((t) => `"${t.name}" has ${t.ticketTags.join(' and ')}`).join('; ');
  }
  return true;
});

// Checks 4-6: Ticket descriptions contain "Tests to turn green"
for (const n of [1, 2, 3]) {
  const id = `shelf-proving-ground-djk.${n}`;
  check(3 + n, `bd show ${id} contains "Tests to turn green"`, () => {
    const out = run(`bd show ${id}`);
    if (!out.includes('Tests to turn green')) {
      return `"Tests to turn green" not found in bd show output`;
    }
    return true;
  });
}

// Checks 7-9: Playwright list counts
const expectedCounts = { 1: 16, 2: 5, 3: 5 };
const actualCounts = {};

for (const n of [1, 2, 3]) {
  check(6 + n, `playwright --list @djk.${n} = ${expectedCounts[n]} tests`, () => {
    const count = countPlaywrightListedTests(`@djk\\\\.${n}`);
    actualCounts[n] = count;
    if (count !== expectedCounts[n]) {
      return `expected ${expectedCounts[n]}, got ${count}`;
    }
    return true;
  });
}

// Check 10: Union of all ticket tests = 26
check(10, 'Union of all ticket tests = 26', () => {
  const total = (actualCounts[1] ?? 0) + (actualCounts[2] ?? 0) + (actualCounts[3] ?? 0);
  if (total !== 26) {
    return `expected 26, got ${total}`;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('Pipeline Judge');
console.log('==============');
for (const r of results) {
  const status = r.pass ? 'PASS' : 'FAIL';
  let line = `[${status}] ${r.num}. ${r.label}`;
  if (!r.pass && r.detail) {
    line += ` — ${r.detail}`;
  }
  console.log(line);
}
console.log('==============');

const passed = results.filter((r) => r.pass).length;
console.log(`Result: ${passed}/${results.length} checks passed`);

process.exit(passed === results.length ? 0 : 1);
