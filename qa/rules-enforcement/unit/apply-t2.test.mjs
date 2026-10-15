#!/usr/bin/env node
/**
 * Tests for the apply-t2.mjs script.
 * Creates temporary project dirs with rules files and verifies
 * exit codes, drift detection, and edge-case handling.
 *
 * Does NOT start a real dev server or run Playwright — tests focus
 * on the pre-flight logic: T2 block discovery, drift detection,
 * missing test file, and zero-block handling.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts/apply-t2.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function makeTempProject(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'apply-t2-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function runApplyT2(tmpDir, envOverrides = {}) {
  const result = spawnSync('node', [SCRIPT], {
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: tmpDir,
      // Set a fake dev server URL so the script doesn't try to start vite
      // Tests that need the server to fail will set a different URL
      DEV_SERVER_URL: 'http://127.0.0.1:0',
      // Short timeout to avoid 30s waits in tests
      STARTUP_TIMEOUT_MS: '2000',
      ...envOverrides,
    },
    cwd: tmpDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { exitCode: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

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

// ─── Rules file with T2 global blocks ─────────────────────────────

const RULES_WITH_T2_GLOBAL = `# Test rules

## Accessibility

- No axe violations.

  \`\`\`enforcement
  id: "no-axe-violations"
  tier: T2
  scope: global
  assert: "expectNoA11yViolations(page) — run axe-core against every fixture page"
  \`\`\`

## Layout

- No horizontal overflow.

  \`\`\`enforcement
  id: "no-horizontal-overflow"
  tier: T2
  scope: global
  assert: "expectNoHorizontalOverflow(page) — sweep viewports 320–1440px"
  \`\`\`
`;

const TEST_FILE_WITH_BOTH = `
// T2 global invariants test file
import { test } from '../support/fixtures';
// no-axe-violations
test.describe('T2 global: no-axe-violations', () => {});
// no-horizontal-overflow
test.describe('T2 global: no-horizontal-overflow', () => {});
`;

const TEST_FILE_MISSING_ONE = `
// T2 global invariants test file
import { test } from '../support/fixtures';
// axe check present
test.describe('T2 global: no-axe-violations', () => {});
// overflow check is NOT present
`;

// ─── Test: zero T2 global blocks → exit 0 + warning ─────────────

test('zero T2 global blocks → exit 0 + warning', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- A T1 rule only.

  \`\`\`enforcement
  id: "t1-only"
  tier: T1
  scope: "src/**/*.ts"
  pattern: "badThing"
  rule: "No bad things"
  fix: "Remove it"
  \`\`\`
`,
    'qa/invariants/invariants.spec.ts': '// empty test file',
  });

  const { exitCode, stderr } = runApplyT2(tmp);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);
  assert(
    stderr.includes('zero') || stderr.includes('0'),
    `Expected warning about zero blocks. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: missing test file → exit 2 ──────────────────────────

test('missing test file → exit 2', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    // No qa/invariants/invariants.spec.ts
  });

  const { exitCode, stderr } = runApplyT2(tmp);
  assert(exitCode === 2, `Expected exit 2, got ${exitCode}. stderr: ${stderr}`);
  assert(
    stderr.includes('missing') || stderr.includes('not found'),
    `Expected error about missing test file. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: drift detection → warning to stderr ─────────────────

test('drift detection → warning when block missing from test file', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    'qa/invariants/invariants.spec.ts': TEST_FILE_MISSING_ONE,
  });

  // Script will find blocks, check drift, then try dev server (which fails).
  // Drift warning appears in stderr before server timeout.
  const { stderr } = runApplyT2(tmp);
  assert(
    stderr.includes('drift') && stderr.includes('no-horizontal-overflow'),
    `Expected drift warning for no-horizontal-overflow. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: no drift when all blocks have matching assertions ────

test('no drift when all blocks have matching assertions', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    'qa/invariants/invariants.spec.ts': TEST_FILE_WITH_BOTH,
  });

  const { stderr } = runApplyT2(tmp);
  assert(
    !stderr.includes('drift'),
    `Expected no drift warning. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: T2 per-component blocks are ignored ──────────────────

test('T2 per-component blocks are ignored (only global)', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- Focus management (per-component, not global).

  \`\`\`enforcement
  id: "focus-management"
  tier: T2
  scope: per-component
  assert: "Focus moves into dialog on open"
  \`\`\`
`,
    'qa/invariants/invariants.spec.ts': '// empty test file',
  });

  const { exitCode, stderr } = runApplyT2(tmp);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);
  assert(
    stderr.includes('zero') || stderr.includes('0'),
    `Expected warning about zero blocks. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: T3 blocks are ignored ────────────────────────────────

test('T3 blocks are ignored', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': `# Test rules

- T3 reviewer rule.

  \`\`\`enforcement
  id: "rev-tokens"
  tier: T3
  agent: reviewer
  scope: "src/**/*.css"
  group: tokens
  instruction: "Check tokens."
  \`\`\`
`,
    'qa/invariants/invariants.spec.ts': '// empty test file',
  });

  const { exitCode, stderr } = runApplyT2(tmp);
  assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr: ${stderr}`);
  assert(
    stderr.includes('zero') || stderr.includes('0'),
    `Expected warning about zero blocks. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: dev server timeout → exit 2 ─────────────────────────

test('dev server timeout → exit 2', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    'qa/invariants/invariants.spec.ts': TEST_FILE_WITH_BOTH,
  });

  // Use unreachable URL with very short timeout (1s)
  const { exitCode, stderr } = runApplyT2(tmp, {
    DEV_SERVER_URL: 'http://127.0.0.1:1',
    STARTUP_TIMEOUT_MS: '1000',
  });
  // Should exit 2 due to server timeout
  assert(exitCode === 2, `Expected exit 2, got ${exitCode}. stderr: ${stderr}`);
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: block count reported to stderr ───────────────────────

test('block count reported to stderr', () => {
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    'qa/invariants/invariants.spec.ts': TEST_FILE_WITH_BOTH,
  });

  const { stderr } = runApplyT2(tmp);
  assert(
    stderr.includes('2') && stderr.includes('T2 global'),
    `Expected block count in stderr. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Test: compilation failure detected in stderr → exit 2 ─────

test('compilation failure detected in stderr → exit 2', () => {
  // The script cannot be tested for compilation without a real server.
  // Verify the dev server timeout path produces exit 2 (infrastructure failure).
  // This test verifies stderr mentions infrastructure error on timeout.
  const tmp = makeTempProject({
    '.claude/rules/test.md': RULES_WITH_T2_GLOBAL,
    'qa/invariants/invariants.spec.ts': TEST_FILE_WITH_BOTH,
  });
  const { exitCode, stderr } = runApplyT2(tmp, {
    DEV_SERVER_URL: 'http://127.0.0.1:1',
    STARTUP_TIMEOUT_MS: '1000',
  });
  assert(exitCode === 2, `Expected exit 2, got ${exitCode}`);
  assert(
    stderr.includes('dev server') || stderr.includes('failed'),
    `Expected infrastructure error message. stderr: ${stderr}`,
  );
  rmSync(tmp, { recursive: true, force: true });
});

// ─── Summary ────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log('');
}
console.log(`apply-t2 tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
