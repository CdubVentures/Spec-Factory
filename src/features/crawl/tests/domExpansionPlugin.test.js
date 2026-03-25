import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { domExpansionPlugin } from '../plugins/domExpansionPlugin.js';

function createLocatorDouble(count = 0, { throwOnClick = false } = {}) {
  const clicks = [];
  const elements = Array.from({ length: count }, (_, i) => ({
    async click(opts) {
      if (throwOnClick) throw new Error('not clickable');
      clicks.push({ index: i, opts });
    },
  }));
  return {
    clicks,
    locator(selector) {
      return {
        async all() { return elements; },
      };
    },
  };
}

function createPageDouble({ locatorCounts = {}, throwOnClick = false } = {}) {
  const clicks = [];
  const waitedMs = [];
  return {
    clicks,
    waitedMs,
    locator(selector) {
      const count = locatorCounts[selector] ?? 0;
      const elements = Array.from({ length: count }, (_, i) => ({
        async click(opts) {
          if (throwOnClick) throw new Error('not clickable');
          clicks.push({ selector, index: i, opts });
        },
      }));
      return { async all() { return elements; } };
    },
    async waitForTimeout(ms) { waitedMs.push(ms); },
  };
}

describe('domExpansionPlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(domExpansionPlugin.name, 'domExpansion');
    assert.equal(typeof domExpansionPlugin.hooks.onInteract, 'function');
  });

  it('returns disabled result when domExpansionEnabled is false', async () => {
    const page = createPageDouble();
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: { domExpansionEnabled: false },
    });
    assert.equal(result.enabled, false);
    assert.equal(result.found, 0);
    assert.equal(result.clicked, 0);
  });

  it('returns disabled result when domExpansionEnabled is string "false"', async () => {
    const page = createPageDouble();
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: { domExpansionEnabled: 'false' },
    });
    assert.equal(result.enabled, false);
  });

  it('finds and clicks elements matching selectors', async () => {
    const page = createPageDouble({
      locatorCounts: { '[aria-expanded="false"]': 3, '.show-more': 2 },
    });
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: {
        domExpansionEnabled: true,
        domExpansionSelectors: '[aria-expanded="false"],.show-more',
        domExpansionMaxClicks: 50,
        domExpansionSettleMs: 0,
      },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.found, 5);
    assert.equal(result.clicked, 5);
    assert.equal(page.clicks.length, 5);
  });

  it('respects maxClicks cap', async () => {
    const page = createPageDouble({
      locatorCounts: { '.expand-btn': 10 },
    });
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: {
        domExpansionEnabled: true,
        domExpansionSelectors: '.expand-btn',
        domExpansionMaxClicks: 3,
        domExpansionSettleMs: 0,
      },
    });
    assert.equal(result.found, 10);
    assert.equal(result.clicked, 3);
    assert.equal(page.clicks.length, 3);
  });

  it('waits settleMs after clicking', async () => {
    const page = createPageDouble({
      locatorCounts: { '.expand-btn': 1 },
    });
    await domExpansionPlugin.hooks.onInteract({
      page,
      settings: {
        domExpansionEnabled: true,
        domExpansionSelectors: '.expand-btn',
        domExpansionMaxClicks: 50,
        domExpansionSettleMs: 2000,
      },
    });
    assert.deepEqual(page.waitedMs, [2000]);
  });

  it('skips elements that throw on click without crashing', async () => {
    const page = createPageDouble({
      locatorCounts: { '.expand-btn': 3 },
      throwOnClick: true,
    });
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: {
        domExpansionEnabled: true,
        domExpansionSelectors: '.expand-btn',
        domExpansionMaxClicks: 50,
        domExpansionSettleMs: 0,
      },
    });
    assert.equal(result.found, 3);
    assert.equal(result.clicked, 0);
  });

  it('returns selectors array in result', async () => {
    const page = createPageDouble();
    const result = await domExpansionPlugin.hooks.onInteract({
      page,
      settings: {
        domExpansionEnabled: true,
        domExpansionSelectors: '[aria-expanded="false"],.show-more',
        domExpansionMaxClicks: 50,
        domExpansionSettleMs: 0,
      },
    });
    assert.deepEqual(result.selectors, ['[aria-expanded="false"]', '.show-more']);
  });
});
