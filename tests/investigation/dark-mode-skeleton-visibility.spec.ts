import { test, expect } from '../../qa/support/fixtures';

/**
 * Verifies skeleton shimmer bars are visible in dark mode.
 *
 * Root cause: --shelf-skeleton-opacity-min was 0.1, making skeleton bars
 * invisible against dark card backgrounds (neutral-8) when animation is
 * paused (reduced-motion or test freeze). Fixed by overriding skeleton
 * opacity tokens in the dark mode block.
 */
test.describe('Dark mode skeleton visibility @djk.1', () => {
  test('skeleton bars have sufficient opacity in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/?fixture=slow');

    // Wait for skeleton cards to render
    const skeletonBar = page.locator('.skeleton-bar').first();
    await skeletonBar.waitFor({ state: 'visible', timeout: 5_000 });

    // Read computed opacity — with reduced-motion, animation is none so
    // opacity stays at the min value
    const opacity = await skeletonBar.evaluate(
      (el) => parseFloat(getComputedStyle(el).opacity),
    );

    // Skeleton bars must be perceptible: opacity >= 0.15 ensures visibility
    // on dark backgrounds (neutral-7 bar on neutral-8 card)
    expect(opacity).toBeGreaterThanOrEqual(0.15);
  });
});
