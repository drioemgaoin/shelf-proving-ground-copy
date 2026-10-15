#!/usr/bin/env node
/**
 * Automated proof that ESLint rules catch the expected violations.
 * Creates a temp file with intentional violations, runs ESLint, asserts results.
 *
 * Run: node scripts/test-eslint.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const TMP = 'src/__lint-test-tmp.ts';

// Violation file: one per rule.
const VIOLATION_CODE = `\
const snake_case_var = 1;
const a = 1, b = 2, c = 3, d = 4, e = 5;
const nested = a ? b ? c : d : e;
export default function BadExport() { return null; }
export { snake_case_var };
`;

const EXPECTED_RULES = ['camelcase', 'no-nested-ternary', 'no-restricted-syntax'];

let exitCode = 0;

try {
  writeFileSync(TMP, VIOLATION_CODE);

  let output;
  try {
    output = execSync(`npx eslint ${TMP} --format json 2>/dev/null`, { encoding: 'utf8' });
  } catch (e) {
    // ESLint exits non-zero when it finds violations — that's expected.
    output = e.stdout || '';
  }

  const results = JSON.parse(output);
  const messages = results[0]?.messages ?? [];
  const foundRules = new Set(messages.map((m) => m.ruleId));

  console.log('ESLint violation detection:');
  for (const rule of EXPECTED_RULES) {
    if (foundRules.has(rule)) {
      console.log(`  PASS: ${rule} detected`);
    } else {
      console.log(`  FAIL: ${rule} NOT detected`);
      exitCode = 1;
    }
  }

} finally {
  if (existsSync(TMP)) unlinkSync(TMP);
}

// Verify existing code is clean (temp file already deleted).
try {
  execSync('npm run lint 2>&1', { encoding: 'utf8', stdio: 'pipe' });
  console.log('  PASS: existing codebase has 0 violations');
} catch (e) {
  console.log(`  FAIL: existing codebase has violations:\n${e.stdout}`);
  exitCode = 1;
}

console.log('');
console.log(exitCode === 0 ? 'ESLint tests: all passed' : 'ESLint tests: FAILED');
process.exit(exitCode);
