// WHY: Scroll-and-stitch capture for pages exceeding Chromium's 16,384px
// texture limit. Scrolls viewport-by-viewport, captures each section,
// then stitches with sharp into a single tall image.
// Uses dynamic import('sharp') — returns null if sharp is absent.
// Never throws — returns null on any failure.

function resolveFormat(settings) {
  return String(settings?.capturePageScreenshotFormat ?? '').trim().toLowerCase() === 'png'
    ? 'png'
    : 'jpeg';
}

export async function captureStitched({ page, settings, _sharp } = {}) {
  try {
    const sharpModule = _sharp !== undefined
      ? _sharp
      : (await import('sharp').catch(() => null))?.default ?? null;

    if (!sharpModule) return null;

    const dims = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    const { scrollHeight, viewportHeight } = dims;
    if (!scrollHeight || !viewportHeight || scrollHeight <= viewportHeight) return null;

    const format = resolveFormat(settings);
    const quality = Number(settings?.capturePageScreenshotQuality) || 75;
    const maxBytes = Number(settings?.capturePageScreenshotMaxBytes) || 5_000_000;
    const chunks = Math.ceil(scrollHeight / viewportHeight);
    const sections = [];

    for (let i = 0; i < chunks; i++) {
      const y = i * viewportHeight;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);

      // WHY: Double-rAF ensures the browser has painted the new scroll position
      // before we capture. Without this, fast scrolling can capture stale frames.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const screenshotOpts = { type: format, fullPage: false };
      if (format === 'jpeg') screenshotOpts.quality = quality;

      const buf = await page.screenshot(screenshotOpts);
      if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
      sections.push(buf);
    }

    // WHY: Always reset scroll position — a future extraction plugin may
    // read DOM state that depends on scroll position.
    await page.evaluate(() => window.scrollTo(0, 0));

    // WHY: Stitch all viewport sections into one tall image.
    // sharp.composite() places each section at its calculated vertical offset.
    const viewport = page.viewportSize?.() ?? {};
    const width = Number(viewport.width) || 1920;
    const totalHeight = scrollHeight;

    const canvas = sharpModule({
      create: {
        width,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    });

    const compositeInputs = sections.map((buf, i) => ({
      input: buf,
      top: i * viewportHeight,
      left: 0,
    }));

    const outputOpts = format === 'jpeg'
      ? canvas.composite(compositeInputs).jpeg({ quality })
      : canvas.composite(compositeInputs).png();

    const stitchedBytes = await outputOpts.toBuffer();

    if (!Buffer.isBuffer(stitchedBytes) || stitchedBytes.length === 0) return null;
    if (stitchedBytes.length > maxBytes) return null;

    return {
      kind: 'page',
      format,
      selector: null,
      bytes: stitchedBytes,
      width,
      height: totalHeight,
      captured_at: new Date().toISOString(),
      stitched: true,
      viewportCount: sections.length,
    };
  } catch {
    // WHY: Always try to reset scroll even on error.
    try { await page?.evaluate?.(() => window.scrollTo(0, 0)); } catch { /* swallow */ }
    return null;
  }
}
