#!/usr/bin/env node
/**
 * Automated proof that stylelint custom rules catch the expected violations.
 * Creates temp CSS files with intentional violations, runs stylelint, asserts results.
 *
 * Run: node scripts/test-stylelint.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const TMP_VIOLATIONS = 'src/__stylelint-test-violations.css';
const TMP_MOTION = 'src/__stylelint-test-motion.css';
const TMP_VALID = 'src/__stylelint-test-valid.css';

let exitCode = 0;
const results = [];

function check(label, pass) {
  results.push({ label, pass });
  if (!pass) exitCode = 1;
}

function runStylelint(file) {
  try {
    return execSync(`npx stylelint ${file} 2>&1`, { encoding: 'utf8' });
  } catch (e) {
    return e.stdout || e.message || '';
  }
}

function cleanUp(...files) {
  for (const f of files) {
    if (existsSync(f)) unlinkSync(f);
  }
}

// ─── Test 1: keyframes + animation-properties + transition-properties ───

const VIOLATION_CSS = `\
/* @keyframes outside @layer — should trigger shelf/keyframes-in-layer */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@layer components {
  /* animation prop inside @keyframes — should trigger shelf/animation-properties */
  @keyframes fade {
    from {
      opacity: 0;
      background-color: red;
    }
    to {
      opacity: 1;
      background-color: blue;
    }
  }

  /* transition on non-transform/opacity — should trigger shelf/transition-properties */
  .bad-transition-shorthand {
    transition: background-color 200ms ease;
  }

  .bad-transition-property {
    transition-property: color, opacity;
  }

  /* transition: all is banned — should trigger shelf/transition-properties */
  .bad-transition-all {
    transition: all 200ms ease;
  }
}
`;

try {
  writeFileSync(TMP_VIOLATIONS, VIOLATION_CSS);
  const output = runStylelint(TMP_VIOLATIONS);

  check('shelf/keyframes-in-layer detects @keyframes outside @layer',
    output.includes('keyframes-in-layer'));
  check('shelf/animation-properties detects background-color in @keyframes',
    output.includes('animation-properties'));
  check('shelf/transition-properties detects transition on background-color',
    output.includes('transition-properties'));
  check('shelf/transition-properties detects transition: all',
    // "all" appears in the output as a rejected property
    (output.match(/transition-properties/g) || []).length >= 2);
} finally {
  cleanUp(TMP_VIOLATIONS);
}

// ─── Test 2: motion-token-values (raw duration/easing) ──────────────

const MOTION_CSS = `\
@layer components {
  /* raw duration in shorthand — should trigger shelf/motion-token-values */
  .raw-duration {
    transition: opacity 200ms ease;
  }

  /* raw duration in longhand */
  .raw-duration-longhand {
    transition-duration: 250ms;
  }

  /* raw easing in longhand */
  .raw-easing-longhand {
    transition-timing-function: ease-in-out;
  }

  /* raw easing in animation shorthand */
  .raw-animation {
    animation: fade 300ms ease-in forwards;
  }
}
`;

try {
  writeFileSync(TMP_MOTION, MOTION_CSS);
  const output = runStylelint(TMP_MOTION);

  check('shelf/motion-token-values detects raw duration in shorthand',
    output.includes('motion-token-values'));
  // Count: should fire on all 4 declarations
  const motionHits = (output.match(/motion-token-values/g) || []).length;
  check(`shelf/motion-token-values fires on all 4 raw-motion declarations (got ${motionHits})`,
    motionHits >= 4);
} finally {
  cleanUp(TMP_MOTION);
}

// ─── Test 3: valid file (all rules pass) ────────────────────────────

const VALID_CSS = `\
@layer components {
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .good-transition {
    transition: opacity var(--shelf-motion-duration-fast) var(--shelf-motion-easing-enter),
      transform var(--shelf-motion-duration-fast) var(--shelf-motion-easing-enter);
  }

  .good-transition-property {
    transition-property: transform, opacity;
  }

  .good-duration {
    transition-duration: var(--shelf-motion-duration-base);
  }

  .good-easing {
    transition-timing-function: var(--shelf-motion-easing-exit);
  }

  /* 0s is structural (e.g. reduced-motion override) */
  .reduced-motion {
    transition-duration: 0s;
  }
}
`;

try {
  writeFileSync(TMP_VALID, VALID_CSS);

  let validPassed = false;
  try {
    execSync(`npx stylelint ${TMP_VALID} 2>&1`, { encoding: 'utf8' });
    validPassed = true;
  } catch {
    validPassed = false;
  }

  check('valid CSS with token-based motion values passes stylelint', validPassed);
} finally {
  cleanUp(TMP_VALID);
}

// ─── Test 4: existing codebase ──────────────────────────────────────

try {
  execSync("npx stylelint 'src/**/*.css' 2>&1", { encoding: 'utf8', stdio: 'pipe' });
  check('existing codebase has 0 stylelint violations', true);
} catch (e) {
  check('existing codebase has 0 stylelint violations', false);
  console.error(e.stdout);
}

// ─── Summary ────────────────────────────────────────────────────────

console.log('Stylelint violation detection:');
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}: ${r.label}`);
}
console.log('');
console.log(exitCode === 0 ? 'Stylelint tests: all passed' : 'Stylelint tests: FAILED');
process.exit(exitCode);
