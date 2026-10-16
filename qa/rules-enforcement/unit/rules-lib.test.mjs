#!/usr/bin/env node
/**
 * Unit tests for discoverRulesFiles() and parseEnforcementBlocks()
 * from .claude/hooks/lib/rules.mjs.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { discoverRulesFiles, parseEnforcementBlocks } from '../../../.claude/hooks/lib/rules.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: ${label} — ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'rules-lib-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

// ═══════════════════════════════════════════════════════════════════
// discoverRulesFiles tests (UC-01 through UC-03)
// ═══════════════════════════════════════════════════════════════════

// UC-01a: .claude/rules/ has .md files → discovered
test('UC-01a: .claude/rules/ .md files discovered', () => {
  const tmp = makeTempProject({
    '.claude/rules/base.md': '# Base rules\n',
    '.claude/rules/project.md': '# Project rules\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 2, `Expected 2 files, got ${result.length}`);
  assert(result.every(p => p.endsWith('.md')), 'All paths should end in .md');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-01b: .cursor/rules/ has .md files → discovered
test('UC-01b: .cursor/rules/ .md files discovered', () => {
  const tmp = makeTempProject({
    '.cursor/rules/style.md': '# Style rules\n',
    '.cursor/rules/docs.markdown': '# Docs rules\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 2, `Expected 2 files, got ${result.length}`);
  assert(result.some(p => p.endsWith('.md')), 'Should include .md file');
  assert(result.some(p => p.endsWith('.markdown')), 'Should include .markdown file');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-01c: CODING_STANDARDS.md exists at root → discovered
test('UC-01c: CODING_STANDARDS.md at root discovered', () => {
  const tmp = makeTempProject({
    'CODING_STANDARDS.md': '# Standards\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file, got ${result.length}`);
  assert(result[0].endsWith('CODING_STANDARDS.md'), 'Should be CODING_STANDARDS.md');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-01d: All three locations have files → all returned
test('UC-01d: all three locations combined', () => {
  const tmp = makeTempProject({
    '.claude/rules/a.md': '# A\n',
    '.cursor/rules/b.md': '# B\n',
    'CODING_STANDARDS.md': '# Standards\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 3, `Expected 3 files, got ${result.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-01e: No rules dirs, no CODING_STANDARDS.md → empty array
test('UC-01e: no rules files → empty array', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'rules-lib-test-'));
  const result = discoverRulesFiles(tmp);
  assert(result.length === 0, `Expected 0 files, got ${result.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-01f: Mixed — .claude/rules/ exists, .cursor/rules/ doesn't → partial result
test('UC-01f: partial — only .claude/rules/', () => {
  const tmp = makeTempProject({
    '.claude/rules/only.md': '# Only\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file, got ${result.length}`);
  assert(result[0].includes('.claude/rules/'), 'Should be from .claude/rules/');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-02a: Config has rules.extraPaths → resolved paths included
test('UC-02a: extraPaths in config resolved', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({ rules: { extraPaths: ['extra/custom.md'] } }),
    'extra/custom.md': '# Custom\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file, got ${result.length}`);
  assert(result[0].endsWith('custom.md'), 'Should include extra path');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-02b: Config file missing → continues without error, returns standard paths only
test('UC-02b: config missing → no error, standard paths only', () => {
  const tmp = makeTempProject({
    '.claude/rules/base.md': '# Base\n',
  });
  // No .sandcastle/config.json
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file, got ${result.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-02c: Config has invalid JSON → exit 2
test('UC-02c: invalid JSON config → exit 2', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': '{{{not valid json',
    '.claude/rules/base.md': '# Base\n',
  });
  const originalExit = process.exit;
  let exitCode = null;
  process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };
  try {
    discoverRulesFiles(tmp);
    assert.fail('Expected process.exit(2)');
  } catch (e) {
    assert(e.message === 'EXIT', `Unexpected error: ${e.message}`);
    assert(exitCode === 2, `Expected exit code 2, got ${exitCode}`);
  } finally {
    process.exit = originalExit;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// UC-02d: Extra path doesn't exist → skipped with stderr warning
test('UC-02d: extra path missing → skipped', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({ rules: { extraPaths: ['nonexistent.md'] } }),
    '.claude/rules/base.md': '# Base\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file (only base), got ${result.length}`);
  assert(result[0].includes('base.md'), 'Should only contain the existing file');
  rmSync(tmp, { recursive: true, force: true });
});

// UC-02e: Extra paths is empty array → no extra files, no warning
test('UC-02e: empty extraPaths array → no extra files', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({ rules: { extraPaths: [] } }),
    '.claude/rules/base.md': '# Base\n',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 1, `Expected 1 file, got ${result.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-03a: Directory path in candidates → skipped (not a file)
test('UC-03a: directory in candidates → skipped', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({ rules: { extraPaths: ['somedir'] } }),
    'somedir/.keep': '',
  });
  const result = discoverRulesFiles(tmp);
  assert(result.length === 0, `Expected 0 files (dir skipped), got ${result.length}`);
  rmSync(tmp, { recursive: true, force: true });
});

// UC-03b: Symlink pointing outside project root → skipped (outside project)
test('UC-03b: symlink outside project → skipped', () => {
  const outsideDir = mkdtempSync(join(tmpdir(), 'rules-lib-outside-'));
  const outsideFile = join(outsideDir, 'external.md');
  writeFileSync(outsideFile, '# External\n');

  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({ rules: { extraPaths: ['linked.md'] } }),
  });
  symlinkSync(outsideFile, join(tmp, 'linked.md'));

  const result = discoverRulesFiles(tmp);
  assert(result.length === 0, `Expected 0 files (symlink outside project), got ${result.length}`);

  rmSync(tmp, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

// UC-03c: Path with .. traversal → if resolves outside root, skipped
test('UC-03c: .. traversal outside root → skipped', () => {
  const outsideDir = mkdtempSync(join(tmpdir(), 'rules-lib-outside-'));
  const outsideFile = join(outsideDir, 'traversed.md');
  writeFileSync(outsideFile, '# Traversed\n');

  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({
      rules: { extraPaths: [`../${outsideDir.split('/').pop()}/traversed.md`] },
    }),
  });

  const result = discoverRulesFiles(tmp);
  assert(result.length === 0, `Expected 0 files (.. traversal outside), got ${result.length}`);

  rmSync(tmp, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

// UC-03d: Duplicate paths (same file referenced twice) → deduplicated to single entry
test('UC-03d: duplicate paths deduplicated', () => {
  const tmp = makeTempProject({
    '.sandcastle/config.json': JSON.stringify({
      rules: { extraPaths: ['extra/dup.md', 'extra/dup.md'] },
    }),
    'extra/dup.md': '# Dup\n',
  });
  const result = discoverRulesFiles(tmp);
  const dupCount = result.filter(p => p.endsWith('dup.md')).length;
  assert(dupCount === 1, `Expected 1 entry for dup.md, got ${dupCount}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════
// parseEnforcementBlocks tests (UC-04)
// ═══════════════════════════════════════════════════════════════════

// UC-04a: Single T1 block → returns 1 block with correct fields
test('UC-04a: single T1 block parsed', () => {
  const content = `# Rules

- No raw px values.

\`\`\`enforcement
id: no-raw-px
tier: T1
scope: src/**/*.css
pattern: \\d+px
rule: No raw px
fix: Use a token
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}: ${JSON.stringify(errors)}`);
  assert(blocks.length === 1, `Expected 1 block, got ${blocks.length}`);
  assert(blocks[0].id === 'no-raw-px', `Expected id "no-raw-px", got "${blocks[0].id}"`);
  assert(blocks[0].tier === 'T1', `Expected tier T1, got "${blocks[0].tier}"`);
  assert(blocks[0].scope === 'src/**/*.css', `Expected scope, got "${blocks[0].scope}"`);
  assert(blocks[0].sourceFile === 'test.md', `Expected sourceFile "test.md", got "${blocks[0].sourceFile}"`);
});

// UC-04b: Multiple blocks in one file → returns all blocks
test('UC-04b: multiple blocks returned', () => {
  const content = `# Rules

- First rule.

\`\`\`enforcement
id: first
tier: T1
scope: src/**/*.ts
pattern: foo
rule: First
fix: Fix first
\`\`\`

- Second rule.

\`\`\`enforcement
id: second
tier: T1
scope: src/**/*.ts
pattern: bar
rule: Second
fix: Fix second
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}`);
  assert(blocks.length === 2, `Expected 2 blocks, got ${blocks.length}`);
  assert(blocks[0].id === 'first', 'First block id should be "first"');
  assert(blocks[1].id === 'second', 'Second block id should be "second"');
});

// UC-04c: Multi-tier block separated by --- at column 0 → two separate entries
test('UC-04c: --- separator produces two entries', () => {
  const content = `# Rules

- Multi-tier rule.

\`\`\`enforcement
id: multi
tier: T1
scope: src/**/*.ts
pattern: foo
rule: Multi
fix: Fix
---
tier: T2
scope: src/**/*.ts
pattern: bar
rule: Multi T2
fix: Fix T2
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}: ${JSON.stringify(errors)}`);
  assert(blocks.length === 2, `Expected 2 blocks, got ${blocks.length}`);
  assert(blocks[0].tier === 'T1', 'First entry should be T1');
  assert(blocks[1].tier === 'T2', 'Second entry should be T2');
});

// UC-04d: --- indented (e.g., 2 spaces) inside YAML → treated as literal text, NOT separator
test('UC-04d: indented --- is literal, not separator', () => {
  // When the fence itself is indented, the common-indent strip may normalize the ---.
  // Use an indented fence so that --- at 2-space indent becomes part of the body
  // while column-0 --- would be a separator.
  const content = `# Rules

- Rule with indented dashes.

  \`\`\`enforcement
  id: indented-dash
  tier: T1
  scope: src/**/*.ts
  pattern: foo
  rule: Rule with indented dashes
  fix: Fix it
    ---
  \`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  // The indented --- should NOT split; after dedent it still has 2 extra spaces
  // so it is literal text, not a separator. It causes a YAML parse error (no colon).
  // Key assertion: it did NOT produce 2 blocks (separator behavior).
  const blockCount = blocks.length;
  assert(blockCount <= 1, `Expected at most 1 block (indented --- is not a separator), got ${blockCount}`);
  // The --- line with no colon causes a YAML parse error for the whole section.
  assert(errors.length > 0, 'Expected a YAML parse error from the literal --- line');
  assert(errors[0].message.includes('no colon'), `Expected "no colon" error, got: ${errors[0].message}`);
});

// UC-04e: Malformed YAML (no colon in a line) → added to errors array
test('UC-04e: malformed YAML → error', () => {
  const content = `# Rules

- Bad YAML rule.

\`\`\`enforcement
id: bad
tier: T1
this line has no colon
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length > 0, 'Expected at least one error for malformed YAML');
  assert(errors[0].message.includes('no colon'), `Expected "no colon" in error: ${errors[0].message}`);
});

// UC-04f: Empty fence → no blocks, no errors (empty section skipped)
test('UC-04f: empty fence → no blocks, no errors', () => {
  const content = `# Rules

- Empty fence rule.

\`\`\`enforcement
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(blocks.length === 0, `Expected 0 blocks, got ${blocks.length}`);
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}`);
});

// UC-04g: Multi-tier block with shared id → both entries get the same id
test('UC-04g: shared id across sections', () => {
  const content = `# Rules

- Shared id rule.

\`\`\`enforcement
id: shared-id
tier: T1
scope: src/**/*.ts
pattern: foo
rule: Shared
fix: Fix
---
tier: T2
scope: src/**/*.css
pattern: bar
rule: Shared T2
fix: Fix T2
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}: ${JSON.stringify(errors)}`);
  assert(blocks.length === 2, `Expected 2 blocks, got ${blocks.length}`);
  assert(blocks[0].id === 'shared-id', `First block id: "${blocks[0].id}"`);
  assert(blocks[1].id === 'shared-id', `Second block should inherit id "shared-id", got "${blocks[1].id}"`);
});

// UC-04h: Rule text (bullet) immediately above fence → captured in ruleText field
test('UC-04h: rule text from bullet above fence', () => {
  const content = `# Rules

- This is the rule text above the fence.

\`\`\`enforcement
id: rule-text
tier: T1
scope: src/**/*.ts
pattern: foo
rule: Rule text
fix: Fix
\`\`\`
`;
  const { blocks, errors } = parseEnforcementBlocks(content, 'test.md');
  assert(errors.length === 0, `Expected 0 errors, got ${errors.length}`);
  assert(blocks.length === 1, `Expected 1 block, got ${blocks.length}`);
  assert(
    blocks[0].ruleText === 'This is the rule text above the fence.',
    `Expected ruleText to capture bullet, got "${blocks[0].ruleText}"`,
  );
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Rules lib tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
