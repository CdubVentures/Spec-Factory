import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureScreenshots } from '../screenshotCapture.js';
import {
  createElementDouble,
  createPageDouble,
} from '../../../tests/factories/extractionTestDoubles.js';

describe('captureScreenshots resilience', () => {
  it('returns an empty array when the full-page screenshot throws', async () => {
    const result = await captureScreenshots({
      page: createPageDouble({
        screenshotError: new Error('screenshot_failed'),
      }),
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
        capturePageScreenshotSelectors: '.nonexistent',
      },
    });

    assert.deepEqual(result, []);
  });

  it('skips a failing selector crop and still captures the page screenshot', async () => {
    const page = createPageDouble({
      elements: {
        table: createElementDouble({
          screenshotError: new Error('element_screenshot_failed'),
        }),
      },
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

    assert.deepEqual(
      result.map(({ kind, selector }) => ({ kind, selector })),
      [{ kind: 'page', selector: null }],
    );
  });
});
