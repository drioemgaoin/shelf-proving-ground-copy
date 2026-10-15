// Import { test, expect } from here in every UI test, not from @playwright/test.
// Auto fixture: any console error or uncaught page error fails the test.
// Allow known noise with UI_CONSOLE_ALLOW (a regex), e.g. "favicon\\.ico".
import { test as base, expect } from '@playwright/test';

const allow = process.env.UI_CONSOLE_ALLOW ? new RegExp(process.env.UI_CONSOLE_ALLOW) : null;

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !(allow && allow.test(msg.text()))) errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(`Uncaught: ${err.message}`));
      await use();
      expect(errors.map((e) => e.slice(0, 200)), 'console errors during test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
