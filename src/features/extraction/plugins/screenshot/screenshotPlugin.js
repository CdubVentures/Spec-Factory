// WHY: Screenshot extraction plugin — orchestrates page stabilization,
// targeted selector crops, full-page capture, and scroll-and-stitch for
// pages exceeding Chromium's 16,384px texture limit. All capture logic
// is local to the extraction domain — no cross-feature imports.

import { captureScreenshots, estimatePageHeight } from './screenshotCapture.js';
import { stabilizePage } from './pageStabilizer.js';

async function tryStitch({ page, settings }) {
  const stitchEnabled = settings?.capturePageScreenshotStitchEnabled !== false
    && settings?.capturePageScreenshotStitchEnabled !== 'false';
  if (!stitchEnabled) return null;

  try {
    const { captureStitched } = await import('./viewportStitcher.js');
    return captureStitched({ page, settings });
  } catch {
    return null;
  }
}

export const screenshotExtractionPlugin = {
  name: 'screenshot',
  phase: 'capture',
  concurrent: true,
  async onExtract(ctx) {
    if (!ctx.settings?.capturePageScreenshotEnabled) return { screenshots: [] };

    // WHY: Wait for fonts, images, and paint cycle before capture.
    // Non-blocking — if stabilization fails, capture proceeds anyway.
    await stabilizePage({ page: ctx.page, settings: ctx.settings });

    const screenshots = await captureScreenshots({ page: ctx.page, settings: ctx.settings });

    // WHY: Detect pages taller than Chromium's 16,384px texture limit.
    // If exceeded and stitch is available, replace the clipped full-page
    // screenshot with a stitched version. Falls back gracefully if sharp
    // is not installed or stitch fails.
    const height = await estimatePageHeight({ page: ctx.page });
    if (height.exceedsLimit) {
      const stitched = await tryStitch({ page: ctx.page, settings: ctx.settings });
      if (stitched) {
        const pageIdx = screenshots.findIndex((s) => s.kind === 'page');
        if (pageIdx >= 0) {
          screenshots[pageIdx] = stitched;
        } else {
          screenshots.push(stitched);
        }
      }
    }

    return { screenshots };
  },
};
