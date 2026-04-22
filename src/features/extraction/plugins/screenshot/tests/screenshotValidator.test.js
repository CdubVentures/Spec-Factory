import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validateScreenshot } from '../screenshotValidator.js';

async function makeSolidColorPng(color = { r: 255, g: 255, b: 255 }, { width = 400, height = 300 } = {}) {
  return sharp({
    create: {
      width, height,
      channels: 3,
      background: color,
    },
  }).png().toBuffer();
}

async function makeRichPng({ width = 400, height = 300 } = {}) {
  // A composite with multiple colored bands — high stddev, non-blank.
  const bands = [];
  for (let i = 0; i < 6; i++) {
    const hue = i * 50;
    const band = await sharp({
      create: {
        width, height: Math.floor(height / 6),
        channels: 3,
        background: { r: (hue * 3) % 255, g: (hue * 5) % 255, b: (hue * 7) % 255 },
      },
    }).png().toBuffer();
    bands.push({ input: band, top: i * Math.floor(height / 6), left: 0 });
  }
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite(bands).png().toBuffer();
}

describe('validateScreenshot', () => {
  it('rejects an empty or missing buffer', async () => {
    const result = await validateScreenshot(null);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'missing_buffer');
  });

  it('rejects buffer smaller than minBytes (default 8KB)', async () => {
    const tiny = Buffer.alloc(100);
    const result = await validateScreenshot(tiny);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'too_small');
    assert.equal(result.metrics.bytes, 100);
  });

  it('rejects a solid-white PNG (blank capture)', async () => {
    const whitePng = await makeSolidColorPng({ r: 255, g: 255, b: 255 }, { width: 1280, height: 900 });
    const result = await validateScreenshot(whitePng);
    assert.equal(result.valid, false, `Expected invalid, got reason=${result.reason}`);
    assert.match(result.reason, /uniform_color|solid_color|low_entropy/);
  });

  it('rejects a solid-black PNG (blank capture)', async () => {
    const blackPng = await makeSolidColorPng({ r: 0, g: 0, b: 0 }, { width: 1280, height: 900 });
    const result = await validateScreenshot(blackPng);
    assert.equal(result.valid, false);
    assert.match(result.reason, /uniform_color|solid_color|low_entropy/);
  });

  it('accepts a rich multi-color PNG (real content)', async () => {
    const richPng = await makeRichPng({ width: 1280, height: 900 });
    const result = await validateScreenshot(richPng);
    assert.equal(result.valid, true, `Expected valid, got reason=${result.reason}`);
  });

  it('reports metrics.bytes', async () => {
    const richPng = await makeRichPng();
    const result = await validateScreenshot(richPng);
    assert.equal(result.metrics.bytes, richPng.length);
    assert.ok(result.metrics.bytes > 0);
  });

  it('reports image dimensions', async () => {
    const png = await makeRichPng({ width: 640, height: 480 });
    const result = await validateScreenshot(png);
    assert.equal(result.metrics.width, 640);
    assert.equal(result.metrics.height, 480);
  });

  it('reports stddev values for R/G/B channels (entropy proxy)', async () => {
    const png = await makeRichPng();
    const result = await validateScreenshot(png);
    assert.ok(typeof result.metrics.stddevMean === 'number');
    assert.ok(result.metrics.stddevMean > 0);
  });

  it('respects custom minBytes threshold', async () => {
    const richPng = await makeRichPng();
    const result = await validateScreenshot(richPng, { minBytes: richPng.length + 1 });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'too_small');
  });

  it('respects custom minStddev threshold', async () => {
    const richPng = await makeRichPng();
    const result = await validateScreenshot(richPng, { minStddev: 10000 }); // impossibly high
    assert.equal(result.valid, false);
  });

  it('never throws on corrupted image data', async () => {
    const garbage = Buffer.from('this is not a real png file but is long enough to pass the size check'.repeat(200));
    const result = await validateScreenshot(garbage);
    assert.equal(result.valid, false);
    assert.match(result.reason, /decode_failed|invalid_image/);
  });
});
