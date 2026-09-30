# Test helpers (API only)

```ts
import { test, expect } from '../support/fixtures';   // fails the test on console errors
import {
  freezeTime, stabilize, expectScreenshot,             // static visuals
  readToken, toMs,                                     // tokens
  readAnimations, setReducedMotion, captureFilmstrip,  // motion
  measureFrames,                                       // smoothness
  recordLayoutShifts, resetLayoutShifts, layoutShift,  // stability
  expectNoHorizontalOverflow, widthSweep,              // layout
  expectNoA11yViolations, expectFocusVisibleOnTab,     // accessibility
} from '../support/ui';
```

| Helper | Use |
|---|---|
| `freezeTime(page)` | Before `goto`, static tests only. Freezes clocks and JS timers. |
| `stabilize(page)` | Before any screenshot. Waits for fonts and images. |
| `expectScreenshot(target, name)` | Screenshot with `[data-dynamic]` elements masked. |
| `readToken(page, '--ns-motion-duration-base')` | Token value from the running page. `toMs()` converts durations. |
| `readAnimations(locator)` | Running CSS/WAAPI animations under the element, with duration and easing. Call right after triggering. |
| `setReducedMotion(page)` | Emulates the reduce-motion setting. |
| `captureFilmstrip(page, testInfo, trigger, { durationMs })` | Slows motion, captures frames, attaches one contact sheet. Chromium only. |
| `measureFrames(page, trigger, durationMs)` | Returns `{ frames, longFrames, maxGapMs }`. Budget in `ui-base.md`. |
| `recordLayoutShifts(page)` | Before `goto`. Then `resetLayoutShifts` before the action and `layoutShift` after. Chromium only. |
| `expectNoHorizontalOverflow(page)` | Fails with the offending elements listed. |
| `widthSweep(page, check, widths?)` | Runs `check` at each width from 320 to 1440 px. |
| `expectNoA11yViolations(page, selector?)` | axe at WCAG 2.2 AA, compact failure list. |
| `expectFocusVisibleOnTab(page, { maxTabs? })` | Tabs through; each focused element must be visible, uncovered, and show a focus indicator. |

## Tags and where they run

| Tag | Runs on |
|---|---|
| (none) behavior | mobile, tablet, desktop, webkit |
| `@visual` | all projects, including dark and zoom |
| `@layout` | mobile, tablet, desktop, zoom, webkit |
| `@a11y` | mobile, tablet, desktop, dark, webkit |
| `@motion`, `@stability`, `@perf` | mobile, tablet, desktop (Chromium only) |

A test can carry several tags: `{ tag: ['@visual', '@a11y'] }`.
