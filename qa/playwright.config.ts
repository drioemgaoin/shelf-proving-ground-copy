/**
 * Playwright config for qa/ tests — sandcastle pipeline, agent probes, and
 * cross-cutting invariants. Shares the same web server as the main tests/ config.
 */
import { defineConfig, devices } from '@playwright/test';
import { VIEWPORTS } from './support/viewports';

const PORT = Number(process.env.UI_PORT ?? 5173);
const BASE_URL = process.env.UI_BASE_URL ?? `http://localhost:${PORT}`;
const chromium = devices['Desktop Chrome'];

export default defineConfig({
  testDir: '.',
  testMatch: [
    'agent/**/*.spec.ts',
    'invariants/**/*.spec.ts',
    '**/acceptance/**/*.spec.ts',
  ],
  timeout: 30_000,
  retries: 1,
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name,
      use: { ...chromium, viewport },
    })),
    {
      name: 'dark',
      grep: /@visual|@a11y/,
      use: { ...chromium, viewport: VIEWPORTS.desktop, colorScheme: 'dark' as const },
    },
    {
      name: 'zoom-200',
      grep: /@visual|@layout/,
      use: { ...chromium, viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 },
    },
    {
      name: 'webkit',
      grepInvert: /@motion|@stability|@perf/,
      use: { ...devices['Desktop Safari'], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: {
    command: process.env.UI_SERVER_CMD ?? `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
