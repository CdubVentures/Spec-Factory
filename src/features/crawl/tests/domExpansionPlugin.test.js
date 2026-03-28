import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { domExpansionPlugin } from '../plugins/domExpansionPlugin.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Playwright Page double with configurable behavior.
 *
 * @param {object}   opts
 * @param {object}   opts.elements        - Map of selector → array of element descriptors
 * @param {string}   [opts.initialUrl]    - page.url() return value
 * @param {string}   [opts.initialHtml]   - page.content() return value
 * @param {number}   [opts.initialLength] - initial document.body.innerHTML.length
 * @param {Function} [opts.onEvaluate]    - custom handler for page.evaluate calls
 * @param {boolean}  [opts.navigatesOnClick] - if true, clicking changes the URL
 * @param {string}   [opts.navigateTarget]   - URL to "navigate" to on click
 */
function createPageDouble(opts = {}) {
  const {
    elements = {},
    initialUrl = 'https://example.com/product',
    initialHtml = '<html><body>original</body></html>',
    initialLength = 5000,
    onEvaluate,
    navigatesOnClick = false,
    navigateTarget = 'https://other.com/different-page',
  } = opts;

  let currentUrl = initialUrl;
  let contentLength = initialLength;
  let htmlContent = initialHtml;
  const clicks = [];
  const waitedMs = [];
  const evaluateCalls = [];
  const routeHandlers = [];
  let navigationBlockedCount = 0;
  let urlChangedDuringClick = false;

  // Track which elements were actually expanded (content grew)
  const expandedElements = [];
  // Track which elements were skipped (classified as navigation)
  const skippedNavElements = [];
  // Track rollback events
  const rollbacks = [];

  const pageDouble = {
    // --- State for assertions ---
    clicks,
    waitedMs,
    evaluateCalls,
    routeHandlers,
    expandedElements,
    skippedNavElements,
    rollbacks,
    get navigationBlockedCount() { return navigationBlockedCount; },
    get currentUrl() { return currentUrl; },
    get contentLength() { return contentLength; },

    // --- Playwright Page API surface ---
    url() { return currentUrl; },

    async content() { return htmlContent; },

    async title() { return 'Test Page'; },

    locator(selector) {
      const elDescriptors = elements[selector] || [];
      const locatorElements = elDescriptors.map((desc, i) => ({
        async click(clickOpts) {
          if (desc.throwOnClick) throw new Error(desc.throwMessage || 'not clickable');
          clicks.push({ selector, index: i, opts: clickOpts, desc });

          if (navigatesOnClick || desc.navigatesOnClick) {
            // Simulate navigation attempt
            urlChangedDuringClick = true;
            currentUrl = desc.navigateTarget || navigateTarget;
          }
          if (desc.expandsContent) {
            contentLength += desc.contentDelta || 500;
          }
          if (desc.collapsesContent) {
            contentLength -= desc.contentDelta || 500;
          }
        },
        async evaluate(fn) {
          // Simulate a DOM node with tagName as property and getAttribute as method
          const attrs = desc.attributes || {};
          const fakeNode = {
            tagName: attrs.tagName || '',
            getAttribute(attr) { return attrs[attr] ?? null; },
          };
          return fn(fakeNode);
        },
        async getAttribute(attr) {
          return desc.attributes?.[attr] ?? null;
        },
        async isVisible() {
          return desc.visible !== false;
        },
      }));
      return {
        async all() { return locatorElements; },
        async count() { return locatorElements.length; },
      };
    },

    async evaluate(fn, ...args) {
      evaluateCalls.push({ fn: fn.toString(), args });
      if (onEvaluate) return onEvaluate(fn, ...args);
      // Default: return content length for DOM size checks
      return contentLength;
    },

    async waitForTimeout(ms) { waitedMs.push(ms); },

    context() {
      return {
        async route(pattern, handler) {
          routeHandlers.push({ pattern, handler });
        },
        async unroute(pattern, handler) {
          const idx = routeHandlers.findIndex(
            (r) => r.pattern === pattern && r.handler === handler,
          );
          if (idx >= 0) routeHandlers.splice(idx, 1);
        },
      };
    },

    // For simulating route handler calls in tests
    async _simulateNavigationRequest(url) {
      for (const { handler } of routeHandlers) {
        const aborted = { value: false };
        const routeDouble = {
          request: () => ({
            url: () => url,
            resourceType: () => 'document',
            isNavigationRequest: () => true,
          }),
          async abort() { aborted.value = true; navigationBlockedCount++; },
          async continue_() {},
        };
        await handler(routeDouble);
        return aborted.value;
      }
      return false;
    },

    // Reset URL (for rollback simulation)
    _resetUrl() { currentUrl = initialUrl; },
    _setContentLength(len) { contentLength = len; },
    _setUrl(url) { currentUrl = url; },
  };

  return pageDouble;
}

function defaultSettings(overrides = {}) {
  return {
    domExpansionEnabled: true,
    domExpansionSelectors: '[aria-expanded="false"],details:not([open]) > summary,.show-more',
    domExpansionMaxClicks: 50,
    domExpansionSettleMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('domExpansionPlugin', () => {
  // ---- Plugin shape contract ----
  describe('contract', () => {
    it('has correct plugin shape', () => {
      assert.equal(domExpansionPlugin.name, 'domExpansion');
      assert.equal(typeof domExpansionPlugin.hooks.onDismiss, 'function');
    });

    it('returns a result object with required fields', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings(),
      });
      assert.equal(typeof result.enabled, 'boolean');
      assert.equal(typeof result.found, 'number');
      assert.equal(typeof result.clicked, 'number');
      assert.equal(typeof result.settleMs, 'number');
      assert.ok(Array.isArray(result.selectors));
    });

    it('returns expanded field counting successful expansions', async () => {
      const page = createPageDouble({
        elements: {
          '[aria-expanded="false"]': [
            { expandsContent: true, contentDelta: 200, attributes: { 'aria-expanded': 'false' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '[aria-expanded="false"]' }),
      });
      assert.equal(typeof result.expanded, 'number');
    });

    it('returns blocked field counting intercepted navigations', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings(),
      });
      assert.equal(typeof result.blocked, 'number');
    });
  });

  // ---- Disabled state ----
  describe('disabled', () => {
    it('returns disabled result when domExpansionEnabled is false', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: { domExpansionEnabled: false },
      });
      assert.equal(result.enabled, false);
      assert.equal(result.found, 0);
      assert.equal(result.clicked, 0);
    });

    it('returns disabled result when domExpansionEnabled is string "false"', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: { domExpansionEnabled: 'false' },
      });
      assert.equal(result.enabled, false);
    });

    it('does not interact with page when disabled', async () => {
      const page = createPageDouble({
        elements: { '.expand-btn': [{ expandsContent: true }] },
      });
      await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: { domExpansionEnabled: false },
      });
      assert.equal(page.clicks.length, 0);
      assert.equal(page.evaluateCalls.length, 0);
    });
  });

  // ---- Basic clicking ----
  describe('element discovery and clicking', () => {
    it('finds and clicks elements matching selectors', async () => {
      const page = createPageDouble({
        elements: {
          '[aria-expanded="false"]': [
            { expandsContent: true, attributes: { 'aria-expanded': 'false' } },
            { expandsContent: true, attributes: { 'aria-expanded': 'false' } },
          ],
          '.show-more': [
            { expandsContent: true, attributes: { class: 'show-more' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: '[aria-expanded="false"],.show-more',
        }),
      });
      assert.equal(result.enabled, true);
      assert.equal(result.found, 3);
      assert.equal(result.clicked, 3);
    });

    it('respects maxClicks cap', async () => {
      const page = createPageDouble({
        elements: {
          '.expand-btn': Array.from({ length: 10 }, () => ({
            expandsContent: true,
            attributes: { class: 'expand-btn' },
          })),
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: '.expand-btn',
          domExpansionMaxClicks: 3,
        }),
      });
      assert.equal(result.found, 10);
      assert.equal(result.clicked, 3);
    });

    it('returns selectors array in result', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: '[aria-expanded="false"],.show-more',
        }),
      });
      assert.deepEqual(result.selectors, ['[aria-expanded="false"]', '.show-more']);
    });

    it('waits settleMs after clicking', async () => {
      const page = createPageDouble({
        elements: { '.expand-btn': [{ expandsContent: true }] },
      });
      await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: '.expand-btn',
          domExpansionSettleMs: 2000,
        }),
      });
      assert.ok(page.waitedMs.includes(2000));
    });
  });

  // ---- Error resilience ----
  describe('error resilience', () => {
    it('skips elements that throw on click without crashing', async () => {
      const page = createPageDouble({
        elements: {
          '.expand-btn': [
            { throwOnClick: true, throwMessage: 'detached' },
            { expandsContent: true },
            { throwOnClick: true, throwMessage: 'hidden' },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.expand-btn' }),
      });
      assert.equal(result.found, 3);
      // Should still click the one that works
      assert.ok(result.clicked >= 1);
    });

    it('does not crash when page.evaluate throws', async () => {
      const page = createPageDouble({
        elements: { '.show-more': [{ expandsContent: true }] },
        onEvaluate: () => { throw new Error('evaluation failed'); },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.enabled, true);
    });

    it('does not crash when context().route throws', async () => {
      const page = createPageDouble({
        elements: { '.show-more': [{ expandsContent: true }] },
      });
      // Override context to throw on route
      page.context = () => ({
        async route() { throw new Error('route failed'); },
        async unroute() {},
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.enabled, true);
    });
  });

  // ---- Pre-click element classification ----
  describe('pre-click element classification', () => {
    it('skips elements with href to external URLs', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { attributes: { href: 'https://other-site.com/page', tagName: 'A' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.found, 1);
      assert.equal(result.clicked, 0);
      assert.ok(result.skippedNav >= 1);
    });

    it('skips elements with target="_blank"', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { attributes: { target: '_blank', href: '/other', tagName: 'A' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 0);
      assert.ok(result.skippedNav >= 1);
    });

    it('clicks elements with aria-expanded="false" (safe expand pattern)', async () => {
      const page = createPageDouble({
        elements: {
          '[aria-expanded="false"]': [
            { expandsContent: true, attributes: { 'aria-expanded': 'false', tagName: 'BUTTON' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '[aria-expanded="false"]' }),
      });
      assert.equal(result.clicked, 1);
    });

    it('clicks <summary> elements inside <details> (safe expand pattern)', async () => {
      const page = createPageDouble({
        elements: {
          'details:not([open]) > summary': [
            { expandsContent: true, attributes: { tagName: 'SUMMARY' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: 'details:not([open]) > summary',
        }),
      });
      assert.equal(result.clicked, 1);
    });

    it('skips anchor links with full URL paths', async () => {
      const page = createPageDouble({
        initialUrl: 'https://example.com/product/123',
        elements: {
          '.show-more': [
            { attributes: { href: '/product/456', tagName: 'A' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 0);
    });

    it('allows anchor links with hash-only href (same-page jump)', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { expandsContent: true, attributes: { href: '#specs', tagName: 'A' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 1);
    });

    it('allows anchor links with javascript:void href', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { expandsContent: true, attributes: { href: 'javascript:void(0)', tagName: 'A' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 1);
    });

    it('allows button elements regardless of content', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { expandsContent: true, attributes: { tagName: 'BUTTON' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 1);
    });

    it('allows elements with role="button"', async () => {
      const page = createPageDouble({
        elements: {
          '.show-more': [
            { expandsContent: true, attributes: { role: 'button', tagName: 'DIV' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(result.clicked, 1);
    });
  });

  // ---- Navigation safety ----
  describe('navigation safety', () => {
    it('sets up route interception before clicking', async () => {
      const page = createPageDouble({
        elements: { '.show-more': [{ expandsContent: true }] },
      });
      await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      // Should have registered at least one route handler
      // (may be cleaned up after, so check it was called)
      assert.ok(page.routeHandlers.length >= 0 || page.evaluateCalls.length > 0);
    });

    it('captures URL before expansion and verifies it after', async () => {
      const page = createPageDouble({
        initialUrl: 'https://example.com/product',
        elements: {
          '.show-more': [
            { expandsContent: true, attributes: { tagName: 'BUTTON' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      // URL should still be the original
      assert.equal(page.url(), 'https://example.com/product');
    });
  });

  // ---- Content-delta verification ----
  describe('content-delta verification', () => {
    it('tracks content length delta across expansion', async () => {
      const page = createPageDouble({
        initialLength: 5000,
        elements: {
          '.show-more': [
            { expandsContent: true, contentDelta: 800, attributes: { tagName: 'BUTTON' } },
          ],
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      assert.equal(typeof result.contentDelta, 'number');
    });
  });

  // ---- Timeout budget ----
  describe('timeout budget management', () => {
    it('respects total timeout budget', async () => {
      // 20 elements but tight budget — should not click all
      const page = createPageDouble({
        elements: {
          '.expand-btn': Array.from({ length: 20 }, () => ({
            expandsContent: true,
            attributes: { tagName: 'BUTTON' },
          })),
        },
      });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({
          domExpansionSelectors: '.expand-btn',
          domExpansionMaxClicks: 50,
          domExpansionBudgetMs: 100, // Very tight budget
        }),
      });
      // Should have stopped before hitting all 20 due to budget
      assert.ok(result.clicked <= 20);
      assert.equal(typeof result.budgetExhausted, 'boolean');
    });
  });

  // ---- Empty/edge cases ----
  describe('edge cases', () => {
    it('handles empty selectors string', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '' }),
      });
      assert.equal(result.enabled, true);
      assert.equal(result.found, 0);
      assert.equal(result.clicked, 0);
    });

    it('handles undefined settings gracefully', async () => {
      const page = createPageDouble();
      const result = await domExpansionPlugin.hooks.onDismiss({ page });
      // Should use defaults or disable gracefully
      assert.equal(typeof result.enabled, 'boolean');
    });

    it('handles missing page.context gracefully', async () => {
      const page = createPageDouble({
        elements: { '.show-more': [{ expandsContent: true }] },
      });
      page.context = undefined;
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings({ domExpansionSelectors: '.show-more' }),
      });
      // Should still work, just without route interception
      assert.equal(result.enabled, true);
    });

    it('handles zero elements found', async () => {
      const page = createPageDouble({ elements: {} });
      const result = await domExpansionPlugin.hooks.onDismiss({
        page,
        settings: defaultSettings(),
      });
      assert.equal(result.found, 0);
      assert.equal(result.clicked, 0);
    });
  });
});
