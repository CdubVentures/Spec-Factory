import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { domExpansionPlugin } from '../plugins/domExpansionPlugin.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Creates a page double that simulates page.evaluate executing the batched
 * expansion function against a fake DOM. The evaluate function receives
 * { selectors, maxClicks } and returns { found, clicked, expanded, skippedNav, contentDelta }.
 */
function createPageDouble({
  evaluateResult,
  evaluateThrows = false,
  initialUrl = 'https://example.com/product',
} = {}) {
  const evaluateCalls = [];
  const waitedMs = [];

  const defaultResult = { found: 0, clicked: 0, expanded: 0, skippedNav: 0, contentDelta: 0 };

  return {
    evaluateCalls,
    waitedMs,

    url() { return initialUrl; },

    async evaluate(fn, ...args) {
      evaluateCalls.push({ fn: fn.toString(), args });
      if (evaluateThrows) throw new Error('evaluate failed');
      // If a custom result is provided, return it for the batched expansion call
      if (evaluateResult && fn.toString().includes('querySelectorAll')) {
        return evaluateResult;
      }
      // Default: return content length for innerHTML.length calls
      return 5000;
    },

    async waitForTimeout(ms) { waitedMs.push(ms); },
  };
}

function defaultSettings(overrides = {}) {
  return {
    domExpansionEnabled: true,
    domExpansionSelectors: '[aria-expanded="false"],details:not([open]) > summary,.show-more',
    domExpansionMaxClicks: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('domExpansionPlugin', () => {

  describe('contract', () => {
    it('has correct plugin shape', () => {
      assert.equal(domExpansionPlugin.name, 'domExpansion');
      assert.equal(typeof domExpansionPlugin.hooks.onDismiss, 'function');
    });

    it('returns a result object with required fields', async () => {
      const page = createPageDouble({
        evaluateResult: { found: 2, clicked: 2, expanded: 1, skippedNav: 0, contentDelta: 500 },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(typeof result.enabled, 'boolean');
      assert.equal(typeof result.found, 'number');
      assert.equal(typeof result.clicked, 'number');
      assert.equal(typeof result.expanded, 'number');
      assert.equal(typeof result.blocked, 'number');
      assert.equal(typeof result.skippedNav, 'number');
      assert.equal(typeof result.contentDelta, 'number');
      assert.equal(typeof result.settleMs, 'number');
      assert.ok(Array.isArray(result.selectors));
    });

    it('settleMs is always 0 (no waits)', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.settleMs, 0);
      assert.equal(page.waitedMs.length, 0);
    });
  });

  describe('disabled', () => {
    it('returns disabled result when domExpansionEnabled is false', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: { domExpansionEnabled: false },
      });
      assert.equal(result.enabled, false);
      assert.equal(result.found, 0);
      assert.equal(result.clicked, 0);
    });

    it('returns disabled for string "false"', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: { domExpansionEnabled: 'false' },
      });
      assert.equal(result.enabled, false);
    });

    it('does not evaluate when disabled', async () => {
      const page = createPageDouble();
      await domExpansionPlugin.hooks.onDismiss({
        page, settings: { domExpansionEnabled: false },
      });
      assert.equal(page.evaluateCalls.length, 0);
    });
  });

  describe('batched expansion', () => {
    it('passes selectors and maxClicks to evaluate', async () => {
      const page = createPageDouble({
        evaluateResult: { found: 3, clicked: 3, expanded: 1, skippedNav: 0, contentDelta: 200 },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings({ domExpansionMaxClicks: 10 }),
      });
      assert.equal(result.found, 3);
      assert.equal(result.clicked, 3);
      assert.equal(result.expanded, 1);
      assert.equal(result.contentDelta, 200);
    });

    it('reports skippedNav from evaluate result', async () => {
      const page = createPageDouble({
        evaluateResult: { found: 5, clicked: 2, expanded: 1, skippedNav: 3, contentDelta: 100 },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.skippedNav, 3);
    });

    it('returns selectors array in result', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings({ domExpansionSelectors: '[aria-expanded="false"],.show-more' }),
      });
      assert.deepEqual(result.selectors, ['[aria-expanded="false"]', '.show-more']);
    });
  });

  describe('error resilience', () => {
    it('does not crash when page.evaluate throws', async () => {
      const page = createPageDouble({ evaluateThrows: true });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.enabled, true);
      assert.equal(result.found, 0);
      assert.equal(result.clicked, 0);
    });

    it('handles undefined settings gracefully', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({ page });
      assert.equal(typeof result.enabled, 'boolean');
    });

    it('handles empty selectors string', async () => {
      const page = createPageDouble({
        evaluateResult: { found: 0, clicked: 0, expanded: 0, skippedNav: 0, contentDelta: 0 },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings({ domExpansionSelectors: '' }),
      });
      assert.equal(result.enabled, true);
      assert.equal(result.found, 0);
    });
  });

  describe('navigation guard', () => {
    it('reports blocked count from guard', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(typeof result.blocked, 'number');
      assert.equal(result.blocked, 0);
    });

    it('does not use page.route or ctx.route (zero overhead)', async () => {
      const page = createPageDouble();
      await domExpansionPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      // No route calls in evaluate — the guard uses framenavigated events
      const routeCalls = page.evaluateCalls.filter((c) => c.fn.includes('route'));
      assert.equal(routeCalls.length, 0);
    });
  });
});
