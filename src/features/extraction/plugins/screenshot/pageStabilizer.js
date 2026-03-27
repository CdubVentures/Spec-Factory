// WHY: Waits for the page to be visually ready before screenshot capture.
// Single page.evaluate() call runs all gates in parallel inside the browser,
// minimizing CDP round-trips. Gates: font loading, image decode, paint cycle.
// Never throws — returns { stabilized: false } on timeout or failure.

export async function stabilizePage({ page, settings } = {}) {
  const start = Date.now();
  const defaultResult = {
    stabilized: false,
    durationMs: 0,
    gates: { fontsReady: false, imagesDecoded: false, paintCycleComplete: false },
  };

  const enabled = settings?.capturePageScreenshotStabilizeEnabled !== false
    && settings?.capturePageScreenshotStabilizeEnabled !== 'false';

  if (!enabled) {
    return { stabilized: true, durationMs: 0, gates: { fontsReady: true, imagesDecoded: true, paintCycleComplete: true } };
  }

  if (!page?.evaluate) {
    return { ...defaultResult, durationMs: Date.now() - start };
  }

  const timeoutMs = Number(settings?.capturePageScreenshotStabilizeTimeoutMs) || 1500;

  try {
    // WHY: Single evaluate call runs all 3 gates in parallel INSIDE the browser.
    // This is 1 CDP round-trip instead of 3. Each gate resolves independently —
    // a failed font load doesn't block image decode or paint cycle.
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
      return Promise.all([fonts, images, paint]);
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('stabilize_timeout')), timeoutMs),
    );

    const results = await Promise.race([gatePromise, timeoutPromise]);

    const gates = {
      fontsReady: Array.isArray(results) && results.includes('fonts'),
      imagesDecoded: Array.isArray(results) && results.includes('images'),
      paintCycleComplete: Array.isArray(results) && results.includes('paint'),
    };

    const stabilized = gates.fontsReady || gates.imagesDecoded || gates.paintCycleComplete;
    return { stabilized, durationMs: Date.now() - start, gates };
  } catch {
    return { stabilized: false, durationMs: Date.now() - start, gates: { fontsReady: false, imagesDecoded: false, paintCycleComplete: false } };
  }
}
