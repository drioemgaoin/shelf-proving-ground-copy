#!/usr/bin/env node
/**
 * RED/GREEN tests for shelf/viewport-tokens stylelint rule.
 *
 * Tests the custom stylelint rule directly via the stylelint.lint() API
 * to prove it catches raw breakpoints and allows @custom-media tokens.
 *
 * Seam: scripts/stylelint/shelf-rules.mjs > shelf/viewport-tokens
 * Level: unit
 */
import stylelint from 'stylelint';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function lintCSS(code, filename = 'src/components/Test.css') {
  const result = await stylelint.lint({
    code,
    config: {
      plugins: ['./scripts/stylelint/shelf-rules.mjs'],
      rules: {
        'shelf/viewport-tokens': true,
      },
    },
    codeFilename: filename,
  });
  return result.results[0]?.warnings ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
// RED: must reject raw breakpoints
// ═══════════════════════════════════════════════════════════════════════════

{
  const warns = await lintCSS('@media (width >= 768px) { .shelf { color: red; } }');
  assert(
    'RED: raw 768px in @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected shelf/viewport-tokens violation, got ${warns.length} warnings`,
  );
}

{
  const warns = await lintCSS('@media (width >= 1024px) { .grid { display: grid; } }');
  assert(
    'RED: raw 1024px in @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected violation for 1024px`,
  );
}

{
  const warns = await lintCSS('@media (width >= 48rem) { .shelf { gap: 1rem; } }');
  assert(
    'RED: raw 48rem in @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected violation for 48rem`,
  );
}

{
  const warns = await lintCSS('@media (height >= 600px) { .drawer { max-height: 70vh; } }');
  assert(
    'RED: raw px on height @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected violation for height 600px`,
  );
}

{
  const warns = await lintCSS('@media (width >= 100vw) { .layout { overflow: hidden; } }');
  assert(
    'RED: raw vw in @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected violation for 100vw`,
  );
}

{
  const warns = await lintCSS('@media (width >= 480px) and (width < 768px) { .card { flex: 1; } }');
  assert(
    'RED: raw px range in @media',
    warns.length > 0 && warns[0].rule === 'shelf/viewport-tokens',
    `Expected violation for 480px range`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN: must allow @custom-media tokens and non-media rules
// ═══════════════════════════════════════════════════════════════════════════

{
  const warns = await lintCSS('@media (--viewport-md) { .shelf { gap: 1rem; } }');
  assert(
    'GREEN: @custom-media token (--viewport-md)',
    warns.length === 0,
    `Expected no violations, got ${warns.length}`,
  );
}

{
  const warns = await lintCSS('@media (--viewport-lg) { .grid { grid-template-columns: repeat(3, 1fr); } }');
  assert(
    'GREEN: @custom-media token (--viewport-lg)',
    warns.length === 0,
    `Expected no violations, got ${warns.length}`,
  );
}

{
  const warns = await lintCSS('@media (prefers-color-scheme: dark) { :root { color: white; } }');
  assert(
    'GREEN: prefers-color-scheme (no breakpoint)',
    warns.length === 0,
    `Expected no violations, got ${warns.length}`,
  );
}

{
  const warns = await lintCSS('@media (prefers-reduced-motion: reduce) { .card { animation: none; } }');
  assert(
    'GREEN: prefers-reduced-motion (no breakpoint)',
    warns.length === 0,
    `Expected no violations, got ${warns.length}`,
  );
}

{
  const warns = await lintCSS('.card { padding: 16px; }');
  assert(
    'GREEN: no @media at all',
    warns.length === 0,
    `Expected no violations on non-media rule, got ${warns.length}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\nviewport-tokens stylelint: ${passed}/${passed + failed} passed`);
if (failures.length) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
