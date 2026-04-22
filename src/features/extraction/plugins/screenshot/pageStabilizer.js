// WHY: Waits for the page to be visually ready before screenshot capture.
// Single page.evaluate() call runs all gates in parallel inside the browser
// AND reads page dimensions — eliminating a separate estimatePageHeight
// CDP round-trip. Never throws — returns { stabilized: false } on failure.

const CHROMIUM_TEXTURE_LIMIT = 16384;

export async function stabilizePage({ page, settings } = {}) {
  const start = Date.now();
  const defaultDims = { scrollHeight: 0, viewportHeight: 0, exceedsLimit: false };
  const defaultGates = { fontsReady: false, imagesDecoded: false, paintCycleComplete: false };
  const defaultResult = { stabilized: false, durationMs: 0, gates: defaultGates, ...defaultDims };

  const enabled = settings?.capturePageScreenshotStabilizeEnabled !== false
    && settings?.capturePageScreenshotStabilizeEnabled !== 'false';

  if (!enabled) {
    return {
      stabilized: true, durationMs: 0,
      gates: { fontsReady: true, imagesDecoded: true, paintCycleComplete: true },
      ...defaultDims,
    };
  }

  if (!page?.evaluate) {
    return { ...defaultResult, durationMs: Date.now() - start };
  }

  const timeoutMs = Number(settings?.capturePageScreenshotStabilizeTimeoutMs) || 1500;

  try {
    const gatePromise = page.evaluate(() => {
      const fonts = document.fonts.ready.then(() => 'fonts').catch(() => null);
      const images = Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => img.decode().catch(() => null)),
      ).then(() => 'images').catch(() => null);
      const paint = new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve('paint'))),
      );
      return Promise.all([fonts, images, paint]).then((gates) => ({
        gates,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      }));
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('stabilize_timeout')), timeoutMs),
    );

    const raw = await Promise.race([gatePromise, timeoutPromise]);
    const gateArray = raw?.gates ?? [];

    const gates = {
      fontsReady: Array.isArray(gateArray) && gateArray.includes('fonts'),
      imagesDecoded: Array.isArray(gateArray) && gateArray.includes('images'),
      paintCycleComplete: Array.isArray(gateArray) && gateArray.includes('paint'),
    };

    const scrollHeight = Number(raw?.scrollHeight) || 0;
    const viewportHeight = Number(raw?.viewportHeight) || 0;
    const stabilized = gates.fontsReady || gates.imagesDecoded || gates.paintCycleComplete;

    return {
      stabilized,
      durationMs: Date.now() - start,
      gates,
      scrollHeight,
      viewportHeight,
      exceedsLimit: scrollHeight > CHROMIUM_TEXTURE_LIMIT,
    };
  } catch {
    return { stabilized: false, durationMs: Date.now() - start, gates: defaultGates, ...defaultDims };
  }
}
