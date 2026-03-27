import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { screenshotExtractionPlugin } from '../screenshotPlugin.js';
import {
  createElementDouble,
  createPageDouble,
} from '../../../tests/factories/extractionTestDoubles.js';

// WHY: Stabilizer now returns combined { gates, scrollHeight, viewportHeight }
// in a single evaluate call. No separate estimatePageHeight evaluate needed.
const STABILIZER_RESULT = { gates: ['fonts', 'images', 'paint'], scrollHeight: 5000, viewportHeight: 1080 };
const STABILIZER_TALL = { gates: ['fonts', 'images', 'paint'], scrollHeight: 20000, viewportHeight: 1080 };

describe('screenshotExtractionPlugin', () => {
  it('has name "screenshot"', () => {
    assert.strictEqual(screenshotExtractionPlugin.name, 'screenshot');
  });

  it('has onExtract function', () => {
    assert.strictEqual(typeof screenshotExtractionPlugin.onExtract, 'function');
  });

  it('returns empty screenshots array when capture is disabled', async () => {
    const ctx = { settings: { capturePageScreenshotEnabled: false }, page: {} };
    const result = await screenshotExtractionPlugin.onExtract(ctx);
    assert.deepStrictEqual(result, { screenshots: [] });
  });

  it('returns empty screenshots array when settings are missing', async () => {
    const ctx = { settings: {}, page: {} };
    const result = await screenshotExtractionPlugin.onExtract(ctx);
    assert.deepStrictEqual(result, { screenshots: [] });
  });

  it('captures full-page first then selector crops when enabled', async () => {
    const ctx = {
      page: createPageDouble({
        elements: { table: createElementDouble() },
        evaluateResult: STABILIZER_RESULT,
      }),
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: 'table',
      },
    };

    const result = await screenshotExtractionPlugin.onExtract(ctx);

    assert.deepStrictEqual(
      result.screenshots.map(({ kind, selector, format }) => ({ kind, selector, format })),
      [
        { kind: 'page', selector: null, format: 'jpeg' },
        { kind: 'crop', selector: 'table', format: 'jpeg' },
      ],
    );
    assert.ok(Buffer.isBuffer(result.screenshots[0].bytes));
    assert.ok(Buffer.isBuffer(result.screenshots[1].bytes));
  });

  it('calls page.evaluate for stabilization before capturing screenshots', async () => {
    const callOrder = [];
    const page = createPageDouble({
      elements: { table: createElementDouble() },
      evaluateResults: [
        // Single stabilizer+dimensions call
        () => { callOrder.push('evaluate'); return STABILIZER_RESULT; },
      ],
    });
    const origScreenshot = page.screenshot.bind(page);
    page.screenshot = async (opts) => {
      callOrder.push('screenshot');
      return origScreenshot(opts);
    };

    const ctx = {
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: 'table',
      },
    };

    await screenshotExtractionPlugin.onExtract(ctx);

    const evalCount = callOrder.filter((c) => c === 'evaluate').length;
    assert.ok(evalCount >= 1, `expected at least 1 evaluate call, got ${evalCount}`);
    const firstEval = callOrder.indexOf('evaluate');
    const firstScreenshot = callOrder.indexOf('screenshot');
    assert.ok(firstEval < firstScreenshot, 'stabilization should run before capture');
  });

  it('still returns screenshots even if stabilization returns stabilized false', async () => {
    const page = createPageDouble({
      evaluateResult: STABILIZER_RESULT,
    });

    const ctx = {
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '',
      },
    };

    const result = await screenshotExtractionPlugin.onExtract(ctx);

    assert.ok(result.screenshots.length > 0);
  });

  it('skips stabilization when stabilize setting is disabled', async () => {
    const page = createPageDouble();

    const ctx = {
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotStabilizeEnabled: false,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '',
      },
    };

    const result = await screenshotExtractionPlugin.onExtract(ctx);

    assert.ok(result.screenshots.length > 0);
  });

  it('keeps clipped screenshot when stitch is not available (no sharp)', async () => {
    const page = createPageDouble({
      evaluateResult: STABILIZER_TALL,
    });

    const ctx = {
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '',
        capturePageScreenshotStitchEnabled: true,
      },
    };

    const result = await screenshotExtractionPlugin.onExtract(ctx);

    const pageShot = result.screenshots.find((s) => s.kind === 'page');
    assert.ok(pageShot, 'should keep the clipped page screenshot when stitch unavailable');
    assert.equal(pageShot.stitched, undefined);
  });
});
