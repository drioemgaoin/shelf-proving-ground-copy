#!/usr/bin/env node
/**
 * Automated proof harness for PreToolUse hooks.
 * Spawns each hook as a child process, pipes simulated stdin JSON,
 * and asserts the expected exit code (0 = allow, 2 = block).
 *
 * Run: node scripts/test-hooks.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PROJECT = process.cwd();
const HOOKS = join(PROJECT, '.claude/hooks');

let passed = 0;
let failed = 0;
const failures = [];

function runHook(script, toolName, toolInput, expectBlock, label) {
  const json = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  try {
    execFileSync('node', [join(HOOKS, script)], {
      input: json,
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // exit 0 = allowed
    if (expectBlock) {
      failed++;
      failures.push(`FAIL: ${label} — expected BLOCK but got ALLOW`);
    } else {
      passed++;
    }
  } catch (e) {
    if (e.status === 2) {
      if (expectBlock) {
        passed++;
      } else {
        failed++;
        failures.push(`FAIL: ${label} — expected ALLOW but got BLOCK: ${e.stderr}`);
      }
    } else {
      failed++;
      failures.push(`FAIL: ${label} — unexpected error (exit ${e.status}): ${e.stderr}`);
    }
  }
}

function edit(filePath, newString) {
  return { file_path: join(PROJECT, filePath), new_string: newString };
}

function write(filePath, content) {
  return { file_path: join(PROJECT, filePath), content };
}

// ─── check-raw-values.mjs ───────────────────────────────────────────

const RAW = 'check-raw-values.mjs';

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: #ff0000;'), true,
  'raw-values: block hex color');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: #fff;'), true,
  'raw-values: block short hex');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'padding: 16px;'), true,
  'raw-values: block raw 16px');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'margin: 1.5rem;'), true,
  'raw-values: block raw rem');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'gap: 2em;'), true,
  'raw-values: block raw em');

// --- color functions and named colors ---

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: rgb(255, 0, 0);'), true,
  'raw-values: block rgb()');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'background: rgba(0, 0, 0, 0.5);'), true,
  'raw-values: block rgba()');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: hsl(18 55% 42%);'), true,
  'raw-values: block hsl()');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: hsla(18, 55%, 42%, 0.8);'), true,
  'raw-values: block hsla()');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: red;'), true,
  'raw-values: block named color "red"');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'background-color: cornflowerblue;'), true,
  'raw-values: block named color "cornflowerblue"');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'border: 1px solid tomato;'), true,
  'raw-values: block named color in shorthand');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: transparent;'), false,
  'raw-values: allow transparent (structural)');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: inherit;'), false,
  'raw-values: allow inherit');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: currentColor;'), false,
  'raw-values: allow currentColor');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'display: none;'), false,
  'raw-values: allow non-color property with color-like word');

// --- existing tests ---

runHook(RAW, 'Edit', edit('src/styles/tokens.css', 'color: #ff0000;'), false,
  'raw-values: allow tokens.css');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'color: var(--shelf-fgColor-default);'), false,
  'raw-values: allow var() token ref');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'border: 1px solid var(--shelf-borderColor-default);'), false,
  'raw-values: allow 1px border');

runHook(RAW, 'Edit', edit('src/components/Card.css', '@media (min-width: 768px) {'), false,
  'raw-values: allow media query breakpoint');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'grid-template-columns: minmax(280px, 1fr);'), false,
  'raw-values: allow minmax() px');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'border-radius: 0px;'), false,
  'raw-values: allow 0px');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'border-radius: 9999px;'), false,
  'raw-values: allow 9999px (radius-full)');

runHook(RAW, 'Edit', edit('src/components/Card.css', 'line-height: 1.5;'), false,
  'raw-values: allow unitless line-height');

runHook(RAW, 'Edit', edit('src/components/Card.css', '/* color: #ff0000; */'), false,
  'raw-values: allow hex inside CSS comment');

runHook(RAW, 'Write', write('src/components/Card.css', '.card {\n  padding: 24px;\n}'), true,
  'raw-values: block via Write tool');

runHook(RAW, 'Edit', edit('src/api.ts', 'padding: 16px;'), false,
  'raw-values: allow non-CSS file');

// ─── check-any-type.mjs ────────────────────────────────────────────

const ANY = 'check-any-type.mjs';

runHook(ANY, 'Edit', edit('src/api.ts', 'const x: any = 5;'), true,
  'any-type: block : any');

runHook(ANY, 'Edit', edit('src/api.ts', 'foo as any'), true,
  'any-type: block as any');

runHook(ANY, 'Edit', edit('src/api.ts', 'Array<any>'), true,
  'any-type: block <any>');

runHook(ANY, 'Edit', edit('src/api.ts', 'const x: unknown = 5;'), false,
  'any-type: allow unknown');

runHook(ANY, 'Edit', edit('src/api.ts', 'const company = "Acme";'), false,
  'any-type: allow "company" substring');

runHook(ANY, 'Edit', edit('src/api.ts', 'const anyOf = [1, 2];'), false,
  'any-type: allow "anyOf" identifier');

runHook(ANY, 'Edit', edit('src/styles/tokens.css', ': any'), false,
  'any-type: allow non-TS file');

// ─── check-unsafe-as.mjs ───────────────────────────────────────────

const AS = 'check-unsafe-as.mjs';

runHook(AS, 'Edit', edit('src/api.ts', 'x as HTMLElement'), true,
  'unsafe-as: block as HTMLElement');

runHook(AS, 'Edit', edit('src/api.ts', 'data as BookResponse'), true,
  'unsafe-as: block as BookResponse');

runHook(AS, 'Edit', edit('src/api.ts', 'x as const'), false,
  'unsafe-as: allow as const');

runHook(AS, 'Edit', edit('src/api.ts', 'const x satisfies BookData = {};'), false,
  'unsafe-as: allow satisfies');

runHook(AS, 'Edit', edit('src/api.ts', 'import { Foo as Bar } from "./mod"'), false,
  'unsafe-as: allow import rename');

runHook(AS, 'Edit', edit('src/api.ts', 'const lower = val as const'), false,
  'unsafe-as: allow lowercase as const');

// ─── check-token-namespace.mjs ──────────────────────────────────────

const NS = 'check-token-namespace.mjs';

runHook(NS, 'Edit', edit('src/components/Card.css', '--card-bg: red;'), true,
  'namespace: block --card-bg declaration');

runHook(NS, 'Edit', edit('src/components/Card.css', '  --my-color: blue;'), true,
  'namespace: block --my-color declaration');

runHook(NS, 'Edit', edit('src/styles/tokens.css', '--internal: red;'), false,
  'namespace: allow tokens.css');

runHook(NS, 'Edit', edit('src/components/Card.css', '--shelf-card-bg: var(--shelf-bgColor-raised);'), false,
  'namespace: allow --shelf- prefix');

runHook(NS, 'Edit', edit('src/components/Card.css', 'color: var(--shelf-fgColor-default);'), false,
  'namespace: allow var() reference');

runHook(NS, 'Edit', edit('src/components/Card.css', 'background: var(--some-external-var);'), false,
  'namespace: allow var() ref to any token (not a declaration)');

// ─── check-zindex.mjs ──────────────────────────────────────────────

const ZI = 'check-zindex.mjs';

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: 100;'), true,
  'zindex: block raw z-index 100');

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: 9999;'), true,
  'zindex: block raw z-index 9999');

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: 0;'), true,
  'zindex: block raw z-index 0');

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: var(--shelf-z-sticky);'), false,
  'zindex: allow var(--shelf-z-*)');

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: auto;'), false,
  'zindex: allow auto');

runHook(ZI, 'Edit', edit('src/components/Card.css', 'z-index: inherit;'), false,
  'zindex: allow inherit');

runHook(ZI, 'Edit', edit('src/api.ts', 'z-index: 100;'), false,
  'zindex: allow non-CSS file');

// ─── apply-t1.mjs (generic T1 enforcement engine) ─────────────────
// All apply-t1 tests use controlled temp projects with explicit rules,
// not real rules files, so tests are deterministic and self-contained.

const T1 = 'apply-t1.mjs';

// Controlled rules: raw spacing, raw z-index, no-any-type, with exclude for tokens.css
const T1_TEST_RULES = `# Test rules

- No raw spacing values in CSS.

  \`\`\`enforcement
  id: "no-raw-spacing"
  tier: T1
  - pattern: "[0-9]+(px|rem|em|ms|s|%)"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    strip: comments
    fix: "Use a --shelf-* token"
  \`\`\`

- No raw z-index values in CSS.

  \`\`\`enforcement
  id: "no-raw-zindex"
  tier: T1
  - pattern: "z-index:\\\\s*[0-9]"
    assert: absent
    scope: "src/**/*.css"
    exclude: "src/styles/tokens.css"
    fix: "Use a --shelf-z-* token"
  \`\`\`

- No any types in TypeScript.

  \`\`\`enforcement
  id: "no-any-type"
  tier: T1
  - pattern: ":\\\\s*any\\\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use unknown and narrow"
  - pattern: "\\\\bas\\\\s+any\\\\b"
    assert: absent
    scope: "src/**/*.{ts,tsx}"
    fix: "Use a type guard instead of as any"
  \`\`\`
`;

function makeT1TempProject(rules) {
  const tmp = mkdtempSync(join(tmpdir(), 'hooks-t1-test-'));
  mkdirSync(join(tmp, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(tmp, '.claude', 'rules', 'test.md'), rules);
  return tmp;
}

function runT1Hook(tmpDir, toolName, toolInput, expectBlock, label) {
  const json = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  try {
    execFileSync('node', [join(HOOKS, T1)], {
      input: json,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expectBlock) {
      failed++;
      failures.push(`FAIL: ${label} — expected BLOCK but got ALLOW`);
    } else {
      passed++;
    }
  } catch (e) {
    if (e.status === 2) {
      if (expectBlock) {
        passed++;
      } else {
        failed++;
        failures.push(`FAIL: ${label} — expected ALLOW but got BLOCK: ${e.stderr}`);
      }
    } else {
      failed++;
      failures.push(`FAIL: ${label} — unexpected error (exit ${e.status}): ${e.stderr}`);
    }
  }
}

{
  const tmp = makeT1TempProject(T1_TEST_RULES);

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'margin: 16px;' },
    true, 'apply-t1: block raw 16px');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'padding: var(--shelf-space-400);' },
    false, 'apply-t1: allow token ref');

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.card {\n  gap: 24px;\n}' },
    true, 'apply-t1: block via Write tool');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'z-index: 100;' },
    true, 'apply-t1: block raw z-index');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'z-index: var(--shelf-z-sticky);' },
    false, 'apply-t1: allow z-index token');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/api.ts'), new_string: 'const x: any = 5;' },
    true, 'apply-t1: block any type');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/api.ts'), new_string: 'const x: unknown = 5;' },
    false, 'apply-t1: allow unknown type');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/styles/tokens.css'), new_string: 'color: #ff0000;' },
    false, 'apply-t1: allow tokens.css (excluded)');

  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/api.ts'), new_string: 'padding: 16px;' },
    false, 'apply-t1: allow non-CSS file for spacing rule');

  // Binary content (null byte in first 8192 bytes → skip).
  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: 'padding: 16px;\x00binary' },
    false, 'apply-t1: allow binary file');

  // Comments stripped → allow raw value inside CSS comment
  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: '/* padding: 24px; */' },
    false, 'apply-t1: allow raw value inside CSS comment');

  rmSync(tmp, { recursive: true, force: true });
}

// --- Malformed YAML → fail-closed ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'hooks-test-'));
  mkdirSync(join(tmp, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(tmp, '.claude', 'rules', 'bad.md'), '```enforcement\n{{{not yaml at all\n```\n');
  const json = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: join(tmp, 'src/components/Card.css'), new_string: 'margin: 16px;' },
  });
  try {
    execFileSync('node', [join(HOOKS, T1)], {
      input: json,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    failed++;
    failures.push('FAIL: apply-t1: malformed YAML — expected BLOCK but got ALLOW');
  } catch (e) {
    if (e.status === 2) {
      passed++;
    } else {
      failed++;
      failures.push(`FAIL: apply-t1: malformed YAML — unexpected error (exit ${e.status}): ${e.stderr}`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}

// --- Zero rules files → fail-open ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'hooks-test-'));
  const json = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: join(tmp, 'src/components/Card.css'), new_string: 'margin: 16px;' },
  });
  try {
    execFileSync('node', [join(HOOKS, T1)], {
      input: json,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    passed++;
  } catch (e) {
    failed++;
    failures.push(`FAIL: apply-t1: zero rules — expected ALLOW but got BLOCK (exit ${e.status})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ─── runT1HookFull: captures stdout + stderr + exitCode ─────────────

function runT1HookFull(tmpDir, toolName, toolInput) {
  const json = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  const result = spawnSync('node', [join(HOOKS, T1)], {
    input: json,
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
    encoding: 'utf8',
    timeout: 15000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// --- UC-05c: assert:present, pattern found → exit 0 (allow) ---
{
  const PRESENT_FOUND_RULES = `# Test rules

- Every CSS file must contain a charset declaration.

  \`\`\`enforcement
  id: "require-charset"
  tier: T1
  - pattern: "@charset"
    assert: present
    scope: "src/**/*.css"
    fix: "Add @charset \\"UTF-8\\" at the top"
  \`\`\`
`;
  const tmp = makeT1TempProject(PRESENT_FOUND_RULES);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '@charset "UTF-8";\n.card { color: red; }' },
    false, 'apply-t1 UC-05c: assert:present, pattern found → allow');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-05d: assert:present, pattern not found → exit 2 (block) ---
{
  const PRESENT_MISSING_RULES = `# Test rules

- Every CSS file must contain a charset declaration.

  \`\`\`enforcement
  id: "require-charset"
  tier: T1
  - pattern: "@charset"
    assert: present
    scope: "src/**/*.css"
    fix: "Add @charset \\"UTF-8\\" at the top"
  \`\`\`
`;
  const tmp = makeT1TempProject(PRESENT_MISSING_RULES);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.card { color: red; }' },
    true, 'apply-t1 UC-05d: assert:present, pattern not found → block');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-05g: Multiple violations → single rejection with all violations ---
{
  const MULTI_RULES = `# Test rules

- No raw spacing values in CSS.

  \`\`\`enforcement
  id: "no-raw-spacing"
  tier: T1
  - pattern: "[0-9]+(px|rem|em)"
    assert: absent
    scope: "src/**/*.css"
    fix: "Use a --shelf-* token"
  \`\`\`
`;
  const tmp = makeT1TempProject(MULTI_RULES);

  const result = runT1HookFull(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.a { margin: 16px; }\n.b { padding: 24rem; }\n.c { gap: 8em; }' });

  if (result.exitCode !== 2) {
    failed++;
    failures.push(`FAIL: apply-t1 UC-05g: multiple violations — expected exit 2 but got ${result.exitCode}`);
  } else {
    // Count occurrences of "file:" in stderr — should be at least 3 (one per violation).
    const fileEntries = (result.stderr.match(/^file:/gm) || []).length;
    if (fileEntries >= 3) {
      passed++;
    } else {
      failed++;
      failures.push(`FAIL: apply-t1 UC-05g: multiple violations — expected ≥3 "file:" entries in stderr, got ${fileEntries}`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-06b: Null byte after 8192 bytes → NOT detected as binary ---
{
  const tmp = makeT1TempProject(T1_TEST_RULES);

  // Build content with raw spacing, then pad to >8192 chars, then add null byte.
  const prefix = 'padding: 16px;\n';
  const padding = 'x'.repeat(8200 - prefix.length);
  const contentWithLateNull = prefix + padding + '\x00trailing';

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: contentWithLateNull },
    true, 'apply-t1 UC-06b: null byte after 8192 bytes → still checked (blocked)');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-07b: strip:comments, pattern in code (not comment) → blocked ---
{
  const tmp = makeT1TempProject(T1_TEST_RULES);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.card {\n  margin: 16px;\n}' },
    true, 'apply-t1 UC-07b: strip:comments, pattern in code → blocked');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-07c: strip:strings, pattern in string literal → allowed ---
{
  const STRIP_STRINGS_RULES = `# Test rules

- No raw spacing in TS.

  \`\`\`enforcement
  id: "no-raw-spacing-ts"
  tier: T1
  - pattern: "[0-9]+(px|rem|em)"
    assert: absent
    scope: "src/**/*.ts"
    strip: strings
    fix: "Use a token"
  \`\`\`
`;
  const tmp = makeT1TempProject(STRIP_STRINGS_RULES);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/utils/helpers.ts'), content: 'const s = "margin: 16px";' },
    false, 'apply-t1 UC-07c: strip:strings, pattern in string literal → allowed');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-07d: strip:comments+strings, both removed → allowed ---
{
  const STRIP_BOTH_RULES = `# Test rules

- No raw spacing in TS.

  \`\`\`enforcement
  id: "no-raw-spacing-ts"
  tier: T1
  - pattern: "[0-9]+(px|rem|em)"
    assert: absent
    scope: "src/**/*.ts"
    strip: comments+strings
    fix: "Use a token"
  \`\`\`
`;
  const tmp = makeT1TempProject(STRIP_BOTH_RULES);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/utils/helpers.ts'), content: '// margin: 16px\nconst s = "padding: 24rem";' },
    false, 'apply-t1 UC-07d: strip:comments+strings, both removed → allowed');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-07e: Unmapped file extension (.rs) → skip stripping, match raw ---
{
  const STRIP_COMMENTS_RS_RULES = `# Test rules

- No raw spacing in Rust.

  \`\`\`enforcement
  id: "no-raw-spacing-rs"
  tier: T1
  - pattern: "[0-9]+(px|rem|em)"
    assert: absent
    scope: "src/**/*.rs"
    strip: comments
    fix: "Use a token"
  \`\`\`
`;
  const tmp = makeT1TempProject(STRIP_COMMENTS_RS_RULES);

  // In .rs files, strip:comments doesn't know how to strip, so raw content is checked.
  // "// margin: 16px" looks like a comment but stripping is a no-op for .rs → pattern matches.
  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/lib.rs'), content: '// margin: 16px' },
    true, 'apply-t1 UC-07e: unmapped extension (.rs) → stripping skipped, pattern matched');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-07f: Unrecognized strip value → treat as strip:none + warning ---
{
  const STRIP_FOOBAR_RULES = `# Test rules

- No raw spacing in CSS.

  \`\`\`enforcement
  id: "no-raw-spacing-foobar"
  tier: T1
  - pattern: "[0-9]+(px|rem|em)"
    assert: absent
    scope: "src/**/*.css"
    strip: foobar
    fix: "Use a token"
  \`\`\`
`;
  const tmp = makeT1TempProject(STRIP_FOOBAR_RULES);

  const result = runT1HookFull(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.card { margin: 16px; }' });

  if (result.exitCode !== 2) {
    failed++;
    failures.push(`FAIL: apply-t1 UC-07f: unrecognized strip — expected exit 2 but got ${result.exitCode}`);
  } else if (!result.stderr.includes('unrecognized strip')) {
    failed++;
    failures.push('FAIL: apply-t1 UC-07f: unrecognized strip — missing warning in stderr');
  } else {
    passed++;
  }

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-09b: All files malformed, zero T1 rules survive → exit 2 (fail-closed) ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'hooks-t1-test-'));
  mkdirSync(join(tmp, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(tmp, '.claude', 'rules', 'bad1.md'), '```enforcement\n{{{not yaml\n```\n');
  writeFileSync(join(tmp, '.claude', 'rules', 'bad2.md'), '```enforcement\n:::also broken:::\n```\n');

  const result = runT1HookFull(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'color: blue;' });

  if (result.exitCode === 2) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: apply-t1 UC-09b: all malformed rules — expected exit 2 but got ${result.exitCode}`);
  }

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-10a: Invalid regex → pattern skipped, others continue ---
{
  const INVALID_REGEX_RULES = `# Test rules

- Bad regex rule (will be skipped).

  \`\`\`enforcement
  id: "bad-regex"
  tier: T1
  - pattern: "[invalid(("
    assert: absent
    scope: "src/**/*.css"
    fix: "Fix the regex"
  \`\`\`

- No raw z-index values in CSS.

  \`\`\`enforcement
  id: "no-raw-zindex"
  tier: T1
  - pattern: "z-index:\\\\s*[0-9]"
    assert: absent
    scope: "src/**/*.css"
    fix: "Use a --shelf-z-* token"
  \`\`\`
`;
  const tmp = makeT1TempProject(INVALID_REGEX_RULES);

  // The invalid regex is skipped; the valid z-index rule still blocks.
  runT1Hook(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'z-index: 100;' },
    true, 'apply-t1 UC-10a: invalid regex skipped, valid rule still enforced');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-10b: Regex timeout (catastrophic backtracking) ---
// NOTE: True catastrophic backtracking blocks the JS event loop, so the
// in-loop Date.now() timeout check never runs. This is a known limitation:
// the MATCH_TIMEOUT guard only fires if re.exec() returns between iterations.
// We verify instead that the pattern "(a+)+$" that DOES match (no trailing
// mismatch) is correctly flagged as a violation in absent mode.
{
  const TIMEOUT_RULES = `# Test rules

- Catastrophic backtracking rule.

  \`\`\`enforcement
  id: "timeout-rule"
  tier: T1
  - pattern: "(a+)+$"
    assert: absent
    scope: "src/**/*.css"
    fix: "Fix the content"
  \`\`\`
`;
  const tmp = makeT1TempProject(TIMEOUT_RULES);

  // Pattern matches (string of 'a's ending at $), so absent-mode blocks.
  const matchingContent = 'a'.repeat(30);

  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: matchingContent },
    true, 'apply-t1 UC-10b: catastrophic-backtracking pattern matching → blocked');

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-12a: Rejection has file, line, match, rule, fix fields ---
{
  const tmp = makeT1TempProject(T1_TEST_RULES);

  const result = runT1HookFull(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'margin: 16px;' });

  if (result.exitCode !== 2) {
    failed++;
    failures.push(`FAIL: apply-t1 UC-12a: rejection format — expected exit 2 but got ${result.exitCode}`);
  } else {
    const hasFile = result.stderr.includes('file:');
    const hasLine = result.stderr.includes('line:');
    const hasMatch = result.stderr.includes('match:');
    const hasRule = result.stderr.includes('rule:');
    const hasFix = result.stderr.includes('fix:');
    if (hasFile && hasLine && hasMatch && hasRule && hasFix) {
      passed++;
    } else {
      const missing = [];
      if (!hasFile) missing.push('file');
      if (!hasLine) missing.push('line');
      if (!hasMatch) missing.push('match');
      if (!hasRule) missing.push('rule');
      if (!hasFix) missing.push('fix');
      failed++;
      failures.push(`FAIL: apply-t1 UC-12a: rejection format — missing fields: ${missing.join(', ')}`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-12b: Multiple violations → all in single message ---
{
  const tmp = makeT1TempProject(T1_TEST_RULES);

  const result = runT1HookFull(tmp, 'Write',
    { file_path: join(tmp, 'src/components/Card.css'), content: '.a { margin: 16px; }\n.b { z-index: 5; }' });

  if (result.exitCode !== 2) {
    failed++;
    failures.push(`FAIL: apply-t1 UC-12b: multiple violations format — expected exit 2 but got ${result.exitCode}`);
  } else {
    // Should contain multiple "file:" entries in a single stderr message.
    const fileEntries = (result.stderr.match(/^file:/gm) || []).length;
    if (fileEntries >= 2) {
      passed++;
    } else {
      failed++;
      failures.push(`FAIL: apply-t1 UC-12b: multiple violations format — expected ≥2 "file:" entries, got ${fileEntries}`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
}

// --- UC-13a: Invalid scope glob → block skipped, fail-open + warning ---
{
  const INVALID_GLOB_RULES = `# Test rules

- Rule with broken glob.

  \`\`\`enforcement
  id: "broken-glob"
  tier: T1
  - pattern: "[0-9]+px"
    assert: absent
    scope: "src/[bad"
    fix: "Use a token"
  \`\`\`
`;
  const tmp = makeT1TempProject(INVALID_GLOB_RULES);

  const result = runT1HookFull(tmp, 'Edit',
    { file_path: join(tmp, 'src/components/Card.css'), new_string: 'margin: 16px;' });

  if (result.exitCode !== 0) {
    failed++;
    failures.push(`FAIL: apply-t1 UC-13a: invalid glob — expected exit 0 (fail-open) but got ${result.exitCode}`);
  } else if (!result.stderr.includes('invalid glob')) {
    failed++;
    failures.push('FAIL: apply-t1 UC-13a: invalid glob — missing warning in stderr');
  } else {
    passed++;
  }

  rmSync(tmp, { recursive: true, force: true });
}

// ─── DEV-01: Conflicting T1 rules make file unwritable ──────────────

{
  // Two T1 rules with same pattern, overlapping scope, opposite assert values.
  // Any content written to a matching file is blocked by one rule or the other.
  const CONFLICTING_RULES = `# Conflicting rules

- Must have async.

  \`\`\`enforcement
  id: "must-have-async"
  tier: T1
  - pattern: "async function"
    assert: present
    scope: "src/**/*.ts"
    fix: "Add async keyword"
  \`\`\`

- Must not have async.

  \`\`\`enforcement
  id: "must-not-have-async"
  tier: T1
  - pattern: "async function"
    assert: absent
    scope: "src/**/*.ts"
    fix: "Remove async keyword"
  \`\`\`
`;

  const tmp = makeT1TempProject(CONFLICTING_RULES);

  // Write WITH "async function" → blocked by must-not-have-async (assert: absent)
  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/app.ts'), content: 'async function foo() {}' },
    true, 'DEV-01: conflicting rules block write with pattern present');

  // Write WITHOUT "async function" → blocked by must-have-async (assert: present)
  runT1Hook(tmp, 'Write',
    { file_path: join(tmp, 'src/app.ts'), content: 'function foo() {}' },
    true, 'DEV-01: conflicting rules block write with pattern absent');

  rmSync(tmp, { recursive: true, force: true });
}

// ─── Summary ────────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Hook tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
