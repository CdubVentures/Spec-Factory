import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { screenshotExtractionPlugin } from '../screenshotPlugin.js';
import {
  createElementDouble,
  createPageDouble,
} from '../../../../crawl/tests/factories/crawlTestDoubles.js';

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

  it('captures selector crops and a full-page screenshot when capture is enabled', async () => {
    const ctx = {
      page: createPageDouble({
        elements: {
          table: createElementDouble(),
        },
      }),
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: 'table',
      },
    };

    const result = await screenshotExtractionPlugin.onExtract(ctx);

    assert.deepStrictEqual(
      result.screenshots.map(({ kind, selector, format }) => ({ kind, selector, format })),
      [
        { kind: 'crop', selector: 'table', format: 'jpeg' },
        { kind: 'page', selector: null, format: 'jpeg' },
      ],
    );
    assert.ok(Buffer.isBuffer(result.screenshots[0].bytes));
    assert.ok(Buffer.isBuffer(result.screenshots[1].bytes));
  });
});
