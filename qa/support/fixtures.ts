// Import { test, expect } from here in every UI test, not from @playwright/test.
// Auto fixture: any console error or uncaught page error fails the test.
// Allow known noise with UI_CONSOLE_ALLOW (a regex), e.g. "favicon\\.ico".
// Per-test: set allowedErrors to a regex to suppress expected errors for that test.
import { test as base, expect } from '@playwright/test';

const allow = process.env.UI_CONSOLE_ALLOW ? new RegExp(process.env.UI_CONSOLE_ALLOW) : null;

function isAllowed(text: string, perTest: RegExp | null): boolean {
  if (allow && allow.test(text)) return true;
  if (perTest && perTest.test(text)) return true;
  return false;
}

export const test = base.extend<{ consoleGuard: void; allowedErrors: RegExp | null }>({
  allowedErrors: [null, { option: true }],
  consoleGuard: [
    async ({ page, allowedErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isAllowed(msg.text(), allowedErrors)) errors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        const text = `Uncaught: ${err.message}`;
        if (!isAllowed(text, allowedErrors)) errors.push(text);
      });
      await use();
      expect(errors.map((e) => e.slice(0, 200)), 'console errors during test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
