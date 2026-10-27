#!/usr/bin/env node
/**
 * RED/GREEN tests for the intent color token system.
 *
 * Gap: tokens.css had no vocabulary for data-driven colors (status, severity,
 * category). The builder implemented all badge statuses with one neutral color
 * because no per-status tokens existed.
 *
 * RED:  without intent tokens, the only badge colors are generic bgColor-inset
 * GREEN: intent tokens chain primitive → semantic → component, with dark mode
 *
 * Seam: src/styles/tokens.css token architecture
 * Level: unit
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${label} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const tokens = readFileSync('src/styles/tokens.css', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// Tier 1: Primitive status color slots exist
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Primitive tier: status color slots ---');

const STATUSES = ['to-read', 'reading', 'finished'];
const PRIM_SUFFIXES = ['light', 'dark', 'light-inv', 'dark-inv'];

for (const status of STATUSES) {
  for (const suffix of PRIM_SUFFIXES) {
    const token = `--shelf-base-status-${status}-${suffix}`;
    test(`primitive ${token} exists`, () => {
      assert(tokens.includes(token), `Missing primitive token: ${token}`);
    });
  }
}

test('primitive status tokens use hsl (not raw hex)', () => {
  const primBlock = tokens.match(/--- Status intent.*?(?=\n\s*\/\*)/s)?.[0] ?? '';
  assert(primBlock.includes('hsl('), 'Status primitives must use hsl() values');
  assert(!/#[0-9a-f]{3,8}/i.test(primBlock), 'No raw hex in status primitives');
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier 2: Semantic intent tokens exist and alias primitives
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Semantic tier: intent tokens ---');

const ROLES = ['bgColor', 'fgColor'];

for (const status of STATUSES) {
  for (const role of ROLES) {
    const token = `--shelf-intent-${status}-${role}`;
    test(`semantic ${token} exists`, () => {
      assert(tokens.includes(token), `Missing semantic intent token: ${token}`);
    });

    test(`semantic ${token} aliases a primitive`, () => {
      const pattern = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*var\\(--shelf-base-status-`);
      assert(pattern.test(tokens), `${token} must alias a --shelf-base-status-* primitive`);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tier 3: Component badge tokens exist and alias intent tokens
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Component tier: badge aliases ---');

for (const status of STATUSES) {
  for (const role of ROLES) {
    const compToken = `--shelf-card-badge-${role}-${status}`;
    const intentToken = `--shelf-intent-${status}-${role}`;

    test(`component ${compToken} exists`, () => {
      assert(tokens.includes(compToken), `Missing component token: ${compToken}`);
    });

    test(`component ${compToken} aliases intent ${intentToken}`, () => {
      const pattern = new RegExp(
        `${compToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*var\\(${intentToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      );
      assert(pattern.test(tokens), `${compToken} must alias ${intentToken}`);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dark mode: intent tokens overridden in both dark blocks
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Dark mode: intent overrides ---');

const explicitDarkBlock = tokens.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
const mediaDarkBlock = tokens.match(/prefers-color-scheme:\s*dark\)[\s\S]*?\{([\s\S]*?)\n\s*\}\n\s*\}/)?.[1] ?? '';

for (const status of STATUSES) {
  for (const role of ROLES) {
    const token = `--shelf-intent-${status}-${role}`;

    test(`dark [data-theme]: ${token} overridden`, () => {
      assert(explicitDarkBlock.includes(token), `${token} missing from [data-theme="dark"] block`);
    });

    test(`dark @media: ${token} overridden`, () => {
      assert(mediaDarkBlock.includes(token), `${token} missing from @media (prefers-color-scheme: dark) block`);
    });
  }
}

test('dark intent tokens use -inv primitives (inverted for dark bg)', () => {
  const darkIntentLines = explicitDarkBlock.split('\n').filter(l => l.includes('--shelf-intent-'));
  for (const line of darkIntentLines) {
    assert(line.includes('-inv'), `Dark intent token must reference -inv primitive: ${line.trim()}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Architecture: intent tokens are NOT directly used in component CSS
// (they live only in tokens.css, consumed by component aliases)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n--- Architecture: intent tokens stay in tokens.css ---');

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const componentDir = 'src/components';
let intentInComponentCSS = false;
let offendingFile = '';

function walkCSSFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkCSSFiles(path);
    else if (entry.name.endsWith('.css')) {
      const css = readFileSync(path, 'utf8');
      if (css.includes('--shelf-intent-')) {
        intentInComponentCSS = true;
        offendingFile = path;
      }
    }
  }
}

try { walkCSSFiles(componentDir); } catch { /* no component CSS yet */ }

test('intent tokens never appear in component CSS', () => {
  assert(!intentInComponentCSS, `Intent token found in component CSS: ${offendingFile}. Use component-tier alias instead.`);
});

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\nintent-tokens: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
