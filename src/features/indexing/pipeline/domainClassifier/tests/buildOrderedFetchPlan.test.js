import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderedFetchPlan } from '../runDomainClassifier.js';

function makeCandidate(url, overrides = {}) {
  return {
    url,
    original_url: url,
    identity_prelim: null,
    host_trust_class: null,
    doc_kind_guess: null,
    triage_disposition: 'fetch_high',
    approval_bucket: 'approved',
    score: 50,
    search_slot: null,
    search_rank: null,
    ...overrides,
  };
}

function makeDiscoveryResult({ selectedUrls = [], candidates = [] } = {}) {
  return { selectedUrls, candidates, allCandidateUrls: [] };
}

describe('buildOrderedFetchPlan', () => {
  test('merges seeds, learning seeds, and approved URLs into ordered output', () => {
    const candidates = [
      makeCandidate('https://approved.com/page', { search_slot: 'a', search_rank: 1, score: 80 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://approved.com/page'],
        candidates,
      }),
      config: {},
      logger: null,
    });

    const urls = result.orderedSources.map((s) => s.url);
    assert.equal(urls.length, 1);
    assert.equal(urls[0], 'https://approved.com/page');
  });

  test('filters out blocked hosts', () => {
    const candidates = [
      makeCandidate('https://good.com/page'),
      makeCandidate('https://blocked.com/page'),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://good.com/page', 'https://blocked.com/page'],
        candidates,
      }),
      blockedHosts: new Set(['blocked.com']),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 1);
    assert.equal(result.orderedSources[0].url, 'https://good.com/page');
    assert.equal(result.stats.blocked_count, 1);
  });

  test('applies URL cap to approved URLs only (seeds bypass)', () => {
    const candidates = [
      makeCandidate('https://a.com/', { score: 100 }),
      makeCandidate('https://b.com/', { score: 50 }),
      makeCandidate('https://c.com/', { score: 10 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://a.com/', 'https://b.com/', 'https://c.com/'],
        candidates,
      }),
      config: { domainClassifierUrlCap: '2' },
      logger: null,
    });

    const urls = result.orderedSources.map((s) => s.url);
    // 2 approved URLs (highest scores) capped
    assert.equal(urls.length, 2);
    assert.ok(urls.includes('https://a.com/'));
    assert.ok(urls.includes('https://b.com/'));
    assert.ok(!urls.includes('https://c.com/'));
    assert.equal(result.stats.overflow_count, 1);
  });

  test('assigns sequential worker IDs in sort order', () => {
    const candidates = [
      makeCandidate('https://b.com/', { search_slot: 'b', search_rank: 1, score: 50 }),
      makeCandidate('https://a.com/', { search_slot: 'a', search_rank: 1, score: 80 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://b.com/', 'https://a.com/'],
        candidates,
      }),
      config: {},
      logger: null,
    });

    // slot 'a' sorts before slot 'b'
    assert.equal(result.orderedSources[0].url, 'https://a.com/');
    assert.equal(result.orderedSources[0].workerId, 'fetch-1');
    assert.equal(result.orderedSources[1].url, 'https://b.com/');
    assert.equal(result.orderedSources[1].workerId, 'fetch-2');
    assert.equal(result.workerIdMap.get('https://a.com/'), 'fetch-1');
    assert.equal(result.workerIdMap.get('https://b.com/'), 'fetch-2');
  });

  test('emits source_fetch_queued events via logger', () => {
    const events = [];
    const logger = { info: (event, data) => events.push({ event, data }), warn: () => {} };
    const candidates = [makeCandidate('https://example.com/', { score: 50 })];
    buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://example.com/'],
        candidates,
      }),
      config: {},
      logger,
    });

    const queued = events.filter((e) => e.event === 'source_fetch_queued');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].data.worker_id, 'fetch-1');
    assert.equal(queued[0].data.url, 'https://example.com/');
    assert.equal(queued[0].data.state, 'queued');
    assert.equal(queued[0].data.seq, 1);
  });

  test('empty inputs return empty results', () => {
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult(),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 0);
    assert.equal(result.workerIdMap.size, 0);
    assert.equal(result.stats.total_queued, 0);
  });

  test('source rows have correct discoveredFrom tags', () => {
    const candidates = [makeCandidate('https://approved.com/', { score: 50 })];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://approved.com/'],
        candidates,
      }),
      config: {},
      logger: null,
    });

    const byUrl = Object.fromEntries(result.orderedSources.map((s) => [s.url, s]));
    assert.equal(byUrl['https://approved.com/'].discoveredFrom, 'discovery_approved');
  });

  test('stats shape is correct', () => {
    const candidates = [makeCandidate('https://a.com/', { score: 50 })];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://a.com/'],
        candidates,
      }),
      blockedHosts: new Set(['evil.com']),
      config: {},
      logger: null,
    });

    assert.ok('total_queued' in result.stats);
    assert.ok('approved_count' in result.stats);
    assert.ok('overflow_count' in result.stats);
    assert.ok('blocked_count' in result.stats);
    assert.ok(Array.isArray(result.stats.blocked_hosts));
  });

  // --- URL canonicalization + tracking-param dedup (Tier 1, Item 1) ---

  test('dedups multiple srsltid variants of the same page to single entry', () => {
    const url = 'https://www.razer.com/p/deathadder-v3';
    const candidates = [makeCandidate(url, { score: 50 })];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: [
          `${url}?srsltid=AfmBOor1`,
          `${url}?srsltid=AfmBOor2`,
          `${url}?srsltid=AfmBOor3`,
          `${url}?srsltid=AfmBOor4`,
          `${url}?srsltid=AfmBOor5`,
          `${url}?srsltid=AfmBOor6`,
        ],
        candidates,
      }),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 1);
    assert.equal(result.orderedSources[0].url, url); // canonical (tracking stripped)
  });

  test('dedups utm_* variants to single entry', () => {
    const url = 'https://example.com/product';
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: [
          `${url}?utm_source=google&utm_medium=cpc`,
          `${url}?utm_source=bing`,
          `${url}?utm_campaign=spring`,
        ],
        candidates: [makeCandidate(url, { score: 50 })],
      }),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 1);
    assert.equal(result.orderedSources[0].url, url);
  });

  test('fetched URL is canonical form (Option B — strip tracking before fetch)', () => {
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://shop.example.com/p?srsltid=X&id=123&utm_source=g'],
        candidates: [makeCandidate('https://shop.example.com/p?id=123', { score: 50 })],
      }),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 1);
    assert.equal(result.orderedSources[0].url, 'https://shop.example.com/p?id=123');
  });

  test('preserves distinct pages (non-tracking query params kept)', () => {
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: [
          'https://example.com/p?id=1',
          'https://example.com/p?id=2',
          'https://example.com/p?id=1&srsltid=X',
        ],
        candidates: [
          makeCandidate('https://example.com/p?id=1', { score: 50 }),
          makeCandidate('https://example.com/p?id=2', { score: 50 }),
        ],
      }),
      config: {},
      logger: null,
    });

    assert.equal(result.orderedSources.length, 2);
    const urls = result.orderedSources.map((s) => s.url).sort();
    assert.deepEqual(urls, ['https://example.com/p?id=1', 'https://example.com/p?id=2']);
  });

  test('dedup runs before URL cap (cap applies to unique canonical URLs)', () => {
    const url = 'https://example.com/p';
    const candidates = [
      makeCandidate(url, { score: 50 }),
      makeCandidate('https://example.com/q', { score: 50 }),
      makeCandidate('https://example.com/r', { score: 50 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: [
          `${url}?srsltid=1`,
          `${url}?srsltid=2`,
          `${url}?srsltid=3`,
          `${url}?srsltid=4`,
          `${url}?srsltid=5`,
          'https://example.com/q',
          'https://example.com/r',
        ],
        candidates,
      }),
      config: { domainClassifierUrlCap: '2' },
      logger: null,
    });

    // After dedup: 3 unique canonicals (p, q, r); cap=2 keeps 2.
    // Without dedup, srsltid variants of p would score 0 and lose the cap
    // to q/r — so p would NOT appear in output. Dedup-before-cap means p
    // gets counted once as a canonical and can survive the cap.
    assert.equal(result.orderedSources.length, 2);
    const urlList = result.orderedSources.map((s) => s.url);
    assert.ok(
      urlList.includes(url),
      `Canonical p should survive when dedup runs BEFORE cap. Got: ${JSON.stringify(urlList)}`,
    );
    for (const src of result.orderedSources) {
      assert.ok(!src.url.includes('srsltid'), `Should not contain tracking param: ${src.url}`);
    }
  });

  test('emits discovery_dedup_summary telemetry event with counts', () => {
    const events = [];
    const logger = { info: (event, data) => events.push({ event, data }), warn: () => {} };
    const url = 'https://example.com/p';
    buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: [
          `${url}?srsltid=1`,
          `${url}?srsltid=2`,
          `${url}?srsltid=3`,
          'https://example.com/q',
        ],
        candidates: [
          makeCandidate(url, { score: 50 }),
          makeCandidate('https://example.com/q', { score: 50 }),
        ],
      }),
      config: {},
      logger,
    });

    const summary = events.find((e) => e.event === 'discovery_dedup_summary');
    assert.ok(summary, 'discovery_dedup_summary event should be emitted');
    assert.equal(summary.data.input_count, 4);
    assert.equal(summary.data.unique_count, 2);
    assert.equal(summary.data.deduped_count, 2);
  });
});
