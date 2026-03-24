import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureScreenshots } from '../screenshotCapture.js';
import {
  createElementDouble,
  createPageDouble,
} from './factories/crawlTestDoubles.js';

describe('captureScreenshots contract', () => {
  it('returns an empty array when capture is disabled', async () => {
    const result = await captureScreenshots({
      page: createPageDouble(),
      settings: { capturePageScreenshotEnabled: false },
    });

    assert.deepEqual(result, []);
  });

  it('returns selector crops and a full-page screenshot when selectors match', async () => {
    const element = createElementDouble();
    const result = await captureScreenshots({
      page: createPageDouble({ elements: { table: element } }),
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: 'table',
      },
    });

    const crop = result.find((entry) => entry.kind === 'crop');
    const pageShot = result.find((entry) => entry.kind === 'page');

    assert.ok(crop);
    assert.equal(crop.selector, 'table');
    assert.equal(crop.format, 'jpeg');
    assert.ok(Buffer.isBuffer(crop.bytes));
    assert.ok(pageShot);
    assert.equal(pageShot.selector, null);
  });

  it('falls back to a full-page screenshot when selectors miss', async () => {
    const result = await captureScreenshots({
      page: createPageDouble(),
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '.nonexistent-selector',
      },
    });

    assert.deepEqual(
      result.map(({ kind, selector }) => ({ kind, selector })),
      [{ kind: 'page', selector: null }],
    );
  });
});
