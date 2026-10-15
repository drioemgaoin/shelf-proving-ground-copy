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

// The error fixture intentionally throws — allow that in the console guard.
const ERROR_FIXTURE_ALLOW = /Failed to load the shelf/;

// ---------------------------------------------------------------------------
// Helper: generate fixture x viewport tests inside a describe, handling
// the error fixture's expected uncaught error automatically.
// ---------------------------------------------------------------------------

function forEachFixtureAndViewport(
  suiteName: string,
  testName: string,
  fn: (page: import('@playwright/test').Page, fixture: string | undefined, vp: typeof VIEWPORTS[number]) => Promise<void>,
) {
  test.describe(suiteName, () => {
    for (const fixture of FIXTURES) {
      test.describe(`fixture: ${fixtureName(fixture)}`, () => {
        if (fixture === 'error') {
          test.use({ allowedErrors: ERROR_FIXTURE_ALLOW });
        }

        for (const vp of VIEWPORTS) {
          const label = `${fixtureName(fixture)} @ ${vp.name} (${vp.width}px)`;

          test(`${testName}: ${label}`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await fn(page, fixture, vp);
          });
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// T2 global: no-axe-violations
// assert: expectNoA11yViolations(page)
// ---------------------------------------------------------------------------

forEachFixtureAndViewport('T2 global: no-axe-violations', 'no-axe-violations', async (page, fixture) => {
  await loadFixture(page, fixture);
  await expectNoA11yViolations(page);
});

// ---------------------------------------------------------------------------
// T2 global: no-horizontal-overflow
// assert: expectNoHorizontalOverflow(page)
// ---------------------------------------------------------------------------

forEachFixtureAndViewport('T2 global: no-horizontal-overflow', 'no-horizontal-overflow', async (page, fixture) => {
  await loadFixture(page, fixture);
  await expectNoHorizontalOverflow(page);
});

// ---------------------------------------------------------------------------
// T2 global: cls-budget
// assert: recordLayoutShifts -> resetLayoutShifts -> page load -> layoutShift < 0.01
// ---------------------------------------------------------------------------

forEachFixtureAndViewport('T2 global: cls-budget', 'cls-budget', async (page, fixture) => {
  await recordLayoutShifts(page);
  await loadFixture(page, fixture);
  await resetLayoutShifts(page);
  // Wait for any post-load layout to settle
  await page.waitForTimeout(500);
  const shift = await layoutShift(page);
  expect(shift.total).toBeLessThan(0.01);
});

// ---------------------------------------------------------------------------
// T2 global: pointer-target-size
// assert: expectMinTargetSize(page, 24)
// ---------------------------------------------------------------------------

forEachFixtureAndViewport('T2 global: pointer-target-size', 'pointer-target-size', async (page, fixture) => {
  await loadFixture(page, fixture);
  await expectMinTargetSize(page, 24);
});

// ---------------------------------------------------------------------------
// T2 global: motion-smoothness
// assert: measureFrames(page, trigger, durationMs)
// ---------------------------------------------------------------------------

forEachFixtureAndViewport('T2 global: motion-smoothness', 'motion-smoothness', async (page, fixture) => {
  const result = await measureFrames(
    page,
    async () => { await loadFixture(page, fixture); },
    500, // covers slowest motion token (400ms) + margin
  );
  expect(result.longFrames).toBeLessThanOrEqual(2);
});
