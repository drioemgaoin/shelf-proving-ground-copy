import { defineConfig, devices } from '@playwright/test';
import { VIEWPORTS } from './e2e/support/viewports';

const PORT = Number(process.env.UI_PORT ?? 5173);
const BASE_URL = process.env.UI_BASE_URL ?? `http://localhost:${PORT}`;
const chromium = devices['Desktop Chrome'];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1, // fail-then-pass is reported as flaky, not hidden
  // One baseline per test, screenshot name and project. Committed to git.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled', // static mode: finish or freeze animations
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
  // Tag routing (see .claude/skills/ui-contract/references/helpers.md):
  //   behavior (no tag): mobile, tablet, desktop, webkit
  //   @visual: every project        @layout: + zoom        @a11y: + dark
  //   @motion @stability @perf: Chromium viewports only
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
      // 200% zoom on a 1280px screen = 640 CSS px wide at 2x density
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
