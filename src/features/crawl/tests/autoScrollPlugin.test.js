import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoScrollPlugin } from '../plugins/autoScrollPlugin.js';
import { createPageDouble } from './factories/crawlTestDoubles.js';

describe('autoScrollPlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(autoScrollPlugin.name, 'autoScroll');
    assert.equal(typeof autoScrollPlugin.hooks.onScroll, 'function');
  });

  it('does not scroll when autoScrollEnabled is false', async () => {
    const page = createPageDouble();
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: false, autoScrollPasses: 2, autoScrollDelayMs: 100 },
    });
    assert.equal(page.evaluateCalls.length, 0, 'should not call evaluate when disabled');
    assert.equal(result.enabled, false);
  });

  it('no-ops when autoScrollPasses is 0', async () => {
    const page = createPageDouble();
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollPasses: 0, autoScrollDelayMs: 0 },
    });
    assert.equal(page.evaluateCalls.length, 0, 'should not scroll with 0 passes');
    assert.equal(result.enabled, false);
  });
});

// ── Jump strategy (default / backward-compat) ──────────────────────────────

describe('autoScrollPlugin — jump strategy', () => {
  it('uses evaluate for scrollTo, not mouse.wheel', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'jump', autoScrollPasses: 3, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.ok(page.evaluateCalls.length >= 3, `should evaluate at least 3 times, got ${page.evaluateCalls.length}`);
    assert.equal(page.mouseWheelCalls.length, 0, 'jump should not use mouse.wheel');
  });

  it('defaults to jump when strategy is undefined', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollPasses: 2, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(result.strategy, 'jump');
    assert.equal(page.mouseWheelCalls.length, 0);
  });

  it('defaults to jump when strategy is missing from settings', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollPasses: 1, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(result.strategy, 'jump');
  });

  it('returns strategy: jump in result', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'jump', autoScrollPasses: 1, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(result.strategy, 'jump');
    assert.equal(result.enabled, true);
  });
});

// ── Incremental strategy ────────────────────────────────────────────────────

describe('autoScrollPlugin — incremental strategy', () => {
  it('fires mouse.wheel with positive deltaY', async () => {
    // [innerHeight, initialScrollHeight, heightAfterWheel1, heightAfterWheel2, heightAfterWheel3]
    const page = createPageDouble({
      evaluateResults: [1080, 3000, 3000, 3000, 3000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 5, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.ok(page.mouseWheelCalls.length > 0, 'should use mouse.wheel');
    for (const call of page.mouseWheelCalls) {
      assert.ok(call.deltaY > 0, 'deltaY should be positive');
    }
  });

  it('stops after 2 consecutive stable heights', async () => {
    // Height never changes — should stop quickly
    const page = createPageDouble({
      evaluateResults: [1080, 3000, 3000, 3000, 3000, 3000, 3000, 3000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 20, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    // 2 stable checks → stop. Should not do all 20 passes
    assert.ok(page.mouseWheelCalls.length <= 3, `should stop early, got ${page.mouseWheelCalls.length} wheel calls`);
  });

  it('continues when height grows', async () => {
    // Height grows each time — should continue
    const page = createPageDouble({
      evaluateResults: [1080, 2000, 3000, 4000, 5000, 5000, 5000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 10, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    // Should scroll through growing heights before stabilizing
    assert.ok(page.mouseWheelCalls.length >= 3, 'should continue through growth');
  });

  it('caps at autoScrollPasses maximum', async () => {
    // Height always grows — but capped at 3 passes
    const page = createPageDouble({
      evaluateResults: [1080, 1000, 2000, 3000, 4000, 5000, 6000, 7000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 3, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(page.mouseWheelCalls.length, 3, 'should cap at passes max');
  });

  it('resets scroll to top after incremental passes', async () => {
    const page = createPageDouble({
      evaluateResults: [1080, 3000, 3000, 3000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 5, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    // Last evaluate call should be the scrollTo(0,0) reset
    assert.ok(page.evaluateCalls.length >= 1, 'should call evaluate for reset');
  });

  it('returns strategy: incremental with actual wheel count', async () => {
    // Stabilizes after 2 wheels
    const page = createPageDouble({
      evaluateResults: [1080, 3000, 3000, 3000],
    });
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 10, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(result.strategy, 'incremental');
    assert.equal(result.enabled, true);
    assert.ok(result.passes <= 10, 'passes should be actual count, not max');
  });

  it('waits delayMs between wheel events', async () => {
    const page = createPageDouble({
      evaluateResults: [1080, 1000, 2000, 3000, 3000, 3000],
    });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'incremental', autoScrollPasses: 5, autoScrollDelayMs: 500, autoScrollPostLoadWaitMs: 0 },
    });
    const delayWaits = page.waitedMs.filter((ms) => ms === 500);
    assert.ok(delayWaits.length > 0, 'should wait delayMs between wheel events');
  });

  it('does not fire wheel when disabled', async () => {
    const page = createPageDouble();
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: false, autoScrollStrategy: 'incremental', autoScrollPasses: 5 },
    });
    assert.equal(page.mouseWheelCalls.length, 0);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('autoScrollPlugin — edge cases', () => {
  it('unknown strategy falls back to jump', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    const result = await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'invalid', autoScrollPasses: 2, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(result.strategy, 'jump');
    assert.equal(page.mouseWheelCalls.length, 0, 'should not use mouse.wheel for unknown strategy');
  });

  it('delayMs of 0 skips waitForTimeout between steps', async () => {
    const page = createPageDouble({ evaluateResult: 1000 });
    await autoScrollPlugin.hooks.onScroll({
      page,
      settings: { autoScrollEnabled: true, autoScrollStrategy: 'jump', autoScrollPasses: 2, autoScrollDelayMs: 0, autoScrollPostLoadWaitMs: 0 },
    });
    assert.equal(page.waitedMs.length, 0, 'should not wait with delayMs=0 and postLoadWaitMs=0');
  });
});
