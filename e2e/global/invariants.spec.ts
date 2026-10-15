/**
 * T2 global invariants — generated from enforcement blocks in rules files.
 *
 * Each T2 block with scope: global produces one test per fixture x viewport.
 * Do not edit by hand; regenerate via ui-contract global mode.
 */
import { test, expect } from '../support/fixtures';
import {
  expectNoA11yViolations,
  expectNoHorizontalOverflow,
  expectMinTargetSize,
  measureFrames,
  recordLayoutShifts,
  resetLayoutShifts,
  layoutShift,
} from '../support/ui';

// ---------------------------------------------------------------------------
// Matrix dimensions
// ---------------------------------------------------------------------------

const FIXTURES: Array<string | undefined> = [
  undefined,  // default seed data
  'empty',
  'error',
  'slow',
  'long',
  'many',
];

const VIEWPORTS = [
  { name: 'mobile', width: 320, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadFixture(page: import('@playwright/test').Page, fixture?: string) {
  const qs = fixture ? `?fixture=${fixture}` : '';
  await page.goto(`/${qs}`);
}

function fixtureName(fixture: string | undefined): string {
  return fixture ?? 'default';
}

// ---------------------------------------------------------------------------
// T2 global: no-axe-violations
// assert: expectNoA11yViolations(page)
// ---------------------------------------------------------------------------

test.describe('T2 global: no-axe-violations', () => {
  for (const fixture of FIXTURES) {
    for (const vp of VIEWPORTS) {
      const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

      test(`no-axe-violations: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loadFixture(page, fixture);
        await expectNoA11yViolations(page);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// T2 global: no-horizontal-overflow
// assert: expectNoHorizontalOverflow(page)
// ---------------------------------------------------------------------------

test.describe('T2 global: no-horizontal-overflow', () => {
  for (const fixture of FIXTURES) {
    for (const vp of VIEWPORTS) {
      const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

      test(`no-horizontal-overflow: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loadFixture(page, fixture);
        await expectNoHorizontalOverflow(page);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// T2 global: cls-budget
// assert: recordLayoutShifts -> resetLayoutShifts -> page load -> layoutShift < 0.01
// ---------------------------------------------------------------------------

test.describe('T2 global: cls-budget', () => {
  for (const fixture of FIXTURES) {
    for (const vp of VIEWPORTS) {
      const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

      test(`cls-budget: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await recordLayoutShifts(page);
        await loadFixture(page, fixture);
        await resetLayoutShifts(page);
        // Wait for any post-load layout to settle
        await page.waitForTimeout(500);
        const shift = await layoutShift(page);
        expect(shift.total).toBeLessThan(0.01);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// T2 global: pointer-target-size
// assert: expectMinTargetSize(page, 24)
// ---------------------------------------------------------------------------

test.describe('T2 global: pointer-target-size', () => {
  for (const fixture of FIXTURES) {
    for (const vp of VIEWPORTS) {
      const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

      test(`pointer-target-size: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loadFixture(page, fixture);
        await expectMinTargetSize(page, 24);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// T2 global: motion-smoothness
// assert: measureFrames(page, trigger, durationMs)
// ---------------------------------------------------------------------------

test.describe('T2 global: motion-smoothness', () => {
  for (const fixture of FIXTURES) {
    for (const vp of VIEWPORTS) {
      const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

      test(`motion-smoothness: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const result = await measureFrames(
          page,
          async () => { await loadFixture(page, fixture); },
          500, // covers slowest motion token (400ms) + margin
        );
        expect(result.longFrames).toBeLessThanOrEqual(2);
      });
    }
  }
});
