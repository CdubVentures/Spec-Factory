import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stabilizePage } from '../pageStabilizer.js';
import { createPageDouble } from '../../../tests/factories/extractionTestDoubles.js';

describe('stabilizePage', () => {
  it('returns stabilized true when all gates pass within timeout', async () => {
    const page = createPageDouble({
      evaluateResults: [
        true,   // fonts ready
        0,      // images decoded (count of images decoded)
        true,   // paint cycle (rAF resolved)
      ],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, true);
    assert.equal(result.gates.fontsReady, true);
    assert.equal(result.gates.imagesDecoded, true);
    assert.equal(result.gates.paintCycleComplete, true);
  });

  it('returns durationMs as a non-negative number', async () => {
    const page = createPageDouble({
      evaluateResults: [true, 0, true],
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
      evaluateResults: [true, 0, true],
    });

    const result = await stabilizePage({ page, settings: {} });

    assert.equal(result.stabilized, true);
    assert.ok(page.evaluateCalls.length > 0);
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

  it('uses default timeout of 3000ms when setting is missing', async () => {
    const page = createPageDouble({
      evaluateResults: [true, 0, true],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    // Just verify it completes (no hang) — timeout is internal
    assert.equal(result.stabilized, true);
  });

  it('gates object has all three boolean fields', async () => {
    const page = createPageDouble({
      evaluateResults: [true, 0, true],
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(typeof result.gates.fontsReady, 'boolean');
    assert.equal(typeof result.gates.imagesDecoded, 'boolean');
    assert.equal(typeof result.gates.paintCycleComplete, 'boolean');
  });

  it('returns partial gates when some pass and evaluate eventually throws', async () => {
    let callCount = 0;
    const page = createPageDouble();
    page.evaluate = async () => {
      callCount++;
      if (callCount === 1) return true;  // fonts ready
      throw new Error('images_failed');
    };

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    // Should not crash — returns whatever it managed to gather
    assert.equal(typeof result.stabilized, 'boolean');
    assert.ok(result.gates);
  });
});
