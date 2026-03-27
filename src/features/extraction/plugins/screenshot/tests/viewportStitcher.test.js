import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { captureStitched } from '../viewportStitcher.js';
import { createPageDouble } from '../../../tests/factories/extractionTestDoubles.js';

// WHY: sharp needs valid image buffers to composite. Create a tiny real
// PNG at test startup for use in the page screenshot double.
let tinyPng;
before(async () => {
  const sharp = (await import('sharp')).default;
  tinyPng = await sharp({
    create: { width: 1920, height: 1080, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } },
  }).png().toBuffer();
});

describe('captureStitched', () => {
  it('returns a stitched screenshot for a 2-viewport page', async () => {
    const viewportHeight = 1080;
    const scrollHeight = viewportHeight * 2;

    const page = createPageDouble({
      screenshotBytes: tinyPng,
      viewport: { width: 1920, height: viewportHeight },
      evaluateResults: [
        { scrollHeight, viewportHeight },
        () => {}, true,
        () => {}, true,
        () => {},
      ],
    });

    const result = await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'jpeg',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 50_000_000,
    } });

    assert.ok(result, 'should return a stitched result');
    assert.equal(result.kind, 'page');
    assert.equal(result.stitched, true);
    assert.equal(result.viewportCount, 2);
    assert.ok(Buffer.isBuffer(result.bytes));
    assert.ok(result.bytes.length > 0);
    assert.equal(result.width, 1920);
    assert.equal(result.height, scrollHeight);
    assert.ok(result.captured_at);
  });

  it('returns null when _sharp override is null (sharp absent)', async () => {
    const page = createPageDouble({
      evaluateResults: [
        { scrollHeight: 20000, viewportHeight: 1080 },
      ],
    });

    const result = await captureStitched({
      page,
      settings: { capturePageScreenshotFormat: 'jpeg', capturePageScreenshotQuality: 75, capturePageScreenshotMaxBytes: 50_000_000 },
      _sharp: null,
    });

    assert.equal(result, null);
  });

  it('returns null when page.evaluate throws', async () => {
    const page = createPageDouble();
    page.evaluate = async () => { throw new Error('detached'); };

    const result = await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'jpeg',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 50_000_000,
    } });

    assert.equal(result, null);
  });

  it('returns null when page.screenshot throws during viewport capture', async () => {
    const page = createPageDouble({
      screenshotError: new Error('screenshot_boom'),
      evaluateResults: [
        { scrollHeight: 2160, viewportHeight: 1080 },
        () => {}, true,
      ],
    });

    const result = await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'jpeg',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 50_000_000,
    } });

    assert.equal(result, null);
  });

  it('sets format and selector correctly on the result', async () => {
    const page = createPageDouble({
      screenshotBytes: tinyPng,
      viewport: { width: 1920, height: 1080 },
      evaluateResults: [
        { scrollHeight: 2160, viewportHeight: 1080 },
        () => {}, true,
        () => {}, true,
        () => {},
      ],
    });

    const result = await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'png',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 50_000_000,
    } });

    assert.ok(result);
    assert.equal(result.format, 'png');
    assert.equal(result.selector, null);
  });

  it('resets scroll position to 0 after capture', async () => {
    const scrollPositions = [];
    let evalIdx = 0;
    const results = [
      { scrollHeight: 2160, viewportHeight: 1080 },
      (fn) => { scrollPositions.push('scroll'); },
      true,
      (fn) => { scrollPositions.push('scroll'); },
      true,
      (fn) => { scrollPositions.push('reset'); },
    ];

    const page = createPageDouble({
      screenshotBytes: tinyPng,
      viewport: { width: 1920, height: 1080 },
      evaluateResults: results,
    });

    await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'jpeg',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 50_000_000,
    } });

    assert.ok(scrollPositions.includes('reset'), 'should reset scroll position');
  });

  it('returns null when stitched buffer exceeds maxBytes', async () => {
    const page = createPageDouble({
      screenshotBytes: tinyPng,
      viewport: { width: 1920, height: 1080 },
      evaluateResults: [
        { scrollHeight: 2160, viewportHeight: 1080 },
        () => {}, true,
        () => {}, true,
        () => {},
      ],
    });

    const result = await captureStitched({ page, settings: {
      capturePageScreenshotFormat: 'jpeg',
      capturePageScreenshotQuality: 75,
      capturePageScreenshotMaxBytes: 1,
    } });

    assert.equal(result, null);
  });
});
