/**
 * AutoScroll plugin — scrolls the page to trigger lazy-loaded content.
 * Three strategies:
 *   'jump'        — instant scrollTo (fast, no animation)
 *   'incremental' — viewport-height wheel events with height stabilization
 *   'smooth'      — micro-step wheel events for fluid video recording
 *
 * When crawlVideoRecordingEnabled is true, smooth is forced automatically
 * so an LLM reviewing the video gets sharp, readable frames at every position.
 */

async function scrollJump({ page, passes, delayMs, postLoadWaitMs }) {
  for (let i = 0; i < passes; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    if (delayMs > 0) await page.waitForTimeout(delayMs);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (postLoadWaitMs > 0) await page.waitForTimeout(postLoadWaitMs);
  return { enabled: true, strategy: 'jump', passes, delayMs, postLoadWaitMs };
}

async function scrollIncremental({ page, passes, delayMs, postLoadWaitMs }) {
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let stableCount = 0;
  let wheelCount = 0;

  while (wheelCount < passes) {
    await page.mouse.wheel(0, viewportHeight);
    wheelCount++;
    if (delayMs > 0) await page.waitForTimeout(delayMs);

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) {
      stableCount++;
      if (stableCount >= 2) break;
    } else {
      stableCount = 0;
    }
    previousHeight = currentHeight;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  if (postLoadWaitMs > 0) await page.waitForTimeout(postLoadWaitMs);
  return { enabled: true, strategy: 'incremental', passes: wheelCount, delayMs, postLoadWaitMs };
}

// WHY: viewport/8 produces ~135px steps at 1080p. At 33ms/step the browser's
// scroll compositor interpolates these into ~2500px/s fluid visual motion —
// a moderate human browsing pace that gives 30fps video sharp readable frames.
const MICRO_STEP_DIVISOR = 8;
// WHY: Playwright records at 30fps = 33.3ms/frame. Aligning wheel events to
// one-per-frame prevents tearing and ensures every frame captures a distinct position.
const FRAME_MS = 33;
// WHY: 15 clean frames at 30fps for the LLM to read the top-of-page content
// after scroll completes. Overrides postLoadWaitMs when video is active.
const FINAL_REST_MS = 500;

async function scrollSmooth({ page, passes, delayMs }) {
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const stepSize = Math.max(1, Math.round(viewportHeight / MICRO_STEP_DIVISOR));

  // WHY: Prevent sites from overriding our scroll timing with CSS smooth-scroll.
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let stableCount = 0;
  let segmentsScrolled = 0;
  let pixelsInSegment = 0;

  while (segmentsScrolled < passes) {
    await page.mouse.wheel(0, stepSize);
    await page.waitForTimeout(FRAME_MS);
    pixelsInSegment += stepSize;

    // Viewport boundary reached — settle, nudge, and check height
    if (pixelsInSegment >= viewportHeight) {
      pixelsInSegment = 0;
      segmentsScrolled++;

      if (delayMs > 0) await page.waitForTimeout(delayMs);

      // WHY: Small upward-then-downward nudge triggers IntersectionObserver
      // on sites that only fire lazy-load callbacks on upward scroll.
      await page.mouse.wheel(0, -stepSize);
      await page.waitForTimeout(FRAME_MS);
      await page.mouse.wheel(0, stepSize);
      await page.waitForTimeout(FRAME_MS);

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) {
        stableCount++;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
      }
      previousHeight = currentHeight;
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(FINAL_REST_MS);
  return { enabled: true, strategy: 'smooth', passes: segmentsScrolled, delayMs, postLoadWaitMs: FINAL_REST_MS };
}

export const autoScrollPlugin = {
  name: 'autoScroll',
  suites: ['scroll'],
  hooks: {
    async onScroll({ page, settings }) {
      const enabled = settings?.autoScrollEnabled !== false && settings?.autoScrollEnabled !== 'false';
      const passes = Number(settings?.autoScrollPasses) || 0;
      if (!enabled || passes <= 0) {
        return { enabled: false, passes: 0, delayMs: 0, postLoadWaitMs: 0 };
      }

      const delayMs = Number(settings?.autoScrollDelayMs) || 0;
      const postLoadWaitMs = settings?.autoScrollPostLoadWaitMs != null ? Number(settings.autoScrollPostLoadWaitMs) : 200;
      const videoOn = settings?.crawlVideoRecordingEnabled === true
        || settings?.crawlVideoRecordingEnabled === 'true';
      const strategy = settings?.autoScrollStrategy || 'jump';

      // WHY: Video ON forces smooth — jump/incremental produce unreadable frames.
      if (videoOn) {
        return scrollSmooth({ page, passes, delayMs });
      }
      if (strategy === 'incremental') {
        return scrollIncremental({ page, passes, delayMs, postLoadWaitMs });
      }
      return scrollJump({ page, passes, delayMs, postLoadWaitMs });
    },
  },
};
