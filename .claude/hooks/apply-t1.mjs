#!/usr/bin/env node
/**
 * Generic T1 enforcement hook.
 * Reads enforcement blocks from rule files, applies T1-tier regex checks
 * against file content from PreToolUse payloads.
 *
 * Exit 0 = allow, exit 2 = block (violation found).
 */
import { readFileSync, statSync } from 'node:fs';
import { relative, join } from 'node:path';
import { discoverRulesFiles, parseEnforcementBlocks, globMatch, stripContent } from './lib/rules.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const ruleFilter = process.env.T1_RULE_FILTER ?? null;

// ─── Monitoring (fail-open: never breaks the hook) ────────────────

let recorder = null;
try {
  const { createRecorder } = await import('../../scripts/monitor/recorder.mjs');
  recorder = createRecorder(projectDir);
} catch {
  // Monitor unavailable — proceed without it
}

function recordEvent(ruleId, outcome, file, details = {}) {
  try {
    recorder?.record({ tier: 'T1', ruleId, outcome, file, details });
  } catch {
    // Monitoring must never break the hook
  }
}

// ─── Rule cache (by mtime + size) ──────────────────────────────────

const ruleCache = new Map();

function getCachedRules(filePath) {
  try {
    const st = statSync(filePath);
    const key = `${st.mtimeMs}:${st.size}`;
    const cached = ruleCache.get(filePath);
    if (cached && cached.key === key) return cached;

    const content = readFileSync(filePath, 'utf8');
    const { blocks, errors } = parseEnforcementBlocks(content, filePath);
    const entry = { key, blocks, errors, filePath };
    ruleCache.set(filePath, entry);
    return entry;
  } catch {
    return { key: null, blocks: [], errors: [{ file: filePath, message: 'Failed to read file' }], filePath };
  }
}

// ─── Read hook input ───────────────────────────────────────────────

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = input.tool_name;
const ti = input.tool_input ?? {};

if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) process.exit(0);

function getContents() {
  if (tool === 'Write') return [String(ti.content ?? '')];
  if (tool === 'Edit') return [String(ti.new_string ?? '')];
  if (tool === 'MultiEdit') return (ti.edits ?? []).map((e) => String(e.new_string ?? ''));
  return [];
}

const abs = String(ti.file_path ?? '');
const rel = relative(projectDir, abs).replace(/\\/g, '/');

// ─── Binary detection ──────────────────────────────────────────────

function isBinary(content) {
  const check = content.slice(0, 8192);
  return check.includes('\0');
}

const contents = getContents();
const contentIsBinary = contents.some((c) => isBinary(c));

// ─── Discover and parse rules ──────────────────────────────────────
//
// Inside a sandcastle container strip-enforcement.mjs removes the
// ```enforcement fences before this hook runs, so parsing the stripped
// markdown would yield 0 blocks.  To work around this, strip-enforcement
// writes .t1-cache.json with the pre-strip T1 blocks.  We try the cache
// first and fall back to live parsing (host mode, no stripping).

let allBlocks = [];
let malformedFiles = new Set();
let usedCache = false;

try {
  const cachePath = join(projectDir, '.claude', 'rules', '.t1-cache.json');
  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  if (Array.isArray(cached) && cached.length > 0) {
    allBlocks = cached;
    usedCache = true;
  }
} catch {
  // No cache — fall back to file discovery (host mode)
}

if (!usedCache) {
  const rulesFiles = discoverRulesFiles(projectDir);

  if (rulesFiles.length === 0) {
    process.stderr.write('apply-t1: warning: no rules files found, allowing write\n');
    process.exit(0);
  }

  for (const file of rulesFiles) {
    const { blocks, errors } = getCachedRules(file);

    if (errors.length > 0) {
      malformedFiles.add(file);
      for (const err of errors) {
        process.stderr.write(`apply-t1: parse error in ${err.file}: ${err.message}\n`);
      }
    }

    for (const block of blocks) {
      if (block.tier === 'T1') {
        allBlocks.push(block);
      }
    }
  }
}

// ─── Scope matching ────────────────────────────────────────────────

// Split a comma-separated string, but ignore commas inside braces.
function splitOutsideBraces(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of str) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function matchesScope(block) {
  // Check scope (comma-separated globs, respecting braces).
  const scopes = splitOutsideBraces(block.scope ?? '');
  if (scopes.length === 0) return true;

  const inScope = scopes.some((s) => globMatch(s, rel));
  if (!inScope) return false;

  // Check exclude.
  if (block.exclude) {
    const excludes = splitOutsideBraces(block.exclude);
    if (excludes.some((e) => globMatch(e, rel))) return false;
  }

  return true;
}

function isLockRule(block) {
  return block.pattern === '.*' && block.assert === 'absent';
}

// ─── Lock rules: block before binary skip ─────────────────────────
// Lock rules (pattern ".*", assert "absent") block ALL writes to their
// scope — content doesn't matter. Check them before skipping binaries,
// otherwise binary files bypass the lock entirely.

for (const block of allBlocks) {
  if (ruleFilter && block.id !== ruleFilter) continue;
  if (!isLockRule(block)) continue;
  if (!matchesScope(block)) continue;

  process.stderr.write(
    `BLOCKED: T1 violation\n\nfile: ${rel}\nrule: ${block.rule ?? 'Write to locked path'}\nfix: ${block.fix}\n`,
  );
  process.exit(2);
}

// Now safe to skip binary content for remaining (content-matching) rules.
if (contentIsBinary) process.exit(0);

// ─── Malformed YAML: fail-closed for matching scopes ───────────────

for (const mf of malformedFiles) {
  // If any block from a malformed file has a scope that matches, block.
  // Since parsing failed, we can't know scopes — fail-closed: block all writes.
  // But if we have cached blocks from a previous successful parse, use those.
  const cached = ruleCache.get(mf);
  if (cached && cached.errors.length > 0 && cached.blocks.length === 0) {
    // Fully malformed — no blocks parsed, fail-closed.
    process.stderr.write(
      `BLOCKED: T1 violation\n\nfile: ${rel}\nrule: Malformed enforcement rules in ${relative(projectDir, mf)}\nfix: Fix YAML syntax in the rules file\n`,
    );
    process.exit(2);
  }
}

// ─── Apply T1 blocks ───────────────────────────────────────────────

const violations = [];
const MATCH_TIMEOUT = 5000;

for (const block of allBlocks) {
  if (ruleFilter && block.id !== ruleFilter) continue;
  if (!matchesScope(block)) continue;

  // Validate regex.
  let re;
  try {
    re = new RegExp(block.pattern, 'gm');
  } catch (err) {
    process.stderr.write(`apply-t1: invalid regex in block "${block.id}": ${err.message}, skipping\n`);
    continue;
  }

  const assertMode = (block.assert ?? 'absent').toLowerCase();
  const crossCheck = block['cross-check'] ?? null;

  // ─── cross-check: read a different file from disk instead of the written content ───
  // When cross-check is set, the rule is an invariant: "this other file must
  // contain the pattern, regardless of which file triggered the hook."
  // For Write to the cross-checked file itself, use the written content (it's the new version).
  if (crossCheck) {
    const crossAbs = join(projectDir, crossCheck);
    const crossRel = crossCheck.replace(/\\/g, '/');
    let checkContent;

    if (rel === crossRel && tool === 'Write') {
      // Writing to the cross-checked file — use the new content being written.
      checkContent = String(ti.content ?? '');
    } else if (rel === crossRel && tool === 'Edit') {
      // Editing the cross-checked file — simulate the result.
      try {
        let disk = readFileSync(crossAbs, 'utf8');
        if (ti.old_string) disk = disk.replace(ti.old_string, String(ti.new_string ?? ''));
        checkContent = disk;
      } catch {
        checkContent = String(ti.new_string ?? '');
      }
    } else {
      // Writing a different file — read the cross-checked file from disk.
      try {
        checkContent = readFileSync(crossAbs, 'utf8');
      } catch {
        // Cross-checked file doesn't exist — violation for assert:present.
        if (assertMode === 'present') {
          violations.push({
            blockId: block.id,
            file: crossRel,
            line: 1,
            match: `(cross-check file not found: ${crossCheck})`,
            rule: block.rule ?? block.ruleText ?? '',
            fix: block.fix,
          });
        }
        continue;
      }
    }

    const stripped = stripContent(checkContent, block.strip, crossRel);
    re.lastIndex = 0;
    const found = re.test(stripped);

    if (assertMode === 'present' && !found) {
      violations.push({
        blockId: block.id,
        file: crossRel,
        line: 1,
        match: '(pattern not found)',
        rule: block.rule ?? block.ruleText ?? '',
        fix: block.fix,
      });
    } else if (assertMode === 'absent' && found) {
      violations.push({
        blockId: block.id,
        file: crossRel,
        line: 1,
        match: '(pattern found in cross-checked file)',
        rule: block.rule ?? block.ruleText ?? '',
        fix: block.fix,
      });
    }
    continue;
  }

  // ─── Normal content check (no cross-check) ─────────────────────────
  for (const content of contents) {
    const stripped = stripContent(content, block.strip, rel);
    const lines = stripped.split('\n');

    // Gap 1: Track whether pattern was found (for assert: present).
    let foundInContent = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines matching the block's skip-lines pattern (structural exemptions).
      if (block['skip-lines']) {
        try {
          if (new RegExp(block['skip-lines']).test(line)) continue;
        } catch (err) {
          process.stderr.write(`apply-t1: invalid skip-lines regex in block "${block.id}": ${err.message}, ignoring\n`);
        }
      }

      re.lastIndex = 0;
      const start = Date.now();
      let m;
      while ((m = re.exec(line)) !== null) {
        if (Date.now() - start > MATCH_TIMEOUT) {
          // Timeout — fail-closed: treat as violation for absent mode.
          if (assertMode === 'absent') {
            violations.push({
              blockId: block.id,
              file: rel,
              line: i + 1,
              match: line.trim(),
              rule: block.rule ?? block.ruleText ?? '',
              fix: block.fix,
            });
          }
          foundInContent = true;
          break;
        }

        foundInContent = true;

        if (assertMode === 'absent') {
          violations.push({
            blockId: block.id,
            file: rel,
            line: i + 1,
            match: m[0],
            rule: block.rule ?? block.ruleText ?? '',
            fix: block.fix,
          });
        }
        break; // One violation per line per block is enough.
      }
    }

    // assert: present — pattern MUST appear. Violation if not found.
    if (assertMode === 'present' && !foundInContent) {
      // For Edit: new_string is a partial snippet. The pattern may already
      // exist in the file being edited — simulate the result by applying
      // the edit (old_string → new_string) to the current disk content.
      let resultHasPattern = false;
      if (tool === 'Edit') {
        try {
          let diskContent = readFileSync(abs, 'utf8');
          if (ti.old_string) {
            diskContent = diskContent.replace(ti.old_string, String(ti.new_string ?? ''));
          }
          const resultStripped = stripContent(diskContent, block.strip, rel);
          re.lastIndex = 0;
          resultHasPattern = re.test(resultStripped);
        } catch { /* file doesn't exist yet — fall through to violation */ }
      }
      if (!resultHasPattern) {
        violations.push({
          blockId: block.id,
          file: rel,
          line: 1,
          match: '(pattern not found)',
          rule: block.rule ?? block.ruleText ?? '',
          fix: block.fix,
        });
      }
    }
  }
}

if (violations.length > 0) {
  // Record blocked events for each unique rule that violated
  const violatedRules = new Set(violations.map(v => v.blockId).filter(Boolean));
  for (const ruleId of violatedRules) {
    const v = violations.find(x => x.blockId === ruleId);
    recordEvent(ruleId, 'blocked', rel, { match: v.match, line: v.line, fix: v.fix });
  }

  let msg = 'BLOCKED: T1 violation\n';
  for (const v of violations) {
    msg += `\nfile: ${v.file}\nline: ${v.line}\nmatch: "${v.match}"\nrule: ${v.rule}\nfix: ${v.fix}\n`;
  }
  process.stderr.write(msg);
  process.exit(2);
}

// Record passed events for in-scope T1 blocks that had no violations
for (const block of allBlocks) {
  if (isLockRule(block)) continue;
  if (!matchesScope(block)) continue;
  recordEvent(block.id, 'passed', rel);
}

process.exit(0);
