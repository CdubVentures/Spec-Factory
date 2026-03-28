import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cssOverridePlugin, FIXED_STICKY_CSS } from '../plugins/cssOverridePlugin.js';

function createPageDouble({ evaluateResult = 0 } = {}) {
  const evaluateCalls = [];
  const styleTags = [];
  const waitedMs = [];
  const routeCalls = [];
  return {
    evaluateCalls,
    styleTags,
    waitedMs,
    routeCalls,
    async evaluate(fn) {
      evaluateCalls.push(fn);
      return typeof evaluateResult === 'function' ? evaluateResult(fn) : evaluateResult;
    },
    async addStyleTag(opts) {
      styleTags.push(opts);
    },
    async waitForTimeout(ms) {
      waitedMs.push(ms);
    },
    async route(pattern, handler) {
      routeCalls.push({ pattern, handler });
    },
  };
}

// ── Plugin shape ────────────────────────────────────────────────────────────

describe('cssOverridePlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(cssOverridePlugin.name, 'cssOverride');
    assert.equal(typeof cssOverridePlugin.hooks.onDismiss, 'function');
    assert.equal(typeof cssOverridePlugin.hooks.onInit, 'function');
  });

  it('returns disabled when cssOverrideEnabled is false', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: false },
    });
    assert.equal(result.enabled, false);
    assert.equal(result.hiddenBefore, 0);
    assert.equal(result.revealedAfter, 0);
    assert.equal(result.fixedRemoved, false);
    assert.equal(result.domainBlockingEnabled, false);
    assert.equal(page.styleTags.length, 0, 'should not inject CSS when disabled');
  });

  it('returns disabled when cssOverrideEnabled is undefined (default off)', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: {},
    });
    assert.equal(result.enabled, false);
    assert.equal(result.fixedRemoved, false);
    assert.equal(result.domainBlockingEnabled, false);
    assert.equal(page.styleTags.length, 0);
  });

  it('injects CSS and counts hidden elements when enabled', async () => {
    const page = createPageDouble({ evaluateResult: 7 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.hiddenBefore, 7);
    assert.equal(result.revealedAfter, 7);
    assert.equal(result.fixedRemoved, false);
    assert.equal(page.styleTags.length, 1, 'should inject one style tag');
    assert.ok(page.styleTags[0].content.includes('display: block !important'));
  });

  it('works with string "true" for cssOverrideEnabled', async () => {
    const page = createPageDouble({ evaluateResult: 3 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: 'true' },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.hiddenBefore, 3);
  });

  it('calls page.evaluate to count hidden elements', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(page.evaluateCalls.length, 1, 'should call evaluate once to count hidden elements');
  });
});

// ── Fixed/sticky removal ────────────────────────────────────────────────────

describe('cssOverridePlugin — fixed/sticky removal', () => {
  it('does not inject fixed CSS when cssOverrideRemoveFixed is false', async () => {
    const page = createPageDouble({ evaluateResult: 2 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideRemoveFixed: false },
    });
    assert.equal(page.styleTags.length, 1, 'only hidden override, not fixed');
    assert.equal(result.fixedRemoved, false);
  });

  it('injects fixed CSS when cssOverrideRemoveFixed is true', async () => {
    const page = createPageDouble({ evaluateResult: 2 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideRemoveFixed: true },
    });
    assert.equal(page.styleTags.length, 2, 'hidden override + fixed CSS');
    assert.ok(page.styleTags[1].content.includes('position: absolute !important'));
    assert.ok(page.styleTags[1].content.includes('visibility: hidden !important'));
    assert.equal(result.fixedRemoved, true);
  });

  it('works with string "true" for cssOverrideRemoveFixed', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideRemoveFixed: 'true' },
    });
    assert.equal(page.styleTags.length, 2);
    assert.equal(result.fixedRemoved, true);
  });

  it('does not inject fixed CSS when main plugin is disabled', async () => {
    const page = createPageDouble();
    await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: false, cssOverrideRemoveFixed: true },
    });
    assert.equal(page.styleTags.length, 0);
  });

  it('FIXED_STICKY_CSS constant contains correct position rules', () => {
    assert.ok(FIXED_STICKY_CSS.includes('position: fixed'), 'must target position: fixed');
    assert.ok(FIXED_STICKY_CSS.includes('position: sticky') || FIXED_STICKY_CSS.includes('position:sticky'), 'must target position: sticky');
    assert.ok(FIXED_STICKY_CSS.includes('visibility: hidden !important'), 'must hide with visibility');
    assert.ok(FIXED_STICKY_CSS.includes('position: absolute !important'), 'must use position: absolute');
  });
});

// ── Domain blocking (onInit) ────────────────────────────────────────

describe('cssOverridePlugin — domain blocking', () => {
  it('returns undefined when cssOverrideEnabled is false', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: false, cssOverrideBlockedDomains: 'intercom.io' },
    });
    assert.equal(result, undefined);
    assert.equal(page.routeCalls.length, 0);
  });

  it('returns undefined when blockedDomains is empty', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: '' },
    });
    assert.equal(result, undefined);
    assert.equal(page.routeCalls.length, 0);
  });

  it('returns undefined when blockedDomains is undefined', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(result, undefined);
    assert.equal(page.routeCalls.length, 0);
  });

  it('sets up page.route when domains are provided', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: 'intercom.io,drift.com' },
    });
    assert.equal(result, undefined);
    assert.equal(page.routeCalls.length, 1);
    assert.equal(page.routeCalls[0].pattern, '**');
  });

  it('route handler aborts matching domain requests', async () => {
    const page = createPageDouble();
    await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: 'intercom.io,drift.com' },
    });
    const handler = page.routeCalls[0].handler;
    let aborted = false;
    let continued = false;
    const mockRoute = {
      abort() { aborted = true; },
      continue() { continued = true; },
    };
    const mockRequest = { url() { return 'https://widget.intercom.io/widget/abc'; } };
    await handler(mockRoute, mockRequest);
    assert.equal(aborted, true, 'should abort matching domain');
    assert.equal(continued, false, 'should not continue matching domain');
  });

  it('route handler continues non-matching requests', async () => {
    const page = createPageDouble();
    await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: 'intercom.io' },
    });
    const handler = page.routeCalls[0].handler;
    let aborted = false;
    let continued = false;
    const mockRoute = {
      abort() { aborted = true; },
      continue() { continued = true; },
    };
    const mockRequest = { url() { return 'https://example.com/page'; } };
    await handler(mockRoute, mockRequest);
    assert.equal(aborted, false, 'should not abort non-matching');
    assert.equal(continued, true, 'should continue non-matching');
  });

  it('trims and lowercases domain entries', async () => {
    const page = createPageDouble();
    await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: ' Intercom.IO , DRIFT.com ' },
    });
    // Should match lowercase domain
    const handler = page.routeCalls[0].handler;
    let aborted = false;
    const mockRoute = { abort() { aborted = true; }, continue() {} };
    const mockRequest = { url() { return 'https://intercom.io/widget'; } };
    await handler(mockRoute, mockRequest);
    assert.equal(aborted, true, 'should match trimmed + lowercased domain');
  });

  it('ignores empty entries from trailing commas', async () => {
    const page = createPageDouble();
    await cssOverridePlugin.hooks.onInit({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: 'intercom.io,,drift.com,' },
    });
    // Should still set up route (non-empty domains exist)
    assert.equal(page.routeCalls.length, 1);
  });
});

// ── domainBlockingEnabled in onDismiss ─────────────────────────────────────

describe('cssOverridePlugin — domainBlockingEnabled reporting', () => {
  it('reports domainBlockingEnabled true when blockedDomains is set', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: 'intercom.io' },
    });
    assert.equal(result.domainBlockingEnabled, true);
  });

  it('reports domainBlockingEnabled false when blockedDomains is empty', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true, cssOverrideBlockedDomains: '' },
    });
    assert.equal(result.domainBlockingEnabled, false);
  });

  it('reports domainBlockingEnabled false when blockedDomains is undefined', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    const result = await cssOverridePlugin.hooks.onDismiss({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(result.domainBlockingEnabled, false);
  });
});

