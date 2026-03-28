import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCookieConsentPlugin, cookieConsentPlugin } from '../plugins/cookieConsentPlugin.js';

// ── Test doubles ─────────────────────────────────────────────────────────────

function createPageDouble() {
  const calls = [];
  return {
    calls,
    locator(selector) {
      return {
        async all() {
          const count = calls.filter((c) => c.type === 'locator' && c.selector === selector).length;
          if (count > 0) return [];
          calls.push({ type: 'locator', selector });
          // Return fake elements that can be clicked
          return [
            { async click() { calls.push({ type: 'click', selector }); } },
            { async click() { calls.push({ type: 'click', selector }); } },
          ];
        },
      };
    },
    async waitForTimeout(ms) {
      calls.push({ type: 'waitForTimeout', ms });
    },
  };
}

function createConsentHandlerDouble({ handled = false, cmp, success } = {}) {
  const invocations = [];
  async function handler(page, options) {
    invocations.push({ page, options });
    return { handled, cmp, success, messages: [] };
  }
  handler.invocations = invocations;
  return handler;
}

function createThrowingConsentHandler(errorMessage = 'autoconsent failed') {
  const invocations = [];
  async function handler(page, options) {
    invocations.push({ page, options });
    throw new Error(errorMessage);
  }
  handler.invocations = invocations;
  return handler;
}

// ── Contract ─────────────────────────────────────────────────────────────────

describe('cookieConsentPlugin — contract', () => {
  it('default export has correct name', () => {
    assert.equal(cookieConsentPlugin.name, 'cookieConsent');
  });

  it('has onDismiss hook', () => {
    assert.equal(typeof cookieConsentPlugin.hooks.onDismiss, 'function');
  });

  it('factory creates plugin with correct name', () => {
    const plugin = createCookieConsentPlugin();
    assert.equal(plugin.name, 'cookieConsent');
  });
});

// ── Settings gate ────────────────────────────────────────────────────────────

describe('cookieConsentPlugin — settings gate', () => {
  it('returns enabled:false when cookieConsentEnabled is false', async () => {
    const handler = createConsentHandlerDouble();
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: false },
    });

    assert.equal(result.enabled, false);
    assert.equal(handler.invocations.length, 0);
    assert.equal(page.calls.length, 0);
  });

  it('returns enabled:false when cookieConsentEnabled is string "false"', async () => {
    const handler = createConsentHandlerDouble();
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: 'false' },
    });

    assert.equal(result.enabled, false);
    assert.equal(handler.invocations.length, 0);
  });

  it('treats undefined cookieConsentEnabled as enabled (default true)', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {},
    });

    assert.equal(result.enabled, true);
  });
});

// ── Autoconsent happy path ───────────────────────────────────────────────────

describe('cookieConsentPlugin — autoconsent', () => {
  it('calls consent handler when enabled', async () => {
    const handler = createConsentHandlerDouble({ handled: true, cmp: 'onetrust', success: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(handler.invocations.length, 1);
    assert.equal(handler.invocations[0].page, page);
  });

  it('returns autoconsentMatched:true when CMP detected', async () => {
    const handler = createConsentHandlerDouble({ handled: true, cmp: 'cookiebot', success: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(result.autoconsentMatched, true);
    assert.equal(result.enabled, true);
  });

  it('passes optIn action and configured timeout', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: true, cookieConsentTimeoutMs: 8000 },
    });

    assert.equal(handler.invocations[0].options.action, 'optIn');
    assert.equal(handler.invocations[0].options.timeout, 8000);
  });

  it('uses default timeout of 5000ms when not configured', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(handler.invocations[0].options.timeout, 5000);
  });

  it('skips fallback selectors when autoconsent matched', async () => {
    const handler = createConsentHandlerDouble({ handled: true, cmp: 'onetrust' });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(result.autoconsentMatched, true);
    assert.equal(result.fallbackClicked, 0);
  });
});

// ── Fallback selectors ───────────────────────────────────────────────────────

describe('cookieConsentPlugin — fallback selectors', () => {
  it('uses fallback selectors when autoconsent finds no CMP', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.accept-btn,.dismiss-btn',
      },
    });

    assert.equal(result.autoconsentMatched, false);
    assert.ok(result.fallbackClicked >= 0);
  });

  it('counts fallback clicks', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.accept-btn',
      },
    });

    assert.equal(result.autoconsentMatched, false);
    assert.ok(typeof result.fallbackClicked === 'number');
    assert.ok(result.fallbackClicked > 0);
  });

  it('uses custom fallback selectors from settings', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '#my-custom-btn,.other-btn',
      },
    });

    const locatorCalls = page.calls.filter((c) => c.type === 'locator');
    const selectors = locatorCalls.map((c) => c.selector);
    assert.ok(selectors.includes('#my-custom-btn'));
    assert.ok(selectors.includes('.other-btn'));
  });
});

// ── Settle wait ──────────────────────────────────────────────────────────────

describe('cookieConsentPlugin — settle wait', () => {
  it('waits configured settleMs after dismissal', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: true, cookieConsentSettleMs: 2000 },
    });

    const waitCalls = page.calls.filter((c) => c.type === 'waitForTimeout');
    assert.ok(waitCalls.some((c) => c.ms === 2000));
    assert.equal(result.settleMs, 2000);
  });

  it('uses default 1000ms settle when not configured', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: true },
    });

    assert.equal(result.settleMs, 1000);
  });

  it('skips settle wait when settleMs is 0', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: true, cookieConsentSettleMs: 0 },
    });

    const waitCalls = page.calls.filter((c) => c.type === 'waitForTimeout');
    assert.equal(waitCalls.length, 0);
  });
});

// ── Error resilience ─────────────────────────────────────────────────────────

describe('cookieConsentPlugin — error resilience', () => {
  it('catches autoconsent errors and tries fallback', async () => {
    const handler = createThrowingConsentHandler('CMP detection crashed');
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.fallback-btn',
      },
    });

    assert.equal(result.enabled, true);
    assert.equal(result.autoconsentMatched, false);
    assert.ok(typeof result.fallbackClicked === 'number');
  });

  it('catches fallback click errors gracefully', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });

    // Page double with elements that throw on click
    const page = {
      calls: [],
      locator() {
        return {
          async all() {
            return [
              { async click() { throw new Error('element detached'); } },
            ];
          },
        };
      },
      async waitForTimeout(ms) { page.calls.push({ type: 'waitForTimeout', ms }); },
    };

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.broken-btn',
      },
    });

    assert.equal(result.enabled, true);
    // Should not throw, just return gracefully
  });
});

// ── Edge: no banner ──────────────────────────────────────────────────────────

describe('cookieConsentPlugin — no banner', () => {
  it('returns zero interaction when no banner found anywhere', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });

    // Page double where locator returns empty arrays
    const page = {
      calls: [],
      locator() {
        return { async all() { return []; } };
      },
      async waitForTimeout(ms) { page.calls.push({ type: 'waitForTimeout', ms }); },
    };

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.accept-btn',
      },
    });

    assert.equal(result.enabled, true);
    assert.equal(result.autoconsentMatched, false);
    assert.equal(result.fallbackClicked, 0);
  });
});
