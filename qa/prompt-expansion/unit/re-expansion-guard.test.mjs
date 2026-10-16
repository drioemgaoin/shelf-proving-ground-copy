#!/usr/bin/env node
/**
 * TGF-16: expandAndSave — re-expansion guard / shell injection
 *
 * Spec (line 526): "no stage's output is re-expanded by a later stage"
 *
 * Security: Stage 1 substituteVars replaces {{ISSUE_BODY}} with attacker-
 * controlled content. If that content contains !`cmd`, Stage 2
 * expandShellExpressions executes it → arbitrary command execution on host.
 *
 * Seam: expandAndSave() composition (substituteVars + expandShellExpressions)
 * Level: unit (security)
 * Source: .sandcastle/lib/prompt.mts:37-46
 */
import { execSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

// ---------------------------------------------------------------------------
// Reimplemented from .sandcastle/lib/prompt.mts — mirrors source EXACTLY.
// ---------------------------------------------------------------------------

function substituteVars(template, vars) {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => (key in vars ? vars[key] : match),
  );
}

function expandShellExpressions(template) {
  return template.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trimEnd();
    } catch {
      console.warn(`[prompt] shell expansion failed: ${cmd}`);
      return '';
    }
  });
}

function expandAndSave(promptFile, promptArgs, outputPath) {
  const raw = readFileSync(promptFile, 'utf8');
  const expanded = substituteVars(expandShellExpressions(raw), promptArgs);
  mkdirSync(join(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, expanded);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(files = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'tgf16-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(tmp, relPath);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return tmp;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// ─── Test: shell injection via ISSUE_BODY — must NOT execute ────────────────

{
  const MARKER = `tgf16_${Date.now()}`;
  const markerFile = join(tmpdir(), MARKER);

  const tmp = makeTempDir({
    'template.md': 'Body: {{ISSUE_BODY}}',
  });
  const outPath = join(tmp, 'out.md');

  expandAndSave(join(tmp, 'template.md'), {
    ISSUE_BODY: `!\`touch ${markerFile}\``,
  }, outPath);

  const output = readFileSync(outPath, 'utf8');

  // The injected command must NOT have executed
  let markerExists = false;
  try { readFileSync(markerFile); markerExists = true; } catch { /* expected */ }

  assert(
    'shell injection via var — command NOT executed',
    !markerExists,
    'marker file was created — shell injection succeeded',
  );

  assert(
    'injected !`cmd` appears as literal text in output',
    output.includes('!`touch'),
    `output: ${JSON.stringify(output)}`,
  );

  // Cleanup marker if it was created (test still fails above)
  try { rmSync(markerFile); } catch { /* ok */ }
  cleanup(tmp);
}

// ─── Test: echo injection — output must be literal, not executed ─────────────

{
  const tmp = makeTempDir({
    'template.md': 'Body: {{ISSUE_BODY}}',
  });
  const outPath = join(tmp, 'out.md');

  expandAndSave(join(tmp, 'template.md'), {
    ISSUE_BODY: '!`echo injected`',
  }, outPath);

  const output = readFileSync(outPath, 'utf8');

  assert(
    'echo injection — "injected" not present as executed output',
    !output.includes('Body: injected\n') && !output.match(/^Body: injected$/m),
    `output: ${JSON.stringify(output)}`,
  );

  assert(
    'echo injection — literal !`echo injected` preserved',
    output.includes('!`echo injected`'),
    `output: ${JSON.stringify(output)}`,
  );

  cleanup(tmp);
}

// ─── Test: legitimate shell in template still works ─────────────────────────

{
  const tmp = makeTempDir({
    'template.md': 'Version: !`echo v1.0.0`\nBody: {{ISSUE_BODY}}',
  });
  const outPath = join(tmp, 'out.md');

  expandAndSave(join(tmp, 'template.md'), {
    ISSUE_BODY: 'safe body text',
  }, outPath);

  const output = readFileSync(outPath, 'utf8');

  assert(
    'legitimate shell command in template still executes',
    output.includes('Version: v1.0.0'),
    `output: ${JSON.stringify(output)}`,
  );

  assert(
    'safe var value substituted normally',
    output.includes('Body: safe body text'),
    `output: ${JSON.stringify(output)}`,
  );

  cleanup(tmp);
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
