// WHY: Waits for the page to be visually ready before screenshot capture.
// Runs read-only page.evaluate() calls — no DOM modification.
// Gates: font loading, image decode, paint cycle (double-rAF).
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

  const timeoutMs = Number(settings?.capturePageScreenshotStabilizeTimeoutMs) || 3000;
  const gates = { fontsReady: false, imagesDecoded: false, paintCycleComplete: false };

  try {
    const gatePromise = (async () => {
      // Gate 1: Wait for web fonts to finish loading
      try {
        await page.evaluate(() => document.fonts.ready);
        gates.fontsReady = true;
      } catch {
        // fonts API may not exist or page may be detached
      }

      // Gate 2: Wait for all images to decode
      try {
        await page.evaluate(() =>
          Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map((img) => img.decode().catch(() => {})),
          ).then((results) => results.length),
        );
        gates.imagesDecoded = true;
      } catch {
        // image decode may fail on detached pages
      }

      // Gate 3: Double requestAnimationFrame — guarantees at least one paint cycle
      try {
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        gates.paintCycleComplete = true;
      } catch {
        // rAF may fail on detached pages
      }
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('stabilize_timeout')), timeoutMs),
    );

    await Promise.race([gatePromise, timeoutPromise]);

    const stabilized = gates.fontsReady || gates.imagesDecoded || gates.paintCycleComplete;
    return { stabilized, durationMs: Date.now() - start, gates };
  } catch {
    return { stabilized: false, durationMs: Date.now() - start, gates };
  }
}
