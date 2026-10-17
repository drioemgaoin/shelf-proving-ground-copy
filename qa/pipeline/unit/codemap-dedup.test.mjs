#!/usr/bin/env node
/**
 * RED/GREEN tests for codemap-gen.py _strip_duplicate_file_blocks.
 *
 * RED:   Without dedup, multi-scope codemap repeats the same file block N times
 *        when N scopes auto-expand to the same directory.
 * GREEN: With dedup, each file block appears exactly once; subsequent occurrences
 *        are stripped and auto-expand comments are cleaned.
 *
 * The JS function below is a faithful port of the Python original — same regex,
 * same split/filter/join logic. Changes to the Python must be mirrored here.
 *
 * Seam: codemap-tool/codemap-gen.py → _strip_duplicate_file_blocks()
 * Level: unit
 */

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

/**
 * JS port of _strip_duplicate_file_blocks from codemap-gen.py.
 * Must match the Python implementation exactly:
 *   1. Split on "## File: " at line start
 *   2. Skip blocks whose file path is already in `seen`
 *   3. Strip orphaned auto-expand comments
 */
function stripDuplicateFileBlocks(content, seen) {
  const blocks = content.split(/(?=^## File: )/m);
  const kept = [];
  for (const block of blocks) {
    const m = block.match(/^## File: (.+)/);
    if (m) {
      const path = m[1].trim();
      if (seen.has(path)) continue;
      seen.add(path);
    }
    kept.push(block);
  }
  let result = kept.join('');
  result = result.replace(/<!-- auto-expanded scope: [^\n]+ -->\n?/g, '');
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// RED: Without dedup, duplicate file blocks survive
// ═══════════════════════════════════════════════════════════════════════════

{
  const scope1 = [
    '<!-- auto-expanded scope: src/App.tsx → src/** -->',
    '## File: src/api.ts',
    '```typescript',
    'export function getBooks(): Promise<Book[]>',
    '```',
    '',
    '## File: src/App.tsx',
    '```typescript',
    'export function App(): React.JSX.Element',
    '```',
  ].join('\n');

  const scope2 = [
    '<!-- auto-expanded scope: src/main.tsx → src/** -->',
    '## File: src/api.ts',
    '```typescript',
    'export function getBooks(): Promise<Book[]>',
    '```',
    '',
    '## File: src/App.tsx',
    '```typescript',
    'export function App(): React.JSX.Element',
    '```',
  ].join('\n');

  // RED: naive concatenation produces duplicates
  const naive = scope1 + '\n\n' + scope2;
  const apiCount = (naive.match(/## File: src\/api\.ts/g) || []).length;
  assert(
    'RED: naive concat duplicates api.ts',
    apiCount === 2,
    `Expected 2 occurrences, got ${apiCount}`,
  );

  const appCount = (naive.match(/## File: src\/App\.tsx/g) || []).length;
  assert(
    'RED: naive concat duplicates App.tsx',
    appCount === 2,
    `Expected 2 occurrences, got ${appCount}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: dedup strips second occurrence across calls
// ═══════════════════════════════════════════════════════════════════════════

{
  const scope1 = [
    '<!-- auto-expanded scope: src/App.tsx → src/** -->',
    '## File: src/api.ts',
    '```typescript',
    'export function getBooks(): Promise<Book[]>',
    '```',
    '',
    '## File: src/App.tsx',
    '```typescript',
    'export function App(): React.JSX.Element',
    '```',
  ].join('\n');

  const scope2 = [
    '<!-- auto-expanded scope: src/main.tsx → src/** -->',
    '## File: src/api.ts',
    '```typescript',
    'export function getBooks(): Promise<Book[]>',
    '```',
    '',
    '## File: src/App.tsx',
    '```typescript',
    'export function App(): React.JSX.Element',
    '```',
  ].join('\n');

  const seen = new Set();

  // Pass 1: first scope — both files kept
  const pass1 = stripDuplicateFileBlocks(scope1, seen);
  assert(
    'GREEN: pass 1 keeps api.ts',
    pass1.includes('## File: src/api.ts'),
    'First occurrence of api.ts should be kept',
  );
  assert(
    'GREEN: pass 1 keeps App.tsx',
    pass1.includes('## File: src/App.tsx'),
    'First occurrence of App.tsx should be kept',
  );
  assert(
    'GREEN: pass 1 seen set has both files',
    seen.size === 2,
    `Expected 2 seen files, got ${seen.size}`,
  );

  // Pass 2: second scope with same seen — all files stripped
  const pass2 = stripDuplicateFileBlocks(scope2, seen);
  const apiInPass2 = (pass2.match(/## File: src\/api\.ts/g) || []).length;
  assert(
    'GREEN: pass 2 strips duplicate api.ts',
    apiInPass2 === 0,
    `Expected 0 occurrences in pass 2, got ${apiInPass2}`,
  );
  const appInPass2 = (pass2.match(/## File: src\/App\.tsx/g) || []).length;
  assert(
    'GREEN: pass 2 strips duplicate App.tsx',
    appInPass2 === 0,
    `Expected 0 occurrences in pass 2, got ${appInPass2}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: auto-expand comments stripped when all file blocks are dupes
// ═══════════════════════════════════════════════════════════════════════════

{
  const content = [
    '<!-- auto-expanded scope: src/main.tsx → src/** -->',
    '## File: src/api.ts',
    '```typescript',
    'export function getBooks()',
    '```',
  ].join('\n');

  const seen = new Set(['src/api.ts']);
  const result = stripDuplicateFileBlocks(content, seen);
  assert(
    'GREEN: auto-expand comment stripped with dupe files',
    !result.includes('auto-expanded'),
    'Comment should be stripped when all its file blocks are duplicates',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: unique files across scopes are preserved
// ═══════════════════════════════════════════════════════════════════════════

{
  const scope1 = '## File: src/api.ts\napi content\n';
  const scope2 = '## File: src/App.tsx\napp content\n';

  const seen = new Set();
  stripDuplicateFileBlocks(scope1, seen);
  const pass2 = stripDuplicateFileBlocks(scope2, seen);

  assert(
    'GREEN: unique file in scope 2 preserved',
    pass2.includes('## File: src/App.tsx'),
    'App.tsx is unique and should survive',
  );
  assert(
    'GREEN: seen set accumulates both files',
    seen.size === 2,
    `Expected 2 seen files, got ${seen.size}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: preamble text before first ## File: is preserved
// ═══════════════════════════════════════════════════════════════════════════

{
  const content = [
    '# Codemap',
    '',
    'Some preamble text.',
    '',
    '## File: src/api.ts',
    'content',
  ].join('\n');

  const seen = new Set();
  const result = stripDuplicateFileBlocks(content, seen);
  assert(
    'GREEN: preamble preserved',
    result.includes('# Codemap') && result.includes('Some preamble text.'),
    'Text before first ## File: block must be preserved',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: simulates the real djk.1 scenario — 4x duplication to 1x
// ═══════════════════════════════════════════════════════════════════════════

{
  const makeScope = (name) => [
    `<!-- auto-expanded scope: ${name} → src/** -->`,
    '## File: src/api.ts',
    'api signatures',
    '',
    '## File: src/App.tsx',
    'app signatures',
    '',
    '## File: src/fixtures.ts',
    'fixture signatures',
  ].join('\n');

  const scopes = [
    makeScope('src/App.tsx'),
    makeScope('src/main.tsx'),
    makeScope('src/api.ts'),
    makeScope('src/fixtures.ts'),
  ];

  const seen = new Set();
  const results = scopes.map((s) => stripDuplicateFileBlocks(s, seen));

  // First scope keeps all 3 files
  assert(
    'GREEN: djk.1 scenario — scope 1 has 3 file blocks',
    (results[0].match(/## File:/g) || []).length === 3,
    'First scope should keep all 3 files',
  );

  // Remaining scopes should have 0 file blocks (all dupes)
  for (let i = 1; i < results.length; i++) {
    const count = (results[i].match(/## File:/g) || []).length;
    assert(
      `GREEN: djk.1 scenario — scope ${i + 1} has 0 file blocks`,
      count === 0,
      `Expected 0 file blocks in scope ${i + 1}, got ${count}`,
    );
  }

  // Seen set should have exactly 3 unique files
  assert(
    'GREEN: djk.1 scenario — 3 unique files total',
    seen.size === 3,
    `Expected 3 unique files, got ${seen.size}`,
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
