/**
 * Write .t1-cache.json for in-container T1 hook enforcement.
 *
 * Reads .claude/rules/*.md, parses all T1 enforcement blocks,
 * writes them to .claude/rules/.t1-cache.json. This file is read
 * by apply-t1.mjs when the rules directory has been stashed
 * (moved to .sandcastle/.rules-stash) so Claude Code doesn't load them.
 *
 * Run this BEFORE stashing .claude/rules/ in onSandboxReady.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  discoverRulesFiles,
  parseEnforcementBlocks,
} from '../.claude/hooks/lib/rules.mjs';

const projectDir = process.cwd();
const rulesFiles = discoverRulesFiles(projectDir);
const t1Blocks = [];

for (const file of rulesFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const { blocks } = parseEnforcementBlocks(content, file);
    for (const block of blocks) {
      if (block.tier === 'T1') {
        t1Blocks.push(block);
      }
    }
  } catch {
    // Skip unreadable files
  }
}

const cachePath = join(projectDir, '.claude', 'rules', '.t1-cache.json');
mkdirSync(dirname(cachePath), { recursive: true });
writeFileSync(cachePath, JSON.stringify(t1Blocks));

if (t1Blocks.length > 0) {
  process.stderr.write(`write-t1-cache: ${t1Blocks.length} T1 blocks cached\n`);
} else {
  process.stderr.write('write-t1-cache: ERROR: no T1 blocks found — rules files missing or unparseable\n');
  process.exit(1);
}
