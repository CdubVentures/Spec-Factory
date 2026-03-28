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

// WHY: Pause per viewport-chunk so the video captures each section.
// 250ms = ~8 frames at 30fps — enough for an LLM to read content.
const CHUNK_PAUSE_MS = 250;
// WHY: Rest at bottom so video ends with a clear final state.
const FINAL_REST_MS = 500;

// WHY: Fast viewport-chunk scrolling. One scrollTo per viewport height,
// one pause per chunk for the video. No micro-steps, no per-pixel wheel
// events. Total time for a 5-viewport page: 5 × 250ms = 1.25s.
// Checks page height growth at each chunk for lazy-loaded content.
async function scrollSmooth({ page, passes, delayMs, maxPixels }) {
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);

  const initialSegments = Math.max(1, Math.ceil(scrollHeight / viewportHeight));
  let maxSegments = initialSegments;
  const growthCap = initialSegments + passes;
  // WHY: Hard pixel cap prevents infinite-scroll sites (IGN, Reddit feed)
  // from scrolling forever. Default 30000px ≈ ~42 viewports at 720p.
  const pixelCap = maxPixels || 30000;
  const segmentCap = Math.ceil(pixelCap / viewportHeight);
  let segmentsScrolled = 0;
  let previousHeight = scrollHeight;

  while (segmentsScrolled < maxSegments && segmentsScrolled < segmentCap) {
    segmentsScrolled++;
    const targetY = segmentsScrolled * viewportHeight;

    await page.evaluate((y) => window.scrollTo(0, y), targetY);
    await page.waitForTimeout(CHUNK_PAUSE_MS);

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight > previousHeight) {
      const newNeeded = Math.ceil(currentHeight / viewportHeight);
      maxSegments = Math.min(newNeeded, growthCap);
      previousHeight = currentHeight;
    }

    if (delayMs > 0) await page.waitForTimeout(delayMs);
  }

  await page.waitForTimeout(FINAL_REST_MS);
  // WHY: Scroll back to top so the next onScroll call (round 2) does a
  // full top-to-bottom sweep again. Both sweeps are captured in the video.
  await page.evaluate(() => window.scrollTo(0, 0));
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
      const postLoadWaitMs = Number(settings?.autoScrollPostLoadWaitMs) || 0;
      const maxPixels = Number(settings?.autoScrollMaxPixels) || 30000;
      const videoOn = settings?.crawlVideoRecordingEnabled === true
        || settings?.crawlVideoRecordingEnabled === 'true';
      const strategy = settings?.autoScrollStrategy || 'jump';

      // WHY: Video ON forces smooth — viewport-chunk scrollTo with pauses
      // for readable video frames. Runs twice (per dismiss round) to catch
      // late lazy content. Does NOT scroll back to top — the handler does
      // that after the video trim point.
      if (videoOn) {
        return scrollSmooth({ page, passes, delayMs, maxPixels });
      }
      if (strategy === 'incremental') {
        return scrollIncremental({ page, passes, delayMs, postLoadWaitMs });
      }
      return scrollJump({ page, passes, delayMs, postLoadWaitMs });
    },
  },
};
