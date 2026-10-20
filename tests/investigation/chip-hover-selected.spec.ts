import { test, expect } from '../../qa/support/fixtures';
import { readToken, resolveColor } from '../../qa/support/ui';

/**
 * RED test: proves that a selected chip (aria-pressed="true") has no visual
 * distinction between its hovered and unhovered states.
 *
 * The UI rule (ui-base.md, "interactive-states") requires every interactive
 * element to have visually distinct default, hover, focus-visible, active, and
 * disabled states. Currently, `.chip[aria-pressed='true']:hover` only changes
 * border-color — background-color stays the same — so hover on a selected chip
 * is visually indistinguishable from its rest state.
 */
test.describe('Selected chip hover distinction', () => {

  function chip(page: import('@playwright/test').Page, name: string) {
    return page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name });
  }

  test('selected chip hover background differs from selected chip rest background', async ({ page }) => {
    await page.goto('/');

    // Select the "Reading" chip
    await chip(page, 'Reading').click();
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'true');

    // Move mouse away so the chip is in selected-rest state (not hovered)
    await page.mouse.move(0, 0);

    // Read the selected-rest background
    const restBg = await chip(page, 'Reading').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // Hover over the selected chip
    await chip(page, 'Reading').hover();

    // Read the selected-hover background
    const hoverBg = await chip(page, 'Reading').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // These MUST differ — hover on a selected chip must produce a visible change
    expect(hoverBg).not.toBe(restBg);
  });

  test('selected chip hover background matches accent-hover token', async ({ page }) => {
    await page.goto('/');

    // Select the "Reading" chip
    await chip(page, 'Reading').click();
    await expect(chip(page, 'Reading')).toHaveAttribute('aria-pressed', 'true');

    // Hover over the selected chip
    await chip(page, 'Reading').hover();

    // The hovered-selected background must be the accent-hover token
    const accentHover = await readToken(page, '--shelf-bgColor-accent-hover');
    const expectedBg = await resolveColor(page, accentHover);
    const actualBg = await chip(page, 'Reading').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(actualBg).toBe(expectedBg);
  });
});
