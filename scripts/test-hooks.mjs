#!/usr/bin/env node
/**
 * Automated proof harness for PreToolUse hooks.
 * Spawns each hook as a child process, pipes simulated stdin JSON,
 * and asserts the expected exit code (0 = allow, 2 = block).
 *
 * Run: node scripts/test-hooks.mjs
 */
import { execFileSync } from 'node:child_process';
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

// ─── Summary ────────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`Hook tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
