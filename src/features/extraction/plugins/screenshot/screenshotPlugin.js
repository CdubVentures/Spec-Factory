// WHY: Screenshot extraction plugin — captures full-page and targeted selector
// screenshots from each URL. Runs sequentially with other extraction plugins
// after all fetch tools complete. Imports captureScreenshots via crawl's
// public API barrel (no internal cross-feature import).

import { captureScreenshots } from '../../../crawl/index.js';

export const screenshotExtractionPlugin = {
  name: 'screenshot',
  async onExtract(ctx) {
    if (!ctx.settings?.capturePageScreenshotEnabled) return { screenshots: [] };
    const screenshots = await captureScreenshots({ page: ctx.page, settings: ctx.settings });
    return { screenshots };
  },
};
