import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureScreenshots } from '../screenshotCapture.js';
import {
  createElementDouble,
  createPageDouble,
} from '../../../tests/factories/extractionTestDoubles.js';

describe('captureScreenshots format and limits', () => {
  it('drops screenshots that exceed the configured max bytes', async () => {
    const bigBuffer = Buffer.alloc(6_000_000);
    const element = createElementDouble({ screenshotBytes: bigBuffer });
    const page = createPageDouble({
      elements: { table: element },
      screenshotBytes: bigBuffer,
    });

    const result = await captureScreenshots({
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: 'table',
      },
    });

    assert.deepEqual(result, []);
  });

  it('passes quality when using jpeg screenshots', async () => {
    const page = createPageDouble();

    await captureScreenshots({
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '',
      },
    });

    assert.equal(page.screenshotCalls.length, 1);
    assert.equal(page.screenshotCalls[0].type, 'jpeg');
    assert.equal(page.screenshotCalls[0].quality, 75);
  });

  it('omits quality when using png screenshots', async () => {
    const page = createPageDouble();

    await captureScreenshots({
      page,
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'png',
        capturePageScreenshotQuality: 75,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '',
      },
    });

    assert.equal(page.screenshotCalls.length, 1);
    assert.equal(page.screenshotCalls[0].type, 'png');
    assert.equal(page.screenshotCalls[0].quality, undefined);
  });
});
