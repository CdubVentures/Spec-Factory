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
      seedUrls: ['https://seed.com/robots.txt'],
      learningSeedUrls: ['https://learn.com/review'],
      config: {},
      logger: null,
    });

    const urls = result.orderedSources.map((s) => s.url);
    assert.equal(urls.length, 3);
    // Approved URL has slot 'a' → sorts first; seeds without slots sort last
    assert.equal(urls[0], 'https://approved.com/page');
    assert.ok(urls.includes('https://seed.com/robots.txt'));
    assert.ok(urls.includes('https://learn.com/review'));
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
      makeCandidate('https://a.com', { score: 100 }),
      makeCandidate('https://b.com', { score: 50 }),
      makeCandidate('https://c.com', { score: 10 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://a.com', 'https://b.com', 'https://c.com'],
        candidates,
      }),
      seedUrls: ['https://seed.com/robots.txt'],
      config: { domainClassifierUrlCap: '2' },
      logger: null,
    });

    const urls = result.orderedSources.map((s) => s.url);
    // 2 approved URLs (highest scores) + 1 seed = 3 total
    assert.equal(urls.length, 3);
    assert.ok(urls.includes('https://a.com'));
    assert.ok(urls.includes('https://b.com'));
    assert.ok(!urls.includes('https://c.com'));
    assert.ok(urls.includes('https://seed.com/robots.txt'));
    assert.equal(result.stats.overflow_count, 1);
  });

  test('assigns sequential worker IDs in sort order', () => {
    const candidates = [
      makeCandidate('https://b.com', { search_slot: 'b', search_rank: 1, score: 50 }),
      makeCandidate('https://a.com', { search_slot: 'a', search_rank: 1, score: 80 }),
    ];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://b.com', 'https://a.com'],
        candidates,
      }),
      config: {},
      logger: null,
    });

    // slot 'a' sorts before slot 'b'
    assert.equal(result.orderedSources[0].url, 'https://a.com');
    assert.equal(result.orderedSources[0].workerId, 'fetch-1');
    assert.equal(result.orderedSources[1].url, 'https://b.com');
    assert.equal(result.orderedSources[1].workerId, 'fetch-2');
    assert.equal(result.workerIdMap.get('https://a.com'), 'fetch-1');
    assert.equal(result.workerIdMap.get('https://b.com'), 'fetch-2');
  });

  test('emits source_fetch_queued events via logger', () => {
    const events = [];
    const logger = { info: (event, data) => events.push({ event, data }), warn: () => {} };
    const candidates = [makeCandidate('https://example.com', { score: 50 })];
    buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://example.com'],
        candidates,
      }),
      config: {},
      logger,
    });

    const queued = events.filter((e) => e.event === 'source_fetch_queued');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].data.worker_id, 'fetch-1');
    assert.equal(queued[0].data.url, 'https://example.com');
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
    const candidates = [makeCandidate('https://approved.com', { score: 50 })];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://approved.com'],
        candidates,
      }),
      seedUrls: ['https://seed.com'],
      learningSeedUrls: ['https://learn.com'],
      config: {},
      logger: null,
    });

    const byUrl = Object.fromEntries(result.orderedSources.map((s) => [s.url, s]));
    assert.equal(byUrl['https://seed.com'].discoveredFrom, 'seed');
    assert.equal(byUrl['https://learn.com'].discoveredFrom, 'learning_seed');
    assert.equal(byUrl['https://approved.com'].discoveredFrom, 'discovery_approved');
  });

  test('stats shape is correct', () => {
    const candidates = [makeCandidate('https://a.com', { score: 50 })];
    const result = buildOrderedFetchPlan({
      discoveryResult: makeDiscoveryResult({
        selectedUrls: ['https://a.com'],
        candidates,
      }),
      seedUrls: ['https://seed.com'],
      blockedHosts: new Set(['evil.com']),
      config: {},
      logger: null,
    });

    assert.ok('total_queued' in result.stats);
    assert.ok('approved_count' in result.stats);
    assert.ok('seed_count' in result.stats);
    assert.ok('learning_seed_count' in result.stats);
    assert.ok('overflow_count' in result.stats);
    assert.ok('blocked_count' in result.stats);
    assert.ok(Array.isArray(result.stats.blocked_hosts));
  });
});
