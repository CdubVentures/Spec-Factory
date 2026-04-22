import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForPageReady, detectReadinessSignalsInBrowser } from '../pageReadinessGate.js';

// --- Browser-side pure logic tests (simulate DOM shapes via injected globals) ---

function withFakeDom(domShape, fn) {
  const originalDoc = globalThis.document;
  const originalWin = globalThis.window;
  try {
    globalThis.document = domShape.document;
    globalThis.window = domShape.window || { innerWidth: 1280, innerHeight: 900 };
    return fn();
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
  }
}

function makeDoc({
  main = false,
  article = false,
  roleMain = false,
  bodyText = '',
  images = [],
  buttons = [],
} = {}) {
  const allImages = images.map((img) => ({ ...img, complete: true }));
  const allButtons = buttons.map((t) => ({ textContent: t, innerText: t, getAttribute: () => null, offsetWidth: 100, offsetHeight: 40 }));
  return {
    document: {
      querySelector(sel) {
        const parts = sel.split(',').map((s) => s.trim());
        if (parts.includes('main') && main) return { nodeName: 'MAIN' };
        if (parts.includes('article') && article) return { nodeName: 'ARTICLE' };
        if (parts.includes('[role="main"]') && roleMain) return { nodeName: 'DIV' };
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'img') return allImages;
        if (sel.includes('button')) return allButtons;
        return [];
      },
      body: { innerText: bodyText },
      images: allImages,
    },
  };
}

describe('detectReadinessSignalsInBrowser (pure)', () => {
  it('signals.landmark=true when <main> present', () => {
    const signals = withFakeDom(makeDoc({ main: true }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.landmark, true);
  });

  it('signals.landmark=true when <article> present', () => {
    const signals = withFakeDom(makeDoc({ article: true }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.landmark, true);
  });

  it('signals.landmark=true when [role=main] present', () => {
    const signals = withFakeDom(makeDoc({ roleMain: true }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.landmark, true);
  });

  it('signals.landmark=false when no semantic landmark present', () => {
    const signals = withFakeDom(makeDoc(), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.landmark, false);
  });

  it('signals.substantialText=true when body text > 500 chars', () => {
    const bodyText = 'Product details '.repeat(40); // 600+ chars
    const signals = withFakeDom(makeDoc({ bodyText }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.substantialText, true);
  });

  it('signals.substantialText=false when body text <= 500 chars', () => {
    const signals = withFakeDom(makeDoc({ bodyText: 'Short navigation and chrome only' }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.substantialText, false);
  });

  it('signals.commerce=true when body text contains $ price', () => {
    const signals = withFakeDom(makeDoc({ bodyText: 'Price: $49.99 in stock' }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.commerce, true);
  });

  it('signals.commerce=true when body text contains USD amount', () => {
    const signals = withFakeDom(makeDoc({ bodyText: 'Price: 49.99 USD total' }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.commerce, true);
  });

  it('signals.commerce=true when body text contains € price', () => {
    const signals = withFakeDom(makeDoc({ bodyText: 'Prix: €79,99' }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.commerce, true);
  });

  it('signals.commerce=true when "add to cart" button text present', () => {
    const bodyText = 'Navigation only'.repeat(5);
    const signals = withFakeDom(makeDoc({ bodyText, buttons: ['Add to Cart'] }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.commerce, true);
  });

  it('signals.commerce=true when "buy now" present', () => {
    const signals = withFakeDom(makeDoc({ bodyText: 'Buy Now Fast Shipping' }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.commerce, true);
  });

  it('signals.productImage=true when <img> with dimensions > 200x200', () => {
    const signals = withFakeDom(makeDoc({ images: [{ naturalWidth: 800, naturalHeight: 600 }] }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.productImage, true);
  });

  it('signals.productImage=false when all images are tiny (icons)', () => {
    const signals = withFakeDom(
      makeDoc({ images: [{ naturalWidth: 24, naturalHeight: 24 }, { naturalWidth: 100, naturalHeight: 20 }] }),
      () => detectReadinessSignalsInBrowser(),
    );
    assert.equal(signals.productImage, false);
  });

  it('returns ready=true when any signal passes', () => {
    const signals = withFakeDom(makeDoc({ main: true }), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.ready, true);
  });

  it('returns ready=false when all signals fail (truly blank)', () => {
    const signals = withFakeDom(makeDoc(), () => detectReadinessSignalsInBrowser());
    assert.equal(signals.ready, false);
  });
});

// --- waitForPageReady integration (orchestrator) ---

function makeFakePage({ signalsSequence = [], domSignals = null } = {}) {
  let waitForLoadStateCalls = 0;
  let waitForSelectorCalls = [];
  let evalIdx = 0;
  return {
    waitForLoadStateCalls: () => waitForLoadStateCalls,
    waitForSelectorCalls: () => waitForSelectorCalls,
    waitForLoadState: async () => { waitForLoadStateCalls++; },
    waitForSelector: async (sel, opts) => {
      waitForSelectorCalls.push({ sel, opts });
    },
    evaluate: async () => {
      if (signalsSequence.length > 0) {
        return signalsSequence[Math.min(evalIdx++, signalsSequence.length - 1)];
      }
      return domSignals || { ready: true, landmark: true, substantialText: false, commerce: false, productImage: false };
    },
    url: () => 'https://example.com/product',
  };
}

describe('waitForPageReady (orchestrator)', () => {
  it('returns ready=true when first-pass signals pass', async () => {
    const page = makeFakePage({
      domSignals: { ready: true, landmark: true, substantialText: true, commerce: true, productImage: true },
    });
    const result = await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.equal(result.ready, true);
    assert.equal(result.secondChanceUsed, false);
  });

  it('calls waitForLoadState("networkidle") before evaluating signals', async () => {
    const page = makeFakePage({
      domSignals: { ready: true, landmark: true, substantialText: false, commerce: false, productImage: false },
    });
    await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.equal(page.waitForLoadStateCalls(), 1);
  });

  it('uses second-chance wait when first-pass signals fail', async () => {
    const page = makeFakePage({
      signalsSequence: [
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
        { ready: true, landmark: true, substantialText: false, commerce: false, productImage: false },
      ],
    });
    const result = await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.equal(result.ready, true);
    assert.equal(result.secondChanceUsed, true);
    assert.equal(page.waitForSelectorCalls().length, 1);
    assert.match(page.waitForSelectorCalls()[0].sel, /main|article/);
  });

  it('returns ready=false after second chance also fails', async () => {
    const page = makeFakePage({
      signalsSequence: [
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
      ],
    });
    const result = await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.equal(result.ready, false);
    assert.equal(result.secondChanceUsed, true);
  });

  it('reports durationMs as non-negative', async () => {
    const page = makeFakePage({ domSignals: { ready: true, landmark: true, substantialText: false, commerce: false, productImage: false } });
    const result = await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.ok(result.durationMs >= 0);
  });

  it('never throws when page methods throw', async () => {
    const page = {
      waitForLoadState: async () => { throw new Error('timeout'); },
      waitForSelector: async () => { throw new Error('not found'); },
      evaluate: async () => { throw new Error('eval failed'); },
      url: () => 'https://example.com/',
    };
    const result = await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000 });
    assert.equal(result.ready, false);
    assert.equal(typeof result.durationMs, 'number');
  });

  it('emits logger event when second-chance wait is used', async () => {
    const events = [];
    const logger = { info: (name, data) => events.push({ name, data }) };
    const page = makeFakePage({
      signalsSequence: [
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
        { ready: true, landmark: true, substantialText: false, commerce: false, productImage: false },
      ],
    });
    await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000, logger });
    const ev = events.find((e) => e.name === 'page_readiness_second_chance');
    assert.ok(ev);
    assert.equal(ev.data.resolved, true);
  });

  it('emits logger event when still-not-ready after second chance', async () => {
    const events = [];
    const logger = { info: (name, data) => events.push({ name, data }) };
    const page = makeFakePage({
      signalsSequence: [
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
        { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false },
      ],
    });
    await waitForPageReady(page, { timeoutMs: 3000, secondChanceMs: 3000, logger });
    const ev = events.find((e) => e.name === 'page_readiness_failed');
    assert.ok(ev);
  });
});
