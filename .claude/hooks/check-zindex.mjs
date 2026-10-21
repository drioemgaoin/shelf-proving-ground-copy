#!/usr/bin/env node
// PreToolUse hook: block raw z-index values — must use var(--shelf-z-*) tokens.
// Exit 2 = block.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = input.tool_name;
const ti = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function block(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function getContents() {
  if (tool === 'Write') return [String(ti.content ?? '')];
  if (tool === 'Edit') return [String(ti.new_string ?? '')];
  if (tool === 'MultiEdit') return (ti.edits ?? []).map((e) => String(e.new_string ?? ''));
  return [];
}

function getFilePath() {
  return String(ti.file_path ?? '');
}

if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) process.exit(0);

const abs = getFilePath();
const rel = relative(projectDir, abs).replace(/\\/g, '/');

// Only check CSS files in src/.
if (!rel.startsWith('src/') || !rel.endsWith('.css')) process.exit(0);

// Matches z-index with a raw number. Allows var(--shelf-z-*), auto, inherit, etc.
const RAW_ZINDEX_RE = /z-index\s*:\s*(?!var\(--shelf-z-)\d/;

for (const content of getContents()) {
  if (RAW_ZINDEX_RE.test(content)) {
    block(
      'Use `var(--shelf-z-*)` tokens for z-index. See ui-project.md > Spacing, radius, elevation.',
    );
  }
}

process.exit(0);
