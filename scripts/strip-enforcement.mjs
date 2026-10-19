/**
 * Strip ```enforcement fences from .claude/rules/*.md in-place.
 * Called by onSandboxReady hooks so the LLM sees clean prose rules.
 * T1/T2/T3 scripts read originals from the host — unaffected.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripEnforcementFences } from '../.claude/hooks/lib/rules.mjs';

const rulesDir = '.claude/rules';
if (!existsSync(rulesDir)) {
  // Directory may be absent in sandboxes where rules were stashed or
  // the worktree was created from a state without .claude/rules.
  // Nothing to strip — exit cleanly.
  process.exit(0);
}
for (const f of readdirSync(rulesDir)) {
  if (!f.endsWith('.md') && !f.endsWith('.markdown')) continue;
  const path = join(rulesDir, f);
  const original = readFileSync(path, 'utf8');
  const stripped = stripEnforcementFences(original);
  if (stripped !== original) writeFileSync(path, stripped);
}
