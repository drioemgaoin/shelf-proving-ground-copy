import { test, expect } from '../../qa/support/fixtures';
import { readToken, resolveColor } from '../../qa/support/ui';

/**
 * RED test: proves the body background does not use --shelf-bgColor-default.
 *
 * Root cause: tokens.css defines --shelf-bgColor-default for both light and
 * dark modes, but no CSS rule applies it to <body> or <html>. The browser
 * default (white) leaks through, which is invisible in light mode but breaks
 * dark mode.
 */
test.describe('Dark mode page background', () => {
  test('body background matches --shelf-bgColor-default token', async ({ page }) => {
    // Emulate dark color-scheme so the media query in tokens.css activates
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    // Read what the token says the page background should be
    const tokenValue = await readToken(page, '--shelf-bgColor-default');
    const expectedBg = await resolveColor(page, tokenValue);

    // Read what the body background actually is
    const actualBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    // This will FAIL (RED): body has no background-color set, so it's
    // rgba(0, 0, 0, 0) (transparent) which shows the browser default white,
    // not the dark token hsl(16 12% 10%)
    expect(actualBg).toBe(expectedBg);
  });
});
