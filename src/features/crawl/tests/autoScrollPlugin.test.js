import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoScrollPlugin } from '../plugins/autoScrollPlugin.js';
import { createPageDouble } from './factories/crawlTestDoubles.js';

describe('autoScrollPlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(autoScrollPlugin.name, 'autoScroll');
    assert.equal(typeof autoScrollPlugin.hooks.onInteract, 'function');
  });

  it('does not scroll when autoScrollEnabled is false', async () => {
    const page = createPageDouble();
    await autoScrollPlugin.hooks.onInteract({
      page,
      settings: { autoScrollEnabled: false, autoScrollPasses: 2, autoScrollDelayMs: 100 },
    });
    assert.equal(page.evaluateCalls.length, 0, 'should not call evaluate when disabled');
  });

  it('scrolls the correct number of passes', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    await autoScrollPlugin.hooks.onInteract({
      page,
      settings: { autoScrollEnabled: true, autoScrollPasses: 3, autoScrollDelayMs: 0, postLoadWaitMs: 0 },
    });
    assert.ok(page.evaluateCalls.length >= 3, `should scroll at least 3 times, got ${page.evaluateCalls.length}`);
  });

  it('no-ops when autoScrollPasses is 0', async () => {
    const page = createPageDouble();
    await autoScrollPlugin.hooks.onInteract({
      page,
      settings: { autoScrollEnabled: true, autoScrollPasses: 0, autoScrollDelayMs: 0 },
    });
    assert.equal(page.evaluateCalls.length, 0, 'should not scroll with 0 passes');
  });
});
