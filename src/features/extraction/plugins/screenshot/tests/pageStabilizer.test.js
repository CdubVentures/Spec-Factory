import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stabilizePage } from '../pageStabilizer.js';
import { createPageDouble } from '../../../tests/factories/extractionTestDoubles.js';

describe('stabilizePage', () => {
  it('returns stabilized true when all gates pass within timeout', async () => {
    // WHY: Single evaluate call returns array of gate results from browser
    const page = createPageDouble({
      evaluateResult: ['fonts', 'images', 'paint'],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, true);
    assert.equal(result.gates.fontsReady, true);
    assert.equal(result.gates.imagesDecoded, true);
    assert.equal(result.gates.paintCycleComplete, true);
  });

  it('makes exactly one page.evaluate call (single CDP round-trip)', async () => {
    const page = createPageDouble({
      evaluateResult: ['fonts', 'images', 'paint'],
    });

    await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(page.evaluateCalls.length, 1);
  });

  it('returns durationMs as a non-negative number', async () => {
    const page = createPageDouble({
      evaluateResult: ['fonts', 'images', 'paint'],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0);
  });

  it('skips stabilization when disabled and returns immediately', async () => {
    const page = createPageDouble();

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: false } });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 0);
  });

  it('skips stabilization when disabled via string false', async () => {
    const page = createPageDouble();

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: 'false' } });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 0);
  });

  it('defaults to enabled when setting is missing', async () => {
    const page = createPageDouble({
      evaluateResult: ['fonts', 'images', 'paint'],
    });

    const result = await stabilizePage({ page, settings: {} });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 1);
  });

  it('returns stabilized false when page.evaluate throws', async () => {
    const page = createPageDouble();
    page.evaluate = async () => { throw new Error('evaluate_failed'); };

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, false);
  });

  it('never throws even on catastrophic failure', async () => {
    const result = await stabilizePage({ page: null, settings: {} });

    assert.equal(result.stabilized, false);
    assert.equal(typeof result.durationMs, 'number');
  });

  it('handles partial gate results from the browser', async () => {
    // WHY: If fonts failed but images and paint succeeded, only 2 entries
    const page = createPageDouble({
      evaluateResult: [null, 'images', 'paint'],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, true);
    assert.equal(result.gates.fontsReady, false);
    assert.equal(result.gates.imagesDecoded, true);
    assert.equal(result.gates.paintCycleComplete, true);
  });

  it('gates object has all three boolean fields', async () => {
    const page = createPageDouble({
      evaluateResult: ['fonts', 'images', 'paint'],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(typeof result.gates.fontsReady, 'boolean');
    assert.equal(typeof result.gates.imagesDecoded, 'boolean');
    assert.equal(typeof result.gates.paintCycleComplete, 'boolean');
  });
});
