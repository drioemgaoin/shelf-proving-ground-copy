import { test, expect } from '../support/fixtures';

// Smoke test for the infra ticket (shelf-proving-ground-513.4): the Vite dev
// server boots and the empty React shell mounts its root container. Feature
// tickets add the real UI (and its locked acceptance tests) on top of this.
test.describe('app shell', () => {
  test('mounts the React root container', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toBeAttached();
  });
});
