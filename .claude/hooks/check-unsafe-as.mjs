#!/usr/bin/env node
// PreToolUse hook: block unsafe `as Foo` type assertions in TypeScript source.
// Must use `satisfies` or type guards. Exit 2 = block.
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

if (!rel.startsWith('src/')) process.exit(0);
if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) process.exit(0);

// Matches `as Foo` but NOT `as const` or `as any` (any is caught by check-any-type).
// PascalCase target: starts with uppercase letter.
const UNSAFE_AS_RE = /\bas\s+(?!const\b|any\b)[A-Z][A-Za-z0-9.]*/;

for (const content of getContents()) {
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip import renames: `import { Foo as Bar }` is legitimate.
    if (/\bimport\b/.test(line)) continue;
    if (UNSAFE_AS_RE.test(line)) {
      block(
        'No unsafe `as` casts. Use `satisfies` or a type guard. See CODING_STANDARDS.md > TypeScript.',
      );
    }
  }
}

process.exit(0);
