/**
 * AutoScroll plugin — scrolls the page to trigger lazy-loaded content.
 * Supports two strategies: 'jump' (instant scrollTo) and 'incremental' (wheel events).
 * Hooks into onInteract to scroll after navigation completes.
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
    await page.mouse.wheel({ deltaY: viewportHeight });
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
      const strategy = settings?.autoScrollStrategy || 'jump';

      if (strategy === 'incremental') {
        return scrollIncremental({ page, passes, delayMs, postLoadWaitMs });
      }
      return scrollJump({ page, passes, delayMs, postLoadWaitMs });
    },
  },
};
