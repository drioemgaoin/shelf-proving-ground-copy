#!/usr/bin/env node
/**
 * Auto-discovers and runs every *.test.mjs file under qa/.
 * Each file runs as a child process; the runner exits non-zero if any fail.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collect(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collect(full));
    } else if (entry.endsWith('.test.mjs')) {
      results.push(full);
    }
  }
  return results;
}

const files = collect('qa').sort();
let failures = 0;

for (const file of files) {
  try {
    execFileSync('node', [file], { stdio: 'inherit' });
  } catch {
    failures++;
  }
}

console.log(`\n${files.length} script test files, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
