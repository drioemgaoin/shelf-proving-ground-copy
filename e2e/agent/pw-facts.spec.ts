/**
 * pw-facts: validated browser API facts.
 *
 * Instead of writing throwaway probe scripts, agents add tests HERE.
 * Each test asserts one deterministic browser behavior. The test file
 * serves as both documentation and regression guard — if a Playwright
 * or browser update changes behavior, these tests fail first.
 *
 * HOW TO ADD: write a test that asserts the API behavior you need to
 * know. Run this file. The assertion result is your answer AND it's
 * now captured for all future agents.
 *
 * Tagged @infra so they run on Chromium only (no visual/layout concern).
 */
import { test, expect } from '../support/fixtures';

test.describe('Playwright browser facts', { tag: '@infra' }, () => {

  // -----------------------------------------------------------------------
  // Color serialization (pw-color-serialization.md)
  // -----------------------------------------------------------------------

  test('plain custom property returns authored text, not rgb()', async ({ page }) => {
    await page.setContent(`
      <style>
        :root { --test-color: hsl(18 55% 42%); }
        .box { background: var(--test-color); }
      </style>
      <div class="box">x</div>
    `);

    const raw = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--test-color').trim(),
    );
    const computed = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.box')!).backgroundColor,
    );

    // The raw token keeps authored form — NOT rgb
    expect(raw).toContain('hsl');
    // The computed style is rgb
    expect(computed).toMatch(/^rgb/);
    // They do NOT match — this is the problem the rule warns about
    expect(raw).not.toBe(computed);
  });

  test('@property with syntax <color> makes getPropertyValue return rgb()', async ({ page }) => {
    await page.setContent(`
      <style>
        @property --test-registered {
          syntax: '<color>';
          inherits: true;
          initial-value: transparent;
        }
        :root { --test-registered: hsl(18 55% 42%); }
        .box { background: var(--test-registered); }
      </style>
      <div class="box">x</div>
    `);

    const registered = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--test-registered').trim(),
    );
    const computed = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.box')!).backgroundColor,
    );

    // Both are now rgb — they match
    expect(registered).toMatch(/^rgb/);
    expect(computed).toMatch(/^rgb/);
    expect(registered).toBe(computed);
  });

  // -----------------------------------------------------------------------
  // Animation APIs (pw-animation-testing.md)
  // -----------------------------------------------------------------------

  test('CSS @keyframes: getTiming().easing reports "linear", not the real easing', async ({ page }) => {
    await page.setContent(`
      <style>
        @keyframes slide { from { opacity: 0; } to { opacity: 1; } }
        .box { animation: slide 1s ease-in-out forwards; }
      </style>
      <div class="box">x</div>
    `);

    const easing = await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      const anim = el.getAnimations()[0];
      return anim?.effect?.getTiming().easing;
    });

    // The easing on getTiming() is "linear" — the actual easing lives on the
    // keyframe rule, not the Animation effect. Tests cannot read it this way.
    expect(easing).toBe('linear');
  });

  test('CSS transition: exposes correct easing but vanishes after finish', async ({ page }) => {
    await page.setContent(`
      <style>
        .box { opacity: 1; transition: opacity 200ms ease-in-out; }
        .box.go { opacity: 0; }
      </style>
      <div class="box">x</div>
    `);

    // Trigger
    const easingDuring = await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      el.classList.add('go');
      const anim = el.getAnimations()[0];
      return anim?.effect?.getTiming().easing ?? null;
    });
    expect(easingDuring).toBe('ease-in-out');

    // Wait for it to finish
    await page.waitForTimeout(400);
    const animsAfter = await page.evaluate(() =>
      document.querySelector('.box')!.getAnimations().length,
    );
    // Gone — too fragile for test assertions
    expect(animsAfter).toBe(0);
  });

  test('WAAPI with fill:both persists and exposes correct easing', async ({ page }) => {
    await page.setContent('<div class="box">x</div>');

    await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 200, easing: 'ease-in-out', fill: 'both' },
      );
    });

    // Wait for it to finish
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      const anims = el.getAnimations();
      const a = anims[0];
      return {
        count: anims.length,
        easing: a?.effect?.getTiming().easing ?? null,
        playState: a?.playState ?? null,
      };
    });

    // Still there, readable, correct easing
    expect(result.count).toBe(1);
    expect(result.easing).toBe('ease-in-out');
    expect(result.playState).toBe('finished');
  });

  // -----------------------------------------------------------------------
  // Playwright interactions (pw-animation-testing.md)
  // -----------------------------------------------------------------------

  test('animations:disabled finishes WAAPI — elements reach end state', async ({ page }) => {
    // This test runs under the default playwright config which has
    // animations: 'disabled' for toHaveScreenshot. We simulate by calling
    // the same mechanism: the page finishes animations.
    await page.setContent('<div class="box" style="opacity:0">x</div>');

    await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      const a = el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 5000, fill: 'both' },
      );
      // Simulate what Playwright's animations:'disabled' does
      a.finish();
    });

    const opacity = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.box')!).opacity,
    );
    expect(opacity).toBe('1');
  });

  test('page.clock.install does not prevent WAAPI from finishing', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T09:00:00Z') });
    await page.setContent('<div class="box" style="opacity:0">x</div>');

    await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 200, fill: 'both' },
      );
    });

    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const el = document.querySelector('.box')!;
      const a = el.getAnimations()[0];
      return {
        opacity: getComputedStyle(el).opacity,
        playState: a?.playState ?? 'gone',
      };
    });

    expect(result.opacity).toBe('1');
    expect(result.playState).toBe('finished');
  });
});
