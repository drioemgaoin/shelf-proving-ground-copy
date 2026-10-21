#!/usr/bin/env node
// PreToolUse hook: block CSS custom property declarations not using --shelf- prefix.
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

// Only check CSS in src/, skip tokens.css (it defines the token namespace).
if (!rel.startsWith('src/') || !rel.endsWith('.css')) process.exit(0);
if (rel === 'src/styles/tokens.css') process.exit(0);

// Matches custom property declarations that don't use --shelf- prefix.
// A declaration looks like: `--foo-bar: value;` at the start of a line (with optional whitespace).
// Does NOT match var(--foo) references — only declarations.
const BAD_NAMESPACE_RE = /^\s*--(?!shelf-)[a-zA-Z][\w-]*\s*:/m;

for (const content of getContents()) {
  if (BAD_NAMESPACE_RE.test(content)) {
    block(
      'All custom properties must use the `--shelf-` prefix. See ui-project.md > Namespace.',
    );
  }
}

process.exit(0);
