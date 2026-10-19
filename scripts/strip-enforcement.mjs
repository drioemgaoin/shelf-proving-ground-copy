/**
 * Strip ```enforcement fences from .claude/rules/*.md in-place.
 * Called by onSandboxReady hooks so the LLM sees clean prose rules.
 *
 * Before stripping, parses all enforcement blocks and caches T1 blocks
 * to .claude/rules/.t1-cache.json so the apply-t1.mjs hook (which runs
 * inside the same container) can still enforce them.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripEnforcementFences, parseEnforcementBlocks } from '../.claude/hooks/lib/rules.mjs';

// Guard: refuse to strip enforcement on the host project root.
// This script must only run inside a sandcastle worktree (via Docker).
const cwd = resolve('.');
if (!cwd.includes('worktrees') && !process.env.SANDCASTLE_WORKTREE) {
  console.error(
    `strip-enforcement refused: cwd "${cwd}" does not look like a sandcastle worktree. ` +
    'This would modify the host .claude/rules.'
  );
  process.exit(1);
}

const rulesDir = '.claude/rules';
if (!existsSync(rulesDir)) {
  // Directory may be absent in sandboxes where rules were stashed or
  // the worktree was created from a state without .claude/rules.
  // Nothing to strip — exit cleanly.
  process.exit(0);
}
const mdFiles = readdirSync(rulesDir).filter(f => f.endsWith('.md') || f.endsWith('.markdown'));

// ── Cache T1 blocks BEFORE stripping ──────────────────────────────────
// The apply-t1.mjs hook runs inside the container after stripping, so it
// cannot parse enforcement blocks from the stripped markdown.  This cache
// gives it the pre-strip T1 data.
const allT1Blocks = [];
for (const f of mdFiles) {
  const path = join(rulesDir, f);
  const content = readFileSync(path, 'utf8');
  const { blocks } = parseEnforcementBlocks(content, path);
  allT1Blocks.push(...blocks.filter(b => b.tier === 'T1'));
}
writeFileSync(join(rulesDir, '.t1-cache.json'), JSON.stringify(allT1Blocks));

// ── Strip enforcement fences ──────────────────────────────────────────
for (const f of mdFiles) {
  const path = join(rulesDir, f);
  const original = readFileSync(path, 'utf8');
  const stripped = stripEnforcementFences(original);
  if (stripped !== original) writeFileSync(path, stripped);
}
