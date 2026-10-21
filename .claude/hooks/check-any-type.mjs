#!/usr/bin/env node
// PreToolUse hook: block `any` type usage in TypeScript source.
// Must use `unknown` and narrow. Exit 2 = block.
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

// Only check TypeScript files in src/.
if (!rel.startsWith('src/')) process.exit(0);
if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) process.exit(0);

// Matches: `: any`, `<any>`, `as any` — word-bounded to avoid "company", "anyOf".
const ANY_RE = /:\s*any\b(?!\w)|<any>|\bas\s+any\b/;

for (const content of getContents()) {
  if (ANY_RE.test(content)) {
    block('No `any` types. Use `unknown` and narrow. See CODING_STANDARDS.md > TypeScript.');
  }
}

process.exit(0);
