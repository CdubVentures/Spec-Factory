/**
 * Tests for triageHardDropFilter — Search Execution phase SERP Triage hard-drop gate.
 *
 * The hard-drop filter is the minimal, deterministic gate that removes
 * only URLs that can never produce useful extraction. Everything else
 * becomes a soft label, not a drop.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyHardDropFilter } from '../triageHardDropFilter.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'spam-site.biz', tierName: 'denied', role: 'denied', tier: 4 },
    ],
    denylist: ['spam-site.biz'],
    ...overrides,
  };
}

function makeResult(url, overrides = {}) {
  return {
    url,
    title: overrides.title || 'Test Page',
    snippet: overrides.snippet || 'Test snippet',
    provider: overrides.provider || 'google',
    query: overrides.query || 'test query',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('triageHardDropFilter — hard-drop criteria', () => {
  it('valid HTTPS URL passes through as survivor', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://razer.com/gaming-mice/viper-v3-pro')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
    assert.equal(survivors[0].url, 'https://razer.com/gaming-mice/viper-v3-pro');
    assert.equal(survivors[0].hard_drop, false);
    assert.equal(survivors[0].hard_drop_reason, null);
  });

  it('HTTP URL is normalized to HTTPS and passes', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('http://razer.com/gaming-mice/viper-v3-pro')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
    assert.ok(survivors[0].url.startsWith('https://'), 'normalized to https');
  });

  it('non-HTTP(S) protocol is hard-dropped', () => {
    const results = [
      makeResult('ftp://files.example.com/spec.pdf'),
      makeResult('file:///local/path'),
      makeResult('data:text/html,<h1>hi</h1>'),
    ];
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: results,
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 3);
    for (const drop of hardDrops) {
      assert.equal(drop.hard_drop_reason, 'invalid_protocol');
    }
  });

  it('denied host is hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://spam-site.biz/razer-viper')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 1);
    assert.equal(hardDrops[0].hard_drop_reason, 'denied_host');
  });

  it('HTTP URL on denied host is hard-dropped (not normalized)', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('http://spam-site.biz/razer-viper')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 1);
    assert.equal(hardDrops[0].hard_drop_reason, 'denied_host');
  });

  it('malformed URL is hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('not-a-url'), makeResult('://broken')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 2);
    for (const drop of hardDrops) {
      assert.equal(drop.hard_drop_reason, 'invalid_url');
    }
  });

  it('login/cart/account/checkout shell pages are hard-dropped', () => {
    const results = [
      makeResult('https://example.com/login'),
      makeResult('https://example.com/account/settings'),
      makeResult('https://example.com/cart'),
      makeResult('https://example.com/checkout/step1'),
    ];
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: results,
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 4);
    for (const drop of hardDrops) {
      assert.equal(drop.hard_drop_reason, 'utility_shell');
    }
  });

  it('search results pages are hard-dropped', () => {
    const results = [
      makeResult('https://example.com/search?q=razer+viper'),
      makeResult('https://example.com/search/results?query=razer'),
    ];
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: results,
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 2);
    for (const drop of hardDrops) {
      assert.equal(drop.hard_drop_reason, 'utility_shell');
    }
  });
});

describe('triageHardDropFilter — must NOT hard-drop (soft labels instead)', () => {
  it('root path / is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://razer.com/')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('/index.html is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://razer.com/index.html')],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('forum subdomain is NOT hard-dropped', () => {
    const config = {
      ...makeCategoryConfig(),
      sourceHosts: [
        ...makeCategoryConfig().sourceHosts,
        { host: 'community.razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      ],
    };
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://community.razer.com/topic/viper-v3-pro')],
      categoryConfig: config,

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('manufacturer brand mismatch is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [makeResult('https://logitech.com/mice/g-pro-x-superlight')],
      categoryConfig: makeCategoryConfig(),

      identityLock: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro' },
    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('sibling model page is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [
        makeResult('https://razer.com/gaming-mice/razer-viper-v3-hyperspeed', {
          title: 'Razer Viper V3 Hyperspeed',
        }),
      ],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('multi-model comparison page is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [
        makeResult('https://example.com/razer-viper-v3-pro-vs-logitech', {
          title: 'Razer Viper V3 Pro vs Logitech G Pro X',
        }),
      ],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });

  it('low-relevance page is NOT hard-dropped', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [
        makeResult('https://example.com/random-gaming-article', {
          title: 'Best Gaming Gear 2025',
          snippet: 'General gaming article',
        }),
      ],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 1);
    assert.equal(hardDrops.length, 0);
  });
});

describe('triageHardDropFilter — edge cases', () => {
  it('empty input returns empty survivors and hardDrops', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: [],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 0);
  });

  it('null/undefined dedupedResults is handled', () => {
    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: null,
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 0);
    assert.equal(hardDrops.length, 0);
  });

  it('survivor preserves original search metadata', () => {
    const result = makeResult('https://razer.com/mice/viper', {
      title: 'Razer Viper V3 Pro',
      snippet: 'Official specs page',
      provider: 'google',
      query: 'razer viper v3 pro specs',
      seen_by_providers: ['google', 'bing'],
      seen_in_queries: ['razer viper v3 pro specs'],
    });

    const { survivors } = applyHardDropFilter({
      dedupedResults: [result],
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors[0].title, 'Razer Viper V3 Pro');
    assert.equal(survivors[0].snippet, 'Official specs page');
    assert.equal(survivors[0].provider, 'google');
  });

  it('mixed valid and invalid URLs produce correct split', () => {
    const results = [
      makeResult('https://razer.com/mice/viper-v3-pro'),
      makeResult('ftp://bad.com/file'),
      makeResult('https://spam-site.biz/spam'),
      makeResult('https://rtings.com/mouse/reviews/razer-viper-v3-pro'),
      makeResult('not-a-url'),
    ];

    const { survivors, hardDrops } = applyHardDropFilter({
      dedupedResults: results,
      categoryConfig: makeCategoryConfig(),

    });

    assert.equal(survivors.length, 2, 'two valid URLs survive');
    assert.equal(hardDrops.length, 3, 'three invalid URLs dropped');
  });
});
