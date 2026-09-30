import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit tests run under jsdom with Testing Library. Playwright specs under e2e/
// are excluded so they only run via `npm run e2e`.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
