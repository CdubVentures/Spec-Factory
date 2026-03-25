import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { screenshotExtractionPlugin } from '../screenshotPlugin.js';

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
});
