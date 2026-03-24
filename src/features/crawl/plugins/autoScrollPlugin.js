/**
 * AutoScroll plugin — scrolls the page to trigger lazy-loaded content.
 * Hooks into onInteract to scroll N passes after navigation completes.
 */

export const autoScrollPlugin = {
  name: 'autoScroll',
  hooks: {
    async onInteract({ page, settings }) {
      const enabled = settings?.autoScrollEnabled !== false && settings?.autoScrollEnabled !== 'false';
      const passes = Number(settings?.autoScrollPasses) || 0;
      if (!enabled || passes <= 0) return;

      const delayMs = Number(settings?.autoScrollDelayMs) || 0;
      const postLoadWaitMs = Number(settings?.postLoadWaitMs) || 0;

      for (let i = 0; i < passes; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        if (delayMs > 0) await page.waitForTimeout(delayMs);
      }

      // Reset to top
      await page.evaluate(() => window.scrollTo(0, 0));

      if (postLoadWaitMs > 0) await page.waitForTimeout(postLoadWaitMs);
    },
  },
};
