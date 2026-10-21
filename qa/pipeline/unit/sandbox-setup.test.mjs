#!/usr/bin/env node
/**
 * Integration test: simulate the full sandcastle onSandboxReady hook
 * sequence in /tmp and verify:
 *
 * 1. .claude/ contains ONLY hooks/ and settings.json (no rules, skills, agents)
 * 2. Rules stash is at .sandcastle/.rules-stash/ (not under .claude/)
 * 3. T1 cache is findable by apply-t1.mjs after the stash
 * 4. build-constraints.mjs can still read rules from the stash
 * 5. Host .claude/ is completely untouched
 */
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, readdirSync, rmSync, cpSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const PROJECT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; failures.push(`  ✗ FAIL: ${label} — ${e.message}`); console.log(`  ✗ FAIL: ${label}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Create a fake worktree in /tmp ──────────────────────────────────

const WORKTREE = mkdtempSync(join(tmpdir(), 'sandbox-setup-test-'));
console.log(`\nWorktree: ${WORKTREE}`);

// Populate .claude/ with everything that exists in the real repo
const realClaude = join(PROJECT, '.claude');
cpSync(realClaude, join(WORKTREE, '.claude'), { recursive: true });

// Populate .sandcastle/ (just needs to exist as parent for stash)
mkdirSync(join(WORKTREE, '.sandcastle'), { recursive: true });

// Copy the scripts needed by hooks
mkdirSync(join(WORKTREE, 'scripts'), { recursive: true });
cpSync(join(PROJECT, 'scripts/write-t1-cache.mjs'), join(WORKTREE, 'scripts/write-t1-cache.mjs'));

// ── Snapshot: what's in .claude/ BEFORE hooks ───────────────────────

const beforeEntries = readdirSync(join(WORKTREE, '.claude')).filter(e => !e.startsWith('.')).sort();
console.log(`\nBefore hooks — .claude/ contains: ${beforeEntries.join(', ')}`);

// ── Run the hook commands (subset relevant to .claude/ cleanup) ─────

console.log('\nRunning hook commands...');

// 1. write-t1-cache.mjs
try {
  execSync('node scripts/write-t1-cache.mjs', { cwd: WORKTREE, stdio: 'pipe' });
  console.log('  → write-t1-cache.mjs: OK');
} catch (e) {
  console.log(`  → write-t1-cache.mjs: ${e.stderr?.toString().trim()}`);
}

// 2. mv .claude/rules .sandcastle/.rules-stash
execSync('mv .claude/rules .sandcastle/.rules-stash', { cwd: WORKTREE });
console.log('  → mv rules to stash: OK');

// 3. Restore T1 cache to where apply-t1.mjs expects it
execSync('mkdir -p .claude/rules && cp .sandcastle/.rules-stash/.t1-cache.json .claude/rules/ 2>/dev/null; true', { cwd: WORKTREE });
console.log('  → restore T1 cache: OK');

// 4. rm -rf .claude/skills .claude/agents
execSync('rm -rf .claude/skills .claude/agents', { cwd: WORKTREE });
console.log('  → rm skills + agents: OK');

// ── Verify final state ──────────────────────────────────────────────

console.log('\n--- Verification ---\n');

const afterEntries = readdirSync(join(WORKTREE, '.claude')).filter(e => !e.startsWith('.')).sort();
console.log(`After hooks — .claude/ contains: ${afterEntries.join(', ')}`);

test('1. .claude/ contains only hooks, settings, and rules (T1 cache only)', () => {
  const allowed = new Set(['hooks', 'settings.json', 'settings.local.json', 'rules']);
  const unexpected = afterEntries.filter(e => !allowed.has(e));
  assert(unexpected.length === 0, `unexpected entries in .claude/: ${unexpected.join(', ')}`);
});

test('2. .claude/rules/ contains ONLY .t1-cache.json (no .md files)', () => {
  assert(existsSync(join(WORKTREE, '.claude', 'rules')), '.claude/rules/ should exist for T1 cache');
  const rulesEntries = readdirSync(join(WORKTREE, '.claude', 'rules'));
  assert(rulesEntries.length === 1 && rulesEntries[0] === '.t1-cache.json',
    `expected only .t1-cache.json, got: ${rulesEntries.join(', ')}`);
});

test('3. .claude/skills/ does NOT exist', () => {
  assert(!existsSync(join(WORKTREE, '.claude', 'skills')), '.claude/skills/ still exists');
});

test('4. .claude/agents/ does NOT exist', () => {
  assert(!existsSync(join(WORKTREE, '.claude', 'agents')), '.claude/agents/ still exists');
});

test('5. .claude/hooks/ still exists', () => {
  assert(existsSync(join(WORKTREE, '.claude', 'hooks')), '.claude/hooks/ is missing');
});

test('6. .claude/settings.json still exists', () => {
  assert(existsSync(join(WORKTREE, '.claude', 'settings.json')), 'settings.json is missing');
});

test('7. Rules stash is at .sandcastle/.rules-stash/', () => {
  assert(existsSync(join(WORKTREE, '.sandcastle', '.rules-stash')), 'stash dir missing');
  const stashFiles = readdirSync(join(WORKTREE, '.sandcastle', '.rules-stash')).filter(f => f.endsWith('.md'));
  assert(stashFiles.length >= 3, `expected ≥3 rule files in stash, got ${stashFiles.length}: ${stashFiles}`);
  console.log(`    stash contains: ${stashFiles.join(', ')}`);
});

test('8. No rule markdown or stash directories under .claude/', () => {
  // .claude/hooks/lib/rules.mjs is the hook library — that's fine.
  // We're checking for stashed rule CONTENT (.md files, stash dirs).
  const claudeAll = readdirSync(join(WORKTREE, '.claude'), { recursive: true, withFileTypes: true });
  const stashDirs = claudeAll.filter(e => e.name.includes('stash'));
  assert(stashDirs.length === 0, `stash dirs found in .claude/: ${stashDirs.map(e => e.name)}`);
  const ruleMd = claudeAll.filter(e => e.name.endsWith('.md') && e.name.includes('rule'));
  assert(ruleMd.length === 0, `rule markdown found in .claude/: ${ruleMd.map(e => e.name)}`);
});

// ── T1 cache verification ───────────────────────────────────────────

test('9. T1 cache exists in the stash', () => {
  const cachePath = join(WORKTREE, '.sandcastle', '.rules-stash', '.t1-cache.json');
  assert(existsSync(cachePath), '.t1-cache.json not found in stash');
  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert(Array.isArray(cached) && cached.length > 0, `T1 cache is empty or not an array (${cached.length} blocks)`);
  console.log(`    T1 cache has ${cached.length} blocks`);
});

test('10. apply-t1.mjs can find T1 cache at .claude/rules/.t1-cache.json', () => {
  // This is where apply-t1.mjs looks (line 96 of apply-t1.mjs)
  const expectedPath = join(WORKTREE, '.claude', 'rules', '.t1-cache.json');
  assert(existsSync(expectedPath),
    `T1 CACHE UNREACHABLE: apply-t1.mjs looks at .claude/rules/.t1-cache.json but it was moved with the stash. ` +
    `T1 enforcement is broken in the container!`);
});

// ── Host safety verification ────────────────────────────────────────

test('11. Host .claude/rules/ is untouched', () => {
  const hostRules = readdirSync(join(PROJECT, '.claude', 'rules')).filter(f => f.endsWith('.md'));
  assert(hostRules.length >= 3, `host rules missing: ${hostRules}`);
});

test('12. Host .claude/skills/ is untouched', () => {
  const hostSkills = readdirSync(join(PROJECT, '.claude', 'skills'));
  assert(hostSkills.length >= 10, `host skills missing: only ${hostSkills.length}`);
});

test('13. Host .claude/agents/ is untouched', () => {
  assert(existsSync(join(PROJECT, '.claude', 'agents', 'visual-qa.md')), 'host agents missing');
});

// ── Cleanup ─────────────────────────────────────────────────────────

rmSync(WORKTREE, { recursive: true, force: true });

// ── Results ─────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
