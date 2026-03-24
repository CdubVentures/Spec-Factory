import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { screenshotPlugin } from '../screenshotPlugin.js';

describe('screenshotPlugin', () => {
  it('has correct name and onCapture hook', () => {
    assert.equal(screenshotPlugin.name, 'screenshot');
    assert.equal(typeof screenshotPlugin.hooks.onCapture, 'function');
  });

  it('attaches screenshots to ctx when enabled', async () => {
    const fakeShots = [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('fake') }];
    const ctx = {
      page: {
        $: async () => null,
        screenshot: async () => Buffer.from('fake'),
        viewportSize: () => ({ width: 1920, height: 1080 }),
        content: async () => '<html></html>',
      },
      settings: {
        capturePageScreenshotEnabled: true,
        capturePageScreenshotSelectors: '',
        capturePageScreenshotFormat: 'jpeg',
        capturePageScreenshotQuality: 50,
        capturePageScreenshotMaxBytes: 5_000_000,
      },
    };

    await screenshotPlugin.hooks.onCapture(ctx);
    assert.ok(Array.isArray(ctx.screenshots), 'screenshots should be an array');
    assert.ok(ctx.screenshots.length > 0, 'should have at least one screenshot');
  });

  it('does nothing when disabled', async () => {
    const ctx = {
      page: {},
      settings: { capturePageScreenshotEnabled: false },
    };

    await screenshotPlugin.hooks.onCapture(ctx);
    assert.equal(ctx.screenshots, undefined, 'should not set screenshots');
  });

  it('does nothing when settings missing', async () => {
    const ctx = { page: {}, settings: null };
    await screenshotPlugin.hooks.onCapture(ctx);
    assert.equal(ctx.screenshots, undefined);
  });
});
