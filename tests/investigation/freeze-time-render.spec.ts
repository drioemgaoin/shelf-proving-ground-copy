/**
 * Regression test: freezeTime must not prevent React from rendering.
 *
 * Root cause: page.clock.install() freezes ALL timers (setTimeout, rAF,
 * performance.now). React 18's scheduler relies on these to complete its
 * render cycle. The fix: freezeTime now uses page.clock.setFixedTime()
 * which only pins Date without freezing timers.
 */
import { test, expect } from '../../qa/support/fixtures';
import { freezeTime, stabilize } from '../../qa/support/ui';

test.describe('freezeTime + React render', () => {
  test('page renders content after freezeTime + goto', async ({ page }) => {
    await freezeTime(page);
    await page.goto('/');
    await stabilize(page);

    // The shelf heading must be visible — not a blank page.
    await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();

    // Book cards must render (default fixture = 6 seed books).
    const cards = page.getByRole('list').getByRole('listitem');
    await expect(cards).toHaveCount(6);
  });

  test('screenshot after freezeTime is not blank', async ({ page }) => {
    await freezeTime(page);
    await page.goto('/');
    await stabilize(page);

    // Take a screenshot and verify it has meaningful content by checking
    // that the pixel data is not a single solid color.
    const buffer = await page.screenshot();
    // A blank 1280x800 screenshot compresses to ~5KB. A rendered page is >15KB.
    expect(buffer.length).toBeGreaterThan(10_000);
  });

  test('Date.now() is frozen by freezeTime', async ({ page }) => {
    await freezeTime(page, '2026-06-15T12:00:00Z');
    await page.goto('/');
    await stabilize(page);

    const dateNow = await page.evaluate(() => Date.now());
    const expected = new Date('2026-06-15T12:00:00Z').getTime();
    expect(dateNow).toBe(expected);
  });
});
