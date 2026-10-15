import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit tests run under jsdom with Testing Library. Playwright specs under tests/
// are excluded so they only run via `npm run e2e`.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'qa/**/unit/**/*.test.{ts,tsx}',
      'qa/**/integration/**/*.test.{ts,tsx}',
    ],
    // Standalone .mjs test harnesses use process.exit() and must run via
    // `npm run test:scripts` (node), not vitest.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
