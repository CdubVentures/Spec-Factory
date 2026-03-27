import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stabilizePage } from '../pageStabilizer.js';
import { createPageDouble } from '../../../tests/factories/extractionTestDoubles.js';

// WHY: The stabilizer's single page.evaluate() returns a combined object:
// { gates: ['fonts', 'images', 'paint'], scrollHeight, viewportHeight }
// This eliminates a separate estimatePageHeight CDP round-trip.
const FULL_RESULT = { gates: ['fonts', 'images', 'paint'], scrollHeight: 5000, viewportHeight: 1080 };

describe('stabilizePage', () => {
  it('returns stabilized true when all gates pass within timeout', async () => {
    const page = createPageDouble({ evaluateResult: FULL_RESULT });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, true);
    assert.equal(result.gates.fontsReady, true);
    assert.equal(result.gates.imagesDecoded, true);
    assert.equal(result.gates.paintCycleComplete, true);
  });

  it('makes exactly one page.evaluate call (single CDP round-trip)', async () => {
    const page = createPageDouble({ evaluateResult: FULL_RESULT });

    await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(page.evaluateCalls.length, 1);
  });

  it('returns page dimensions from the same evaluate call', async () => {
    const page = createPageDouble({
      evaluateResult: { gates: ['fonts', 'images', 'paint'], scrollHeight: 12000, viewportHeight: 1080 },
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.scrollHeight, 12000);
    assert.equal(result.viewportHeight, 1080);
    assert.equal(result.exceedsLimit, false);
  });

  it('sets exceedsLimit true when scrollHeight exceeds 16384', async () => {
    const page = createPageDouble({
      evaluateResult: { gates: ['fonts', 'images', 'paint'], scrollHeight: 20000, viewportHeight: 1080 },
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.exceedsLimit, true);
  });

  it('returns durationMs as a non-negative number', async () => {
    const page = createPageDouble({ evaluateResult: FULL_RESULT });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0);
  });

  it('skips stabilization when disabled and returns immediately', async () => {
    const page = createPageDouble();

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: false } });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 0);
    assert.equal(result.scrollHeight, 0);
    assert.equal(result.exceedsLimit, false);
  });

  it('skips stabilization when disabled via string false', async () => {
    const page = createPageDouble();

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: 'false' } });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 0);
  });

  it('defaults to enabled when setting is missing', async () => {
    const page = createPageDouble({ evaluateResult: FULL_RESULT });

    const result = await stabilizePage({ page, settings: {} });

    assert.equal(result.stabilized, true);
    assert.equal(page.evaluateCalls.length, 1);
  });

  it('returns stabilized false when page.evaluate throws', async () => {
    const page = createPageDouble();
    page.evaluate = async () => { throw new Error('evaluate_failed'); };

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, false);
    assert.equal(result.scrollHeight, 0);
    assert.equal(result.exceedsLimit, false);
  });

  it('never throws even on catastrophic failure', async () => {
    const result = await stabilizePage({ page: null, settings: {} });

    assert.equal(result.stabilized, false);
    assert.equal(typeof result.durationMs, 'number');
    assert.equal(result.scrollHeight, 0);
  });

  it('handles partial gate results from the browser', async () => {
    const page = createPageDouble({
      evaluateResult: { gates: [null, 'images', 'paint'], scrollHeight: 3000, viewportHeight: 1080 },
    });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(result.stabilized, true);
    assert.equal(result.gates.fontsReady, false);
    assert.equal(result.gates.imagesDecoded, true);
    assert.equal(result.gates.paintCycleComplete, true);
  });

  it('gates object has all three boolean fields', async () => {
    const page = createPageDouble({ evaluateResult: FULL_RESULT });

    const result = await stabilizePage({ page, settings: { capturePageScreenshotStabilizeEnabled: true } });

    assert.equal(typeof result.gates.fontsReady, 'boolean');
    assert.equal(typeof result.gates.imagesDecoded, 'boolean');
    assert.equal(typeof result.gates.paintCycleComplete, 'boolean');
  });
});
