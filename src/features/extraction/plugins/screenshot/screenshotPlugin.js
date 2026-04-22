// WHY: Screenshot extraction plugin — orchestrates page stabilization,
// targeted selector crops, full-page capture, and scroll-and-stitch for
// pages exceeding Chromium's 16,384px texture limit. All capture logic
// is local to the extraction domain — no cross-feature imports.

import { captureScreenshots } from './screenshotCapture.js';
import { stabilizePage } from './pageStabilizer.js';
import { waitForPageReady } from './pageReadinessGate.js';
import { validateScreenshot } from './screenshotValidator.js';

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

  // WHY: JSON-serializable summary for event telemetry. Strips Buffer bytes
  // so binary data never leaks into the event stream. O(1): each plugin owns
  // its own summarize — the runner calls it generically.
  summarize(result) {
    const shots = result?.screenshots ?? [];
    return {
      screenshot_count: shots.length,
      total_bytes: shots.reduce((sum, s) => sum + (s.bytes?.length ?? 0), 0),
      formats: [...new Set(shots.map((s) => s.format).filter(Boolean))],
      has_stitched: shots.some((s) => s.stitched),
    };
  },

  async onExtract(ctx) {
    if (!ctx.settings?.capturePageScreenshotEnabled) return { screenshots: [] };

    // WHY: Layer 1 — multi-signal readiness gate. Blocks the capture until
    // the page has actually rendered meaningful content (semantic landmark,
    // substantial text, commerce markers, or product imagery) OR the full
    // timeout + second-chance wait budget has elapsed. Emits diagnostic
    // events on second-chance use and full failure.
    const readiness = await waitForPageReady(ctx.page, {
      timeoutMs: Number(ctx.settings?.capturePageReadinessTimeoutMs) || 3000,
      secondChanceMs: Number(ctx.settings?.capturePageReadinessSecondChanceMs) || 3000,
      logger: ctx.logger,
    });

    // WHY: Single CDP round-trip: waits for fonts/images/paint AND returns
    // page dimensions (scrollHeight, exceedsLimit). Eliminates the separate
    // estimatePageHeight call that was an extra round-trip.
    const stability = await stabilizePage({ page: ctx.page, settings: ctx.settings });

    const screenshots = await captureScreenshots({ page: ctx.page, settings: ctx.settings });

    // WHY: Use height from stabilizer result — no extra evaluate call needed.
    if (stability.exceedsLimit) {
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

    // WHY: Layer 2 — post-capture validation. Inspects actual pixel output
    // (size + per-channel stddev entropy proxy) to catch blanks that slipped
    // past the readiness gate. Attaches { validation } to each screenshot and
    // emits diagnostic events for invalid captures. Does NOT drop invalid
    // screenshots — downstream may still want them for debugging.
    const url = ctx.url || (typeof ctx.page?.url === 'function' ? ctx.page.url() : '');
    for (const shot of screenshots) {
      try {
        const validation = await validateScreenshot(shot.bytes);
        shot.validation = validation;
        if (!validation.valid) {
          ctx.logger?.info?.('screenshot_validation_failed', {
            url,
            worker_id: ctx.workerId || '',
            kind: shot.kind || 'page',
            reason: validation.reason,
            metrics: validation.metrics,
            readiness: { ready: readiness.ready, signals: readiness.signals, reason: readiness.reason },
          });
        }
      } catch { /* validator never throws, but belt-and-suspenders */ }
    }

    return { screenshots };
  },
};
