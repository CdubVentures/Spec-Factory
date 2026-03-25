/**
 * DOM Expansion plugin — clicks expand/show-more buttons to reveal collapsed
 * sections and tables before page capture.
 * Hooks into onInteract (after auto-scroll, before screenshots).
 */

export const domExpansionPlugin = {
  name: 'domExpansion',
  hooks: {
    async onInteract({ page, settings }) {
      const enabled = settings?.domExpansionEnabled !== false && settings?.domExpansionEnabled !== 'false';
      if (!enabled) return { enabled: false, selectors: [], found: 0, clicked: 0, settleMs: 0 };

      const selectorStr = String(settings?.domExpansionSelectors || '');
      const selectors = selectorStr.split(',').map((s) => s.trim()).filter(Boolean);
      const maxClicks = Number(settings?.domExpansionMaxClicks) || 50;
      const settleMs = Number(settings?.domExpansionSettleMs) || 1500;

      let found = 0;
      let clicked = 0;

      for (const selector of selectors) {
        const elements = await page.locator(selector).all();
        found += elements.length;
        for (const el of elements) {
          if (clicked >= maxClicks) break;
          try {
            await el.click({ timeout: 2000 });
            clicked++;
          } catch { /* element may not be clickable — skip */ }
        }
        if (clicked >= maxClicks) break;
      }

      if (settleMs > 0) await page.waitForTimeout(settleMs);

      return { enabled: true, selectors, found, clicked, settleMs };
    },
  },
};
