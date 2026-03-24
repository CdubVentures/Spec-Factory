// WHY: Wires the orphaned screenshotCapture.js as a proper onCapture plugin hook.
// The crawlSession already reads ctx.screenshots at line 88 — this hook sets it.

import { captureScreenshots } from '../screenshotCapture.js';

export const screenshotPlugin = {
  name: 'screenshot',
  hooks: {
    async onCapture(ctx) {
      if (!ctx.settings?.capturePageScreenshotEnabled) return;
      ctx.screenshots = await captureScreenshots({ page: ctx.page, settings: ctx.settings });
    },
  },
};
