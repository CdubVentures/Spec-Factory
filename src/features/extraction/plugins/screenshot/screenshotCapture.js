/**
 * Screenshot capture for the extraction pipeline.
 * Takes both targeted selector crops AND a full-page screenshot.
 * Never throws — returns empty array on failure.
 */

function parseSelectors(settings) {
  const raw = String(settings?.capturePageScreenshotSelectors ?? '');
  const maxSelectors = Number(settings?.capturePageScreenshotMaxSelectors) || 12;
  const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed.slice(0, maxSelectors) : [];
}

function resolveFormat(settings) {
  return String(settings?.capturePageScreenshotFormat ?? '').trim().toLowerCase() === 'png'
    ? 'png'
    : 'jpeg';
}

async function captureOne(page, element, { format, quality, maxBytes }) {
  const opts = { type: format, fullPage: !element };
  if (format === 'jpeg') opts.quality = quality;

  const bytes = element
    ? await element.screenshot(opts)
    : await page.screenshot(opts);

  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return null;
  if (bytes.length > maxBytes) return null;

  const viewport = page.viewportSize?.() ?? {};
  return {
    kind: element ? 'crop' : 'page',
    format,
    selector: null,
    bytes,
    width: Number(viewport.width || 0) || null,
    height: Number(viewport.height || 0) || null,
    captured_at: new Date().toISOString(),
  };
}

export async function captureScreenshots({ page, settings }) {
  if (!settings?.capturePageScreenshotEnabled) return [];

  const format = resolveFormat(settings);
  const quality = Number(settings?.capturePageScreenshotQuality) || 75;
  const maxBytes = Number(settings?.capturePageScreenshotMaxBytes) || 5_000_000;
  const selectors = parseSelectors(settings);
  const captureOpts = { format, quality, maxBytes };

  const results = [];

  // WHY: Full-page screenshot FIRST — this is the most important output.
  // If handler timeout kills us during selector crops, we still have it.
  try {
    const shot = await captureOne(page, null, captureOpts);
    if (shot) results.push(shot);
  } catch {
    // swallow
  }

  // Targeted selector crops (nice-to-have, runs after full-page)
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;
      const shot = await captureOne(page, element, captureOpts);
      if (shot) {
        shot.selector = selector;
        results.push(shot);
      }
    } catch {
      // skip failed selector
    }
  }

  return results;
}

// WHY: Detect whether the page exceeds Chromium's 16,384px texture limit.
// Used by the screenshot plugin to decide between normal capture and scroll-and-stitch.
// Never throws — returns safe defaults on failure.
const CHROMIUM_TEXTURE_LIMIT = 16384;

export async function estimatePageHeight({ page }) {
  try {
    const dims = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    return {
      scrollHeight: dims.scrollHeight,
      viewportHeight: dims.viewportHeight,
      exceedsLimit: dims.scrollHeight > CHROMIUM_TEXTURE_LIMIT,
    };
  } catch {
    return { scrollHeight: 0, viewportHeight: 0, exceedsLimit: false };
  }
}
