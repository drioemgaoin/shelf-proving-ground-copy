#!/usr/bin/env node
/**
 * T2 global invariant runner — post-merge check.
 *
 * Reads T2 global enforcement blocks from rules files, validates
 * drift against the test file, starts the dev server, and runs
 * qa/invariants/invariants.spec.ts via Playwright.
 *
 * Usage: node apply-t2.mjs
 *
 * Exit 0 = all pass (or vacuously true if zero T2 global blocks)
 * Exit 1 = assertion failed
 * Exit 2 = infrastructure (dev server timeout, test file missing, compilation)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { discoverRulesFiles, parseEnforcementBlocks } from '../.claude/hooks/lib/rules.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// ─── Monitoring (fail-open) ────────────────────────────────────────

let recorder = null;
try {
  const { createRecorder } = await import('./monitor/recorder.mjs');
  recorder = createRecorder(projectDir);
} catch {
  // Monitor unavailable
}

function recordT2Events(blocks, testPassed) {
  if (!recorder) return;
  try {
    for (const block of blocks) {
      recorder.record({
        tier: 'T2',
        ruleId: block.id,
        outcome: testPassed ? 'passed' : 'blocked',
        details: { scope: block.scope, assert: block.assert },
      });
    }
  } catch {
    // Monitoring must never break the script
  }
}
const TEST_FILE = join(projectDir, 'qa', 'invariants', 'invariants.spec.ts');
const DEV_SERVER_URL = process.env.DEV_SERVER_URL ?? 'http://localhost:5173';
const STARTUP_TIMEOUT_MS = parseInt(process.env.STARTUP_TIMEOUT_MS ?? '30000', 10);
const HEALTH_CHECK_INTERVAL_MS = 500;

// ─── Discover T2 global blocks ──────────────────────────────────

function discoverT2GlobalBlocks() {
  const rulesFiles = discoverRulesFiles(projectDir);
  const t2Global = [];

  for (const filePath of rulesFiles) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      process.stderr.write(`apply-t2: warning: failed to read ${filePath}\n`);
      continue;
    }

    const { blocks, errors } = parseEnforcementBlocks(content, filePath);

    for (const err of errors) {
      process.stderr.write(`apply-t2: parse error in ${err.file}: ${err.message}\n`);
    }

    for (const block of blocks) {
      if (block.tier === 'T2' && block.scope === 'global') {
        t2Global.push(block);
      }
    }
  }

  return t2Global;
}

// ─── Drift detection ────────────────────────────────────────────

function checkDrift(blocks, testFileContent) {
  let driftCount = 0;

  for (const block of blocks) {
    const id = block.id;
    if (!id) continue;

    // Check that the test file contains a describe or test referencing this block id
    if (!testFileContent.includes(id)) {
      process.stderr.write(`apply-t2: drift: T2 global block "${id}" has no matching assertion in ${TEST_FILE}\n`);
      driftCount++;
    }
  }

  return driftCount;
}

// ─── Dev server management ──────────────────────────────────────

async function waitForServer(url, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 304) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }

  return false;
}

function startDevServer() {
  const child = spawn('npx', ['vite', '--port', '5173'], {
    cwd: projectDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });

  return child;
}

// ─── Run Playwright ─────────────────────────────────────────────

function runPlaywright(testFile) {
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--config=qa/playwright.config.ts', testFile],
    {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 300_000, // 5-minute timeout for the full test run
    },
  );

  return {
    exitCode: result.status ?? 2,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
  };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  // 1. Discover T2 global blocks
  const blocks = discoverT2GlobalBlocks();

  if (blocks.length === 0) {
    process.stderr.write('apply-t2: warning: zero T2 global enforcement blocks found\n');
    process.exit(0);
  }

  process.stderr.write(`apply-t2: found ${blocks.length} T2 global enforcement blocks\n`);

  // 2. Check test file exists
  if (!existsSync(TEST_FILE)) {
    process.stderr.write(`apply-t2: error: test file missing: ${TEST_FILE}\n`);
    process.exit(2);
  }

  // 3. Drift detection
  let testFileContent;
  try {
    testFileContent = readFileSync(TEST_FILE, 'utf8');
  } catch (err) {
    process.stderr.write(`apply-t2: error: failed to read test file: ${err.message}\n`);
    process.exit(2);
  }

  const driftCount = checkDrift(blocks, testFileContent);
  if (driftCount > 0) {
    process.stderr.write(`apply-t2: drift: ${driftCount} T2 global block(s) without matching assertions\n`);
  }

  // 4. Start dev server
  process.stderr.write(`apply-t2: starting dev server at ${DEV_SERVER_URL}\n`);
  const server = startDevServer();

  let serverReady = false;
  try {
    serverReady = await waitForServer(DEV_SERVER_URL, STARTUP_TIMEOUT_MS);
  } catch {
    // Health check error
  }

  if (!serverReady) {
    process.stderr.write(`apply-t2: error: dev server failed to start within ${STARTUP_TIMEOUT_MS}ms\n`);
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
    process.exit(2);
  }

  process.stderr.write('apply-t2: dev server ready\n');

  // 5. Run Playwright tests
  const result = runPlaywright(TEST_FILE);

  // 6. Kill dev server
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Process may already be dead
  }

  // 7. Determine exit code
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  // Check for compilation failure (exit 2) vs assertion failure (exit 1)
  if (result.exitCode !== 0) {
    const combined = result.stdout + result.stderr;
    const isCompilationFailure =
      combined.includes('TSError') ||
      combined.includes('SyntaxError') ||
      combined.includes('Cannot find module') ||
      combined.includes('TypeError: Cannot') ||
      combined.includes('Error: No tests found') ||
      combined.includes('compilation') ||
      result.signal !== null;

    if (isCompilationFailure) {
      process.stderr.write('apply-t2: infrastructure failure (compilation or test setup)\n');
      process.exit(2);
    }

    recordT2Events(blocks, false);
    process.stderr.write('apply-t2: assertion failure\n');
    process.exit(1);
  }

  recordT2Events(blocks, true);
  process.stderr.write('apply-t2: all T2 global invariants passed\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`apply-t2: fatal: ${err.message}\n`);
  process.exit(2);
});
