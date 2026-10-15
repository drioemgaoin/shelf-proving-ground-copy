// Helpers for acceptance tests. Locked during AFK runs.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

// ---------- Static mode ----------

/** Call BEFORE page.goto in static (screenshot) tests. Don't use in motion tests: it also freezes animation timers. */
export async function freezeTime(page: Page, iso = '2026-01-01T09:00:00Z') {
  await page.clock.install({ time: new Date(iso) });
}

/** Wait until the page is visually settled: fonts loaded, images decoded. */
export async function stabilize(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))),
    );
  });
}

/** Screenshot with [data-dynamic] content masked. Call stabilize() first. */
export async function expectScreenshot(target: Page | Locator, name: string) {
  const page = 'page' in target ? target.page() : target;
  await expect(target).toHaveScreenshot(name, { mask: [page.locator('[data-dynamic]')] });
}

// ---------- Tokens ----------

/** Read a design token (CSS custom property) from the page, so tests never hard-code values. */
export async function readToken(page: Page, name: string): Promise<string> {
  const value = await page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
  expect(value, `token ${name} must resolve`).not.toBe('');
  return value;
}

/**
 * Resolve any CSS color string to the browser-normalized rgb()/rgba() form.
 * Use this when comparing a token value (raw authored, e.g. `hsl(...)`) against
 * a computed style (always `rgb(...)`). The browser does the conversion.
 */
export async function resolveColor(page: Page, raw: string): Promise<string> {
  return page.evaluate((c) => {
    const el = document.createElement('div');
    el.style.color = c;
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    el.remove();
    return resolved;
  }, raw);
}

/** "250ms" or "0.25s" -> 250 */
export function toMs(value: string): number {
  const n = parseFloat(value);
  return value.trim().endsWith('ms') ? n : n * 1000;
}

// ---------- Motion mode ----------

export type AnimationInfo = {
  kind: string; // CSSTransition | CSSAnimation | Animation
  name: string; // transition property or keyframes name
  duration: number; // ms
  delay: number; // ms
  easing: string;
  playState: string;
};

/**
 * List animations running on an element and its descendants.
 * Call right after triggering the motion, while it is still running.
 * Covers CSS transitions, CSS animations and the Web Animations API.
 * JS-driven animation (requestAnimationFrame loops) won't appear here: use a filmstrip.
 */
export async function readAnimations(target: Locator): Promise<AnimationInfo[]> {
  return target.evaluate((root) =>
    root.getAnimations({ subtree: true }).map((a) => {
      const timing = a.effect?.getTiming() ?? {};
      const anyA = a as unknown as { transitionProperty?: string; animationName?: string };
      return {
        kind: a.constructor.name,
        name: anyA.transitionProperty ?? anyA.animationName ?? a.id ?? '',
        duration: Number(timing.duration ?? 0),
        delay: Number(timing.delay ?? 0),
        easing: String(timing.easing ?? ''),
        playState: a.playState,
      };
    }),
  );
}

/** Emulate the user's "reduce motion" setting. */
export async function setReducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

/**
 * Capture a filmstrip of a motion and attach it as ONE contact-sheet image.
 * Slows animations down (Chromium) so frames are evenly spaced, then restores speed.
 */
export async function captureFilmstrip(
  page: Page,
  testInfo: TestInfo,
  trigger: () => Promise<void>,
  opts: { durationMs: number; frames?: number; slowdown?: number; clip?: Locator; label?: string },
) {
  const frames = opts.frames ?? 8;
  const slowdown = opts.slowdown ?? 10;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / slowdown });

  const shots: Buffer[] = [];
  const step = (opts.durationMs * slowdown) / (frames - 1);
  await trigger();
  for (let i = 0; i < frames; i++) {
    const box = opts.clip ? await opts.clip.boundingBox() : null;
    shots.push(await page.screenshot(box ? { clip: box } : {}));
    if (i < frames - 1) await page.waitForTimeout(step);
  }
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });

  // Build the contact sheet in a throwaway page: no image library needed.
  const cols = Math.min(4, frames);
  const cells = shots
    .map(
      (b, i) =>
        `<figure><img src="data:image/png;base64,${b.toString('base64')}"/><figcaption>${i + 1}/${frames} · ${Math.round((i * step) / slowdown)}ms</figcaption></figure>`,
    )
    .join('');
  const sheet = await page.context().newPage();
  await sheet.setContent(
    `<style>body{margin:0;font:12px system-ui;background:#fff}#s{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px;width:1600px}img{width:100%;border:1px solid #ccc}figure{margin:0}</style><div id="s">${cells}</div>`,
  );
  const path = testInfo.outputPath(`${opts.label ?? 'motion'}-contact-sheet.png`);
  await sheet.locator('#s').screenshot({ path });
  await sheet.close();
  await testInfo.attach(`${opts.label ?? 'motion'}-contact-sheet`, { path, contentType: 'image/png' });
}

/**
 * Count long frames while a motion runs. Uses requestAnimationFrame timing.
 * A long frame is a gap over 50 ms between two frames. Budget: ui-base.md.
 */
export async function measureFrames(page: Page, trigger: () => Promise<void>, durationMs: number) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number[]; __stopFrames?: boolean };
    w.__frames = [];
    w.__stopFrames = false;
    const tick = (t: number) => {
      w.__frames.push(t);
      if (!w.__stopFrames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await trigger();
  await page.waitForTimeout(durationMs + 100);
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stopFrames?: boolean };
    w.__stopFrames = true;
    const gaps = w.__frames.slice(1).map((t, i) => t - w.__frames[i]);
    return {
      frames: w.__frames.length,
      longFrames: gaps.filter((g) => g > 50).length,
      maxGapMs: Math.round(Math.max(0, ...gaps)),
    };
  });
}

// ---------- Layout ----------

/** Fails if the page scrolls sideways, listing up to 5 elements that stick out. */
export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        const tag = el.tagName.toLowerCase();
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        offenders.push(`${tag} "${label}" right=${Math.round(r.right)} vw=${vw}`);
        if (offenders.length >= 5) break;
      }
    }
    return { overflow: document.documentElement.scrollWidth > vw + 1, offenders };
  });
  expect(result.overflow ? result.offenders : [], 'horizontal overflow').toEqual([]);
}

export const SWEEP_WIDTHS = [320, 360, 414, 600, 768, 900, 1024, 1280, 1440];

/** Run a check at each width, keeping the current height. */
export async function widthSweep(page: Page, check: (width: number) => Promise<void>, widths = SWEEP_WIDTHS) {
  const height = page.viewportSize()?.height ?? 800;
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await check(width);
  }
}

// ---------- Stability ----------

/** Call BEFORE page.goto. Records every layout shift (Chromium). */
export async function recordLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { value: number; hadRecentInput: boolean; sources: string[] }[] };
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node?: Node | null }[];
      }[]) {
        w.__shifts.push({
          value: e.value,
          hadRecentInput: e.hadRecentInput,
          sources: (e.sources ?? []).map((s) => (s.node as Element | null)?.outerHTML?.slice(0, 80) ?? '?'),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** Clear recorded shifts, e.g. right before the interaction you want to measure. */
export async function resetLayoutShifts(page: Page) {
  await page.evaluate(() => ((window as unknown as { __shifts: unknown[] }).__shifts = []));
}

/** Total shift since the last reset, including shifts right after user input. */
export async function layoutShift(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __shifts: { value: number; sources: string[] }[] }).__shifts ?? [];
    return { total: s.reduce((sum, e) => sum + e.value, 0), sources: s.flatMap((e) => e.sources).slice(0, 5) };
  });
}

// ---------- Accessibility ----------

/**
 * Tab through the page. Each focused element must be inside the viewport,
 * not covered by another element (e.g. a sticky header), and show a focus indicator.
 */
export async function expectFocusVisibleOnTab(page: Page, opts: { maxTabs?: number } = {}) {
  const problems: string[] = [];
  let first: string | null = null;
  for (let i = 0; i < (opts.maxTabs ?? 30); i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow !== 'none';
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
      const id = `${el.tagName}:${name}:${Math.round(r.left)},${Math.round(r.top)}`;
      return {
        id,
        name: `${el.tagName.toLowerCase()} "${name}"`,
        inView: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
        covered: !!top && top !== el && !el.contains(top),
        indicator: outline || ring,
      };
    });
    if (!info) continue;
    if (first === info.id) break; // wrapped around
    first ??= info.id;
    if (!info.inView) problems.push(`${info.name}: focused but off screen`);
    if (info.covered) problems.push(`${info.name}: focused but covered by another element`);
    if (!info.indicator) problems.push(`${info.name}: no visible focus indicator`);
  }
  expect(problems, 'focus visibility').toEqual([]);
}


/** Fails if any interactive element is smaller than minPx × minPx CSS pixels. */
export async function expectMinTargetSize(page: Page, minPx = 24) {
  const smalls = await page.evaluate((min) => {
    const selectors = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="tab"],[role="switch"],[role="menuitem"]';
    const problems: string[] = [];
    for (const el of Array.from(document.querySelectorAll(selectors))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden
      if (r.width < min || r.height < min) {
        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        problems.push(`${tag} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}px`);
        if (problems.length >= 10) break;
      }
    }
    return problems;
  }, minPx);
  expect(smalls, `pointer targets must be >= ${minPx}×${minPx}px`).toEqual([]);
}

/** Fails with a compact list of violations (one line each), to protect agent context. */
export async function expectNoA11yViolations(page: Page, include?: string) {
  // Cast: @axe-core/playwright resolved a newer playwright-core than @playwright/test.
  let builder = new AxeBuilder({ page } as never).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
}
