import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCookieConsentPlugin, cookieConsentPlugin } from '../plugins/cookieConsentPlugin.js';

// ── Test doubles ─────────────────────────────────────────────────────────────

// WHY: Plugin now uses page.evaluate() for fallback selectors instead of
// per-selector page.locator().all() + el.click() round-trips. The page double
// must support evaluate with a selector string argument.
function createPageDouble({ evaluateResult = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async evaluate(fn, ...args) {
      calls.push({ type: 'evaluate', args });
      return evaluateResult;
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

  it('uses default timeout of 200ms when not configured', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(handler.invocations[0].options.timeout, 200);
  });

  it('skips fallback selectors when autoconsent matched', async () => {
    const handler = createConsentHandlerDouble({ handled: true, cmp: 'onetrust' });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({ page, settings: { cookieConsentEnabled: true } });

    assert.equal(result.autoconsentMatched, true);
    assert.equal(result.fallbackClicked, 0);
    assert.equal(page.calls.filter((c) => c.type === 'evaluate').length, 0, 'no evaluate when autoconsent matched');
  });
});

// ── Fallback selectors ───────────────────────────────────────────────────────

describe('cookieConsentPlugin — fallback selectors', () => {
  it('uses page.evaluate for fallback when autoconsent misses', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble({ evaluateResult: 3 });

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.accept-btn,.dismiss-btn',
      },
    });

    assert.equal(result.autoconsentMatched, false);
    const evalCalls = page.calls.filter((c) => c.type === 'evaluate');
    assert.equal(evalCalls.length, 1, 'exactly one evaluate call for fallback');
  });

  it('counts fallback clicks from evaluate result', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble({ evaluateResult: 5 });

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.accept-btn',
      },
    });

    assert.equal(result.autoconsentMatched, false);
    assert.equal(result.fallbackClicked, 5);
  });

  it('passes selector string to evaluate', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble({ evaluateResult: 0 });

    await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '#my-custom-btn,.other-btn',
      },
    });

    const evalCalls = page.calls.filter((c) => c.type === 'evaluate');
    assert.equal(evalCalls.length, 1);
    assert.equal(evalCalls[0].args[0], '#my-custom-btn,.other-btn');
  });
});

// ── No settle wait ───────────────────────────────────────────────────────────

describe('cookieConsentPlugin — no settle wait', () => {
  it('does not wait after dismissal (Crawlee already loaded the page)', async () => {
    const handler = createConsentHandlerDouble({ handled: true });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble();

    const result = await plugin.hooks.onDismiss({
      page,
      settings: { cookieConsentEnabled: true },
    });

    const waitCalls = page.calls.filter((c) => c.type === 'waitForTimeout');
    assert.equal(waitCalls.length, 0);
    assert.equal(result.settleMs, 0);
  });
});

// ── Error resilience ─────────────────────────────────────────────────────────

describe('cookieConsentPlugin — error resilience', () => {
  it('catches autoconsent errors and tries fallback via evaluate', async () => {
    const handler = createThrowingConsentHandler('CMP detection crashed');
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble({ evaluateResult: 2 });

    const result = await plugin.hooks.onDismiss({
      page,
      settings: {
        cookieConsentEnabled: true,
        cookieConsentFallbackSelectors: '.fallback-btn',
      },
    });

    assert.equal(result.enabled, true);
    assert.equal(result.autoconsentMatched, false);
    assert.equal(result.fallbackClicked, 2);
  });

  it('catches evaluate errors gracefully', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });

    const page = {
      calls: [],
      async evaluate() { throw new Error('evaluate failed'); },
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
    assert.equal(result.fallbackClicked, 0);
  });
});

// ── Edge: no banner ──────────────────────────────────────────────────────────

describe('cookieConsentPlugin — no banner', () => {
  it('returns zero interaction when no banner found anywhere', async () => {
    const handler = createConsentHandlerDouble({ handled: false });
    const plugin = createCookieConsentPlugin({ _consentHandler: handler });
    const page = createPageDouble({ evaluateResult: 0 });

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
