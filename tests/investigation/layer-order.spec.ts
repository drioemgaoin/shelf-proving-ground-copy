import { test, expect } from '../../qa/support/fixtures';

/**
 * Verify CSS @layer ordering: components layer beats base layer.
 *
 * The @layer declaration (@layer base, tokens, components) sets cascade
 * priority — components highest, base lowest. If the declaration loads
 * after component CSS, the browser registers layers in wrong order and
 * base-layer inherited properties (color: inherit on button) override
 * component-layer explicit values — causing contrast failures on
 * accent-background elements like selected chips.
 *
 * This test catches the exact bug: a button inside @layer components
 * with an explicit color must not be overridden by @layer base's
 * color: inherit.
 */
test.describe('CSS layer cascade order', () => {

  test('components layer color beats base layer inherit on buttons', async ({ page }) => {
    await page.goto('/');

    // Find any button on the page — chips are buttons
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    if (count === 0) return; // no buttons = empty shell, skip

    // Inject a test: add a components-layer rule setting color to a known
    // value, competing with base-layer's button { color: inherit }
    const result = await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.textContent = 'probe';
      probe.setAttribute('data-layer-probe', 'true');
      document.body.appendChild(probe);

      // Read what base layer gives this button (inherited color)
      const baseColor = getComputedStyle(probe).color;

      // Add a components-layer rule with an explicit color
      const style = document.createElement('style');
      style.textContent = `
        @layer components {
          [data-layer-probe] { color: rgb(0, 128, 0); }
        }
      `;
      document.head.appendChild(style);

      const afterColor = getComputedStyle(probe).color;
      probe.remove();
      style.remove();

      return { baseColor, afterColor };
    });

    // The components-layer color MUST win over the base-layer inherited value
    expect(result.afterColor).toBe('rgb(0, 128, 0)');
    expect(result.afterColor).not.toBe(result.baseColor);
  });

  test('selected chip text color has sufficient contrast on accent background', async ({ page }) => {
    await page.goto('/');

    // The "All" chip is selected by default (aria-pressed="true")
    const allChip = page.getByRole('group', { name: 'Filter by status' })
      .getByRole('button', { name: 'All' });

    // Skip if chip doesn't exist (empty shell)
    if (await allChip.count() === 0) return;

    await expect(allChip).toHaveAttribute('aria-pressed', 'true');

    const { color, bgColor } = await allChip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bgColor: s.backgroundColor };
    });

    // The chip has an accent background — its text must NOT be the dark
    // inherited body color. It must be the on-accent (white) token.
    // If layer ordering is wrong, color will be the dark body text (~rgb(29,24,22))
    // instead of white (rgb(255,255,255)).
    //
    // Parse rgb values and compute relative luminance contrast
    const parse = (rgb: string) => {
      const m = rgb.match(/(\d+)/g);
      return m ? m.map(Number) : [0, 0, 0];
    };

    const [fr, fg, fb] = parse(color);
    const [br, bg, bb] = parse(bgColor);

    // sRGB relative luminance
    const lum = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const fgLum = lum(fr, fg, fb);
    const bgLum = lum(br, bg, bb);
    const contrast = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);

    // WCAG AA requires 4.5:1 for normal text
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
