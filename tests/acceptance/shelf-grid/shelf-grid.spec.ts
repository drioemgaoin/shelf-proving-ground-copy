import { test, expect } from '../../../qa/support/fixtures';
import {
  freezeTime, stabilize, expectScreenshot,
  readToken, toMs, resolveColor,
  readAnimations, setReducedMotion,
  measureFrames,
  recordLayoutShifts, resetLayoutShifts, layoutShift,
  expectNoHorizontalOverflow, widthSweep,
  expectNoA11yViolations, expectFocusVisibleOnTab,
} from '../../../qa/support/ui';
import { VIEWPORTS } from '../../../qa/support/viewports';

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function chipGroup(page: import('@playwright/test').Page) {
  return page.getByRole('group', { name: 'Filter by status' });
}

function chip(page: import('@playwright/test').Page, name: string) {
  return chipGroup(page).getByRole('button', { name });
}

function grid(page: import('@playwright/test').Page) {
  return page.getByRole('list');
}

function cards(page: import('@playwright/test').Page) {
  return grid(page).getByRole('listitem');
}

function liveRegion(page: import('@playwright/test').Page) {
  return page.locator('[aria-live="polite"]');
}
void liveRegion; // used by Drawer tests (future ticket)

async function loadShelf(page: import('@playwright/test').Page, fixture?: string) {
  const qs = fixture ? `?fixture=${fixture}` : '';
  await page.goto(`/${qs}`);
}

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------

test.describe('Shelf grid', () => {

  test('Shelf grid: shows all books by default', { tag: '@djk.1' }, async ({ page }) => {
    await loadShelf(page);
    await expect(cards(page)).toHaveCount(6);
  });

  test('Shelf grid: "All" chip is selected on load', { tag: '@djk.1' }, async ({ page }) => {
    await loadShelf(page);
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'To Read')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, 'Finished')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Shelf grid: filtering by one status shows matching books', { tag: '@djk.2' }, async ({ page }) => {
    await loadShelf(page);
    await chip(page, 'Reading').click();
    // Default seed: 2 books with status "reading"
    await expect(cards(page)).toHaveCount(2);
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Shelf grid: filtering by multiple statuses', { tag: '@djk.2' }, async ({ page }) => {
    await loadShelf(page);
    await chip(page, 'To Read').click();
    await chip(page, 'Reading').click();
    // Default seed: 2 to-read + 2 reading = 4
    await expect(cards(page)).toHaveCount(4);
    await expect(chip(page, 'To Read')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Shelf grid: deselecting all chips returns to "All"', { tag: '@djk.2' }, async ({ page }) => {
    await loadShelf(page);
    await chip(page, 'Reading').click();
    await expect(cards(page)).toHaveCount(2);
    // Deselect the only active chip
    await chip(page, 'Reading').click();
    await expect(cards(page)).toHaveCount(6);
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Shelf grid: tapping "All" resets filter', { tag: '@djk.2' }, async ({ page }) => {
    await loadShelf(page);
    await chip(page, 'Reading').click();
    await expect(cards(page)).toHaveCount(2);
    await chip(page, 'All').click();
    await expect(cards(page)).toHaveCount(6);
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Shelf grid: newest-first order', { tag: '@djk.1' }, async ({ page }) => {
    await loadShelf(page);
    // First seed book (newest by array position) is "The Left Hand of Darkness"
    await expect(cards(page).first()).toContainText('The Left Hand of Darkness');
  });

  test('Shelf grid: keyboard can toggle filter chips', { tag: '@djk.2' }, async ({ page }) => {
    await loadShelf(page);
    await chip(page, 'Reading').focus();
    await page.keyboard.press('Enter');
    await expect(cards(page)).toHaveCount(2);
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'true');
    // Space also works
    await page.keyboard.press('Space');
    await expect(cards(page)).toHaveCount(6);
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Shelf grid: shows skeleton cards while loading', { tag: '@djk.1' }, async ({ page }) => {
    await loadShelf(page, 'slow');
    // Slow fixture delays 2s — skeletons should be visible immediately
    await expect(cards(page)).toHaveCount(6);
  });

  // ---------------------------------------------------------------------------
  // Visual (@visual)
  // ---------------------------------------------------------------------------

  test('Shelf grid: chip visual states', { tag: ['@visual', '@djk.1'] }, async ({ page }) => {
    await loadShelf(page);

    // -- Unselected: default --
    const subtleBorder = await readToken(page, '--shelf-borderColor-subtle');
    const unselectedBorder = await chip(page, 'To Read').evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(unselectedBorder).toBe(await resolveColor(page, subtleBorder));

    // -- Unselected: hover --
    await chip(page, 'To Read').hover();
    const defaultBorder = await readToken(page, '--shelf-borderColor-default');
    const unselectedHoverBorder = await chip(page, 'To Read').evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(unselectedHoverBorder).toBe(await resolveColor(page, defaultBorder));

    // -- Unselected: focus-visible (skipped on WebKit: macOS doesn't Tab-focus buttons) --
    await page.mouse.move(0, 0);
    const browserName = page.context().browser()?.browserType().name() ?? '';
    if (browserName !== 'webkit') {
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        if (await chip(page, 'To Read').evaluate((el) => el === document.activeElement)) break;
      }
      await expect(chip(page, 'To Read')).toBeFocused();
      const focusRing = await readToken(page, '--shelf-focusRing-color');
      const unselectedOutline = await chip(page, 'To Read').evaluate(
        (el) => getComputedStyle(el).outlineColor,
      );
      expect(unselectedOutline).toBe(await resolveColor(page, focusRing));
    }

    // -- Selected: default --
    await chip(page, 'Reading').click();
    await page.mouse.move(0, 0);
    const accentBg = await readToken(page, '--shelf-bgColor-accent');
    const selectedBg = await chip(page, 'Reading').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(selectedBg).toBe(await resolveColor(page, accentBg));

    // -- Selected: hover --
    await chip(page, 'Reading').hover();
    const accentHover = await readToken(page, '--shelf-bgColor-accent-hover');
    const selectedHoverBg = await chip(page, 'Reading').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(selectedHoverBg).toBe(await resolveColor(page, accentHover));

    // -- Selected: focus-visible (skipped on WebKit: macOS doesn't Tab-focus buttons) --
    if (browserName !== 'webkit') {
      await page.mouse.move(0, 0);
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        if (await chip(page, 'Reading').evaluate((el) => el === document.activeElement)) break;
      }
      await expect(chip(page, 'Reading')).toBeFocused();
      const focusRing = await readToken(page, '--shelf-focusRing-color');
      const selectedOutline = await chip(page, 'Reading').evaluate(
        (el) => getComputedStyle(el).outlineColor,
      );
      expect(selectedOutline).toBe(await resolveColor(page, focusRing));
    }
  });

  test('Shelf grid: default populated screenshot', { tag: ['@visual', '@djk.1'] }, async ({ page }) => {
    await freezeTime(page);
    await loadShelf(page);
    await stabilize(page);
    await expectScreenshot(page, 'shelf-grid-populated.png');
  });

  test('Shelf grid: skeleton loading screenshot', { tag: ['@visual', '@djk.1'] }, async ({ page }) => {
    await freezeTime(page);
    await loadShelf(page, 'slow');
    await stabilize(page);
    await expectScreenshot(page, 'shelf-grid-skeleton.png');
  });

  // ---------------------------------------------------------------------------
  // Layout (@layout)
  // ---------------------------------------------------------------------------

  test('Shelf grid: no horizontal overflow at any width', { tag: ['@layout', '@djk.1'] }, async ({ page }) => {
    await loadShelf(page);
    await widthSweep(page, async () => {
      await expectNoHorizontalOverflow(page);
    });
  });

  test('Shelf grid: 1 column on mobile', { tag: ['@layout', '@djk.1'] }, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await loadShelf(page);
    const cols = await grid(page).evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length,
    );
    expect(cols).toBe(1);
  });

  test('Shelf grid: 2 columns on tablet', { tag: ['@layout', '@djk.1'] }, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await loadShelf(page);
    const cols = await grid(page).evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length,
    );
    expect(cols).toBe(2);
  });

  test('Shelf grid: 3-4 columns on desktop, max 4', { tag: ['@layout', '@djk.1'] }, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await loadShelf(page);
    const cols = await grid(page).evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length,
    );
    expect(cols).toBeGreaterThanOrEqual(3);
    expect(cols).toBeLessThanOrEqual(4);

    // At ultra-wide, still max 4
    await page.setViewportSize({ width: 1920, height: 800 });
    const wideCols = await grid(page).evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length,
    );
    expect(wideCols).toBeLessThanOrEqual(4);
  });

  // ---------------------------------------------------------------------------
  // Motion (@motion)
  // ---------------------------------------------------------------------------

  test('Shelf grid: cards stagger in on load with correct tokens', { tag: ['@motion', '@djk.3'] }, async ({ page }) => {
    await loadShelf(page);
    const durationFast = toMs(await readToken(page, '--shelf-motion-duration-fast'));
    const easingEnter = await readToken(page, '--shelf-motion-easing-enter');

    // First card should have an entrance animation
    const anims = await readAnimations(cards(page).first());
    expect(anims.length).toBeGreaterThan(0);
    const entrance = anims.find((a) => a.duration === durationFast);
    expect(entrance).toBeDefined();
    expect(entrance!.easing).toBe(easingEnter);

    // A later card should have a stagger delay
    const laterAnims = await readAnimations(cards(page).nth(3));
    const laterEntrance = laterAnims.find((a) => a.duration === durationFast);
    expect(laterEntrance).toBeDefined();
    expect(laterEntrance!.delay).toBeGreaterThan(0);
  });

  test('Shelf grid: cards re-stagger on filter change', { tag: ['@motion', '@djk.3'] }, async ({ page }) => {
    await loadShelf(page);
    // Wait for initial entrance to finish
    const durationFast = toMs(await readToken(page, '--shelf-motion-duration-fast'));
    const maxInitialStagger = durationFast + 6 * 50 + 100;
    await page.waitForTimeout(maxInitialStagger);

    // Trigger filter change
    await chip(page, 'Reading').click();

    // Cards should have new entrance animations
    const anims = await readAnimations(cards(page).first());
    expect(anims.length).toBeGreaterThan(0);
    expect(anims.some((a) => a.duration === durationFast)).toBe(true);
  });

  test('Shelf grid: stagger capped at 20 cards', { tag: ['@motion', '@djk.3'] }, async ({ page }) => {
    await loadShelf(page, 'many');
    const durationFast = toMs(await readToken(page, '--shelf-motion-duration-fast'));

    // Card beyond index 20 should have no stagger delay
    const farAnims = await readAnimations(cards(page).nth(25));
    const staggered = farAnims.filter((a) => a.duration === durationFast && a.delay > 0);
    expect(staggered.length).toBe(0);
  });

  test('Shelf grid: reduced motion shows no translate and no stagger', { tag: ['@motion', '@djk.3'] }, async ({ page }) => {
    await setReducedMotion(page);
    await loadShelf(page);

    // Tokens collapse to 0ms under reduced motion
    const durationFast = toMs(await readToken(page, '--shelf-motion-duration-fast'));
    expect(durationFast).toBe(0);

    // Cards are fully visible (no stuck-at-0-opacity)
    const opacity = await cards(page).first().evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    expect(opacity).toBe('1');
  });

  test('Shelf grid: skeleton shimmer respects motion preference', { tag: ['@motion', '@djk.1'] }, async ({ page }) => {
    // With motion: shimmer pulses using slow duration
    await loadShelf(page, 'slow');
    const durationSlow = toMs(await readToken(page, '--shelf-motion-duration-slow'));
    const anims = await readAnimations(cards(page).first());
    expect(anims.length).toBeGreaterThan(0);
    const pulse = anims.find((a) => a.duration === durationSlow);
    expect(pulse).toBeDefined();

    // With reduced motion: no animations running
    await setReducedMotion(page);
    await loadShelf(page, 'slow');
    const reducedAnims = await readAnimations(cards(page).first());
    const running = reducedAnims.filter((a) => a.playState === 'running');
    expect(running.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Accessibility (@a11y)
  // ---------------------------------------------------------------------------

  test('Shelf grid: no axe violations', { tag: ['@a11y', '@djk.1'] }, async ({ page }) => {
    await loadShelf(page);
    await expectNoA11yViolations(page);
  });

  test('Shelf grid: filter chips have accessible names', { tag: ['@a11y', '@djk.1'] }, async ({ page }) => {
    await loadShelf(page);
    await expect(chip(page, 'All')).toBeVisible();
    await expect(chip(page, 'To Read')).toBeVisible();
    await expect(chip(page, 'Reading')).toBeVisible();
    await expect(chip(page, 'Finished')).toBeVisible();
  });

  test('Shelf grid: focus visible on tab through chips', { tag: ['@a11y', '@djk.1'] }, async ({ page }) => {
    await loadShelf(page);
    await expectFocusVisibleOnTab(page, { maxTabs: 15 });
  });

  // ---------------------------------------------------------------------------
  // Stability (@stability)
  // ---------------------------------------------------------------------------

  test('Shelf grid: no layout shift when skeleton swaps to cards', { tag: ['@stability', '@djk.1'] }, async ({ page }) => {
    await recordLayoutShifts(page);
    await loadShelf(page, 'slow');
    // Skeletons are rendered; reset before the swap happens
    await resetLayoutShifts(page);
    // Wait for slow fixture to resolve (2s) + animation
    await page.waitForTimeout(2500);
    const shift = await layoutShift(page);
    expect(shift.total).toBeLessThan(0.01);
  });

  // ---------------------------------------------------------------------------
  // Performance (@perf)
  // ---------------------------------------------------------------------------

  test('Shelf grid: entrance animation within frame budget', { tag: ['@perf', '@djk.3'] }, async ({ page }) => {
    const result = await measureFrames(
      page,
      async () => { await loadShelf(page); },
      1500,
    );
    // Budget from ui-base.md: at most 2 long frames (>50ms)
    expect(result.longFrames).toBeLessThanOrEqual(2);
  });

});
