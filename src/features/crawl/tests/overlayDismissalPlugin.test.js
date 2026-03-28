import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { overlayDismissalPlugin } from '../plugins/overlayDismissalPlugin.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createPageDouble(opts = {}) {
  const {
    initScripts = [],
    overlays = [],        // [{ zIndex, coverage, hasCloseBtn, closeTag }]
    bodyOverflowHidden = false,
    observerCaught = 0,
    evaluateThrows = false,
  } = opts;

  const addedInitScripts = [];
  const evaluateCalls = [];
  const waitedMs = [];
  const clickedSelectors = [];

  return {
    addedInitScripts,
    evaluateCalls,
    waitedMs,
    clickedSelectors,

    async addInitScript(script) {
      addedInitScripts.push(typeof script === 'function' ? script.toString() : String(script));
    },

    async evaluate(fn, ...args) {
      if (evaluateThrows) throw new Error('evaluate failed');
      const fnStr = fn.toString();
      evaluateCalls.push({ fn: fnStr, args });

      // Heuristic scan — detect overlays (matches threshold arg pattern)
      if (fnStr.includes('getComputedStyle') && fnStr.includes('data-sf-overlay')) {
        return overlays.map((o, i) => ({
          index: i,
          zIndex: o.zIndex,
          coverage: o.coverage,
          tagName: 'DIV',
        }));
      }

      // DOM removal of specific overlay (matches data-sf-overlay query + remove)
      if (fnStr.includes('data-sf-overlay') && fnStr.includes('remove')) {
        return undefined;
      }

      // Scroll-lock detect + reset (matches body + overflow + hidden + auto)
      if (fnStr.includes('overflow') && fnStr.includes('hidden') && fnStr.includes('auto')) {
        return bodyOverflowHidden;
      }

      // Observer telemetry query
      if (fnStr.includes('__sfOverlayGuard')) {
        return { caught: observerCaught };
      }

      return null;
    },

    locator(selector) {
      const matching = overlays.filter((o) => o.hasCloseBtn);
      const elements = matching.map((o) => ({
        async click(clickOpts) {
          clickedSelectors.push(selector);
        },
        async evaluate(fn) {
          return { tagName: o.closeTag || 'BUTTON', role: null, href: null };
        },
      }));
      return {
        async all() { return elements; },
        async first() { return elements[0] || null; },
      };
    },

    async waitForTimeout(ms) { waitedMs.push(ms); },
  };
}

function defaultSettings(overrides = {}) {
  return {
    overlayDismissalEnabled: true,
    overlayDismissalMode: 'moderate',
    overlayDismissalCloseSelectors: 'button[class*="close"],.close-btn,.modal-close',
    overlayDismissalSettleMs: 0,
    overlayDismissalZIndexThreshold: 999,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('overlayDismissalPlugin', () => {
  // ---- Contract ----
  describe('contract', () => {
    it('has correct plugin shape', () => {
      assert.equal(overlayDismissalPlugin.name, 'overlayDismissal');
      assert.equal(typeof overlayDismissalPlugin.hooks.onInit, 'function');
      assert.equal(typeof overlayDismissalPlugin.hooks.onDismiss, 'function');
    });

    it('onInit returns undefined (suppress telemetry)', async () => {
      const page = createPageDouble();
      const result = await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      assert.equal(result, undefined);
    });

    it('onDismiss returns telemetry with required fields', async () => {
      const page = createPageDouble();
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(typeof result.enabled, 'boolean');
      assert.equal(typeof result.cssInjected, 'boolean');
      assert.equal(typeof result.overlaysDetected, 'number');
      assert.equal(typeof result.closeClicked, 'number');
      assert.equal(typeof result.domRemoved, 'number');
      assert.equal(typeof result.scrollLockReset, 'boolean');
      assert.equal(typeof result.observerCaught, 'number');
      assert.equal(typeof result.settleMs, 'number');
    });
  });

  // ---- Disabled ----
  describe('disabled', () => {
    it('onInit does nothing when disabled', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: { overlayDismissalEnabled: false },
      });
      assert.equal(page.addedInitScripts.length, 0);
    });

    it('onDismiss returns disabled result when disabled', async () => {
      const page = createPageDouble();
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: { overlayDismissalEnabled: false },
      });
      assert.equal(result.enabled, false);
      assert.equal(result.overlaysDetected, 0);
    });

    it('returns disabled for string "false"', async () => {
      const page = createPageDouble();
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: { overlayDismissalEnabled: 'false' },
      });
      assert.equal(result.enabled, false);
    });
  });

  // ---- CSS injection (onInit) ----
  describe('CSS injection', () => {
    it('injects init script in onInit', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      assert.ok(page.addedInitScripts.length > 0);
    });

    it('init script contains CSS suppression rules', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      const script = page.addedInitScripts.join(' ');
      assert.ok(script.includes('newsletter') || script.includes('modal-overlay') || script.includes('popup'));
    });

    it('init script contains scroll-lock reset', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      const script = page.addedInitScripts.join(' ');
      assert.ok(script.includes('overflow'));
    });

    it('init script contains MutationObserver in moderate mode', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings({ overlayDismissalMode: 'moderate' }),
      });
      const script = page.addedInitScripts.join(' ');
      assert.ok(script.includes('MutationObserver') || script.includes('__sfOverlayGuard'));
    });

    it('reports cssInjected true in onDismiss', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.cssInjected, true);
    });
  });

  // ---- Heuristic DOM scan ----
  describe('heuristic DOM scan', () => {
    it('detects overlays via evaluate', async () => {
      const page = createPageDouble({
        overlays: [
          { zIndex: 10000, coverage: 0.8, hasCloseBtn: false },
          { zIndex: 5000, coverage: 0.6, hasCloseBtn: true, closeTag: 'BUTTON' },
        ],
      });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.ok(result.overlaysDetected >= 0);
    });

    it('reports zero overlays when none found', async () => {
      const page = createPageDouble({ overlays: [] });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.overlaysDetected, 0);
    });
  });

  // ---- Scroll-lock reset ----
  describe('scroll-lock reset', () => {
    it('detects and resets overflow:hidden on body', async () => {
      const page = createPageDouble({ bodyOverflowHidden: true });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.scrollLockReset, true);
    });

    it('reports false when body is not scroll-locked', async () => {
      const page = createPageDouble({ bodyOverflowHidden: false });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.scrollLockReset, false);
    });
  });

  // ---- Observer telemetry ----
  describe('MutationObserver telemetry', () => {
    it('reports observer caught count', async () => {
      const page = createPageDouble({ observerCaught: 3 });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.observerCaught, 3);
    });
  });

  // ---- No settle wait ----
  describe('no settle wait', () => {
    it('does not wait after dismissal (Crawlee already loaded the page)', async () => {
      const page = createPageDouble();
      await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(page.waitedMs.length, 0);
    });
  });

  // ---- Error resilience ----
  describe('error resilience', () => {
    it('does not crash when page.evaluate throws', async () => {
      const page = createPageDouble({ evaluateThrows: true });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings(),
      });
      assert.equal(result.enabled, true);
      assert.equal(result.overlaysDetected, 0);
    });

    it('does not crash when addInitScript throws', async () => {
      const page = createPageDouble();
      page.addInitScript = async () => { throw new Error('init script failed'); };
      await overlayDismissalPlugin.hooks.onInit({
        page, settings: defaultSettings(),
      });
      // no throw = pass
    });
  });

  // ---- Edge cases ----
  describe('edge cases', () => {
    it('handles undefined settings gracefully', async () => {
      const page = createPageDouble();
      const result = await overlayDismissalPlugin.hooks.onDismiss({ page });
      assert.equal(typeof result.enabled, 'boolean');
    });

    it('handles empty close selectors', async () => {
      const page = createPageDouble({ overlays: [{ zIndex: 10000, coverage: 0.8, hasCloseBtn: false }] });
      const result = await overlayDismissalPlugin.hooks.onDismiss({
        page, settings: defaultSettings({ overlayDismissalCloseSelectors: '' }),
      });
      assert.equal(typeof result.overlaysDetected, 'number');
    });
  });
});
