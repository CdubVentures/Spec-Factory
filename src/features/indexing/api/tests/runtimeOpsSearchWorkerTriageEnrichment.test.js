import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Inline the minimal builder logic needed to test triage enrichment.
// The real builder is in src/features/indexing/api/builders/runtimeOpsDataBuilders.js
// but importing it requires the full server stack. We test the enrichment contract here.

function buildTriageLookup(events, eventType, payloadOf) {
  const triageByUrl = {};
  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    if (type === 'serp_selector_completed' && Array.isArray(payload.candidates)) {
      for (const c of payload.candidates) {
        const url = String(c?.url || '').trim();
        if (url) {
          triageByUrl[url] = {
            decision: String(c?.decision || 'unknown').trim(),
            score: Number(c?.score) || 0,
            rationale: String(c?.rationale || '').trim(),
            score_components: c?.score_components && typeof c.score_components === 'object'
              ? c.score_components
              : null,
          };
        }
      }
    }
  }
  return triageByUrl;
}

function buildHostToFetchWorkers(events, eventType, payloadOf) {
  const hostToFetchWorkers = {};
  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    if (type === 'fetch_started' && payload.scope === 'url' && payload.url && payload.worker_id) {
      const url = String(payload.url).trim();
      let host;
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (!hostToFetchWorkers[host]) hostToFetchWorkers[host] = [];
      hostToFetchWorkers[host].push({ worker_id: String(payload.worker_id).trim(), url });
    }
  }
  return hostToFetchWorkers;
}

// WHY: Contract mirror of the enrichment logic in runtimeOpsWorkerDetailBuilders.js.
// Three enrichment sources feed into the decision:
//   1. search_results_collected — initial decision from search provider (preserved if non-empty)
//   2. serp_selector_completed — triage decision (always wins when matched)
//   3. domains_classified — blocked/unsafe → hard_drop fallback when still unknown
function enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers, domainSafetyByHost = {}) {
  const triage = triageByUrl[result.url];
  if (triage) {
    result.decision = triage.decision;
    result.score = triage.score;
    result.rationale = triage.rationale;
    result.score_components = triage.score_components;
  }
  // No triage match — keep the initial decision from search_results_collected
  // (may be 'unknown' if the event carried no decision)

  // Domain classifier fallback: blocked/unsafe → hard_drop when still unknown
  const host = result.domain?.replace(/^www\./, '') || '';
  const safety = (domainSafetyByHost[host] || '').toLowerCase();
  if (result.decision === 'unknown' && (safety === 'blocked' || safety === 'unsafe')) {
    result.decision = 'hard_drop';
    result.rationale = 'denied_host';
  }

  // Exact URL match first
  const fetchWid = urlToFetchWorker[result.url];
  if (fetchWid) {
    result.fetch_worker_id = fetchWid;
    result.fetched = true;
    return;
  }

  // Host-level fallback
  const hostWorkers = hostToFetchWorkers[host];
  if (hostWorkers && hostWorkers.length > 0) {
    result.fetch_worker_id = hostWorkers[0].worker_id;
    result.fetched = true;
  }
}

function makeEvent(type, payload) {
  return { type, payload, ts: new Date().toISOString() };
}
function eventType(evt) { return evt.type; }
function payloadOf(evt) { return evt.payload || {}; }

function makeTriageCandidate(overrides = {}) {
  return {
    url: 'https://example.com/page',
    decision: 'maybe',
    score: 5.5,
    rationale: 'mixed_signals',
    score_components: null,
    ...overrides,
  };
}

function makeSearchResultRow(overrides = {}) {
  return {
    url: 'https://example.com/page',
    domain: 'example.com',
    fetch_worker_id: null,
    fetched: false,
    decision: 'unknown',
    score: 0,
    rationale: '',
    score_components: null,
    ...overrides,
  };
}

function makeFetchStartedEvent(overrides = {}) {
  return makeEvent('fetch_started', {
    scope: 'url',
    url: 'https://example.com/page',
    worker_id: 'fetch-001',
    ...overrides,
  });
}

describe('Search worker triage enrichment', () => {
  it('1. Triage events enrich results with decision/score/rationale', () => {
    const events = [
      makeEvent('serp_selector_completed', {
        candidates: [
          makeTriageCandidate({
            url: 'https://razer.com/viper',
            decision: 'keep',
            score: 8.5,
            rationale: 'manufacturer_site',
            score_components: { base_relevance: 6, tier_boost: 1.5, identity_match: 1, penalties: 0 },
          }),
          makeTriageCandidate({
            url: 'https://rtings.com/mouse',
            decision: 'drop',
            score: 2.1,
            rationale: 'low_relevance',
            score_components: { base_relevance: 2, tier_boost: 0.1, identity_match: 0, penalties: 0 },
          }),
        ],
      }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);

    assert.equal(triageByUrl['https://razer.com/viper'].decision, 'keep');
    assert.equal(triageByUrl['https://razer.com/viper'].score, 8.5);
    assert.equal(triageByUrl['https://razer.com/viper'].rationale, 'manufacturer_site');
    assert.equal(triageByUrl['https://rtings.com/mouse'].decision, 'drop');
    assert.equal(triageByUrl['https://rtings.com/mouse'].score, 2.1);
  });

  it('2. Unmatched results get decision unknown and score 0', () => {
    const triageByUrl = {};
    const urlToFetchWorker = {};
    const hostToFetchWorkers = {};
    const result = makeSearchResultRow();

    enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers);

    assert.equal(result.decision, 'unknown');
    assert.equal(result.score, 0);
    assert.equal(result.rationale, '');
    assert.equal(result.score_components, null);
  });

  it('3. Exact URL fetch match works', () => {
    const triageByUrl = { 'https://razer.com/viper': { decision: 'keep', score: 8, rationale: 'ok', score_components: null } };
    const urlToFetchWorker = { 'https://razer.com/viper': 'fetch-001' };
    const hostToFetchWorkers = {};
    const result = makeSearchResultRow({ url: 'https://razer.com/viper', domain: 'razer.com' });

    enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers);

    assert.equal(result.fetch_worker_id, 'fetch-001');
    assert.equal(result.fetched, true);
    assert.equal(result.decision, 'keep');
  });

  it('4. Host-level fetch fallback works when exact URL differs', () => {
    const triageByUrl = {};
    const urlToFetchWorker = {};
    const hostToFetchWorkers = {
      'razer.com': [{ worker_id: 'fetch-007', url: 'https://razer.com/other-page' }],
    };
    const result = makeSearchResultRow({ url: 'https://razer.com/viper-v3-pro', domain: 'razer.com' });

    enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers);

    assert.equal(result.fetch_worker_id, 'fetch-007');
    assert.equal(result.fetched, true);
  });

  it('5. score_components passed through correctly', () => {
    const events = [
      makeEvent('serp_selector_completed', {
        candidates: [
          makeTriageCandidate({
            score_components: { base_relevance: 3, tier_boost: 1.5, identity_match: 1.5, penalties: -0.5 },
          }),
        ],
      }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);
    const entry = triageByUrl['https://example.com/page'];

    assert.deepEqual(entry.score_components, {
      base_relevance: 3,
      tier_boost: 1.5,
      identity_match: 1.5,
      penalties: -0.5,
    });
  });

  it('6. Empty triage candidates — results remain unknown', () => {
    const events = [
      makeEvent('serp_selector_completed', { candidates: [] }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);
    assert.deepEqual(triageByUrl, {});

    const result = makeSearchResultRow();
    enrichResultWithTriage(result, triageByUrl, {}, {});
    assert.equal(result.decision, 'unknown');
    assert.equal(result.score, 0);
  });

  it('7. Multiple queries with different triage outcomes', () => {
    const events = [
      makeEvent('serp_selector_completed', {
        candidates: [
          makeTriageCandidate({ url: 'https://a.com/page', decision: 'keep', score: 9, rationale: 'query1_top' }),
          makeTriageCandidate({ url: 'https://b.com/page', decision: 'drop', score: 1, rationale: 'query1_irrelevant' }),
        ],
      }),
      makeEvent('serp_selector_completed', {
        candidates: [
          makeTriageCandidate({ url: 'https://c.com/page', decision: 'maybe', score: 5, rationale: 'query2_mixed' }),
          // Same URL from different triage round — last write wins
          makeTriageCandidate({
            url: 'https://a.com/page',
            decision: 'keep',
            score: 9.5,
            rationale: 'query2_confirmed',
            score_components: { base_relevance: 7, tier_boost: 1.5, identity_match: 1, penalties: 0 },
          }),
        ],
      }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);

    assert.ok(triageByUrl['https://a.com/page']);
    assert.ok(triageByUrl['https://b.com/page']);
    assert.ok(triageByUrl['https://c.com/page']);
    assert.equal(triageByUrl['https://a.com/page'].score, 9.5, 'Last write wins for duplicate URLs');
    assert.equal(triageByUrl['https://b.com/page'].decision, 'drop');
    assert.equal(triageByUrl['https://c.com/page'].decision, 'maybe');
  });

  it('8. Host-level fetch map built from fetch_started events', () => {
    const events = [
      makeFetchStartedEvent({ url: 'https://razer.com/viper' }),
      makeFetchStartedEvent({ url: 'https://razer.com/other', worker_id: 'fetch-002' }),
      makeFetchStartedEvent({ url: 'https://rtings.com/review', worker_id: 'fetch-003' }),
      makeFetchStartedEvent({ scope: 'batch', url: 'https://ignored.com', worker_id: 'fetch-999' }),
    ];

    const hostMap = buildHostToFetchWorkers(events, eventType, payloadOf);

    assert.equal(hostMap['razer.com'].length, 2);
    assert.equal(hostMap['rtings.com'].length, 1);
    assert.equal(hostMap['ignored.com'], undefined, 'scope=batch is ignored');
  });

  it('9. Initial decision from search_results_collected preserved when no serp_selector match', () => {
    const result = makeSearchResultRow({
      url: 'https://razer.com/viper',
      domain: 'razer.com',
      decision: 'keep',
    });
    enrichResultWithTriage(result, {}, {}, {});
    assert.equal(result.decision, 'keep', 'Initial decision from search phase preserved');
  });

  it('10. Serp selector decision overrides initial decision from search phase', () => {
    const result = makeSearchResultRow({
      url: 'https://razer.com/viper',
      domain: 'razer.com',
      decision: 'maybe',
    });
    const triageByUrl = {
      'https://razer.com/viper': { decision: 'drop', score: 1, rationale: 'irrelevant', score_components: null },
    };
    enrichResultWithTriage(result, triageByUrl, {}, {});
    assert.equal(result.decision, 'drop', 'Serp selector always wins');
  });

  it('11. Domain classifier blocked → hard_drop when decision is still unknown', () => {
    const result = makeSearchResultRow({
      url: 'https://example.com/page',
      domain: 'example.com',
      decision: 'unknown',
    });
    const domainSafetyByHost = { 'example.com': 'blocked' };
    enrichResultWithTriage(result, {}, {}, {}, domainSafetyByHost);
    assert.equal(result.decision, 'hard_drop');
    assert.equal(result.rationale, 'denied_host');
  });

  it('12. Domain classifier unsafe → hard_drop when decision is still unknown', () => {
    const result = makeSearchResultRow({
      url: 'https://sketchy.net/page',
      domain: 'sketchy.net',
      decision: 'unknown',
    });
    const domainSafetyByHost = { 'sketchy.net': 'unsafe' };
    enrichResultWithTriage(result, {}, {}, {}, domainSafetyByHost);
    assert.equal(result.decision, 'hard_drop');
    assert.equal(result.rationale, 'denied_host');
  });

  it('13. Domain classifier does NOT override serp_selector decision', () => {
    const result = makeSearchResultRow({
      url: 'https://example.com/page',
      domain: 'example.com',
    });
    const triageByUrl = {
      'https://example.com/page': { decision: 'keep', score: 8, rationale: 'good', score_components: null },
    };
    const domainSafetyByHost = { 'example.com': 'blocked' };
    enrichResultWithTriage(result, triageByUrl, {}, {}, domainSafetyByHost);
    assert.equal(result.decision, 'keep', 'Serp selector wins over domain classifier');
  });

  it('14. Domain classifier caution does NOT derive hard_drop', () => {
    const result = makeSearchResultRow({
      url: 'https://caution.com/page',
      domain: 'caution.com',
      decision: 'unknown',
    });
    const domainSafetyByHost = { 'caution.com': 'caution' };
    enrichResultWithTriage(result, {}, {}, {}, domainSafetyByHost);
    assert.equal(result.decision, 'unknown', 'Caution does not escalate to hard_drop');
  });

  it('15. Domain classifier does NOT override initial keep from search phase', () => {
    const result = makeSearchResultRow({
      url: 'https://example.com/page',
      domain: 'example.com',
      decision: 'keep',
    });
    const domainSafetyByHost = { 'example.com': 'blocked' };
    enrichResultWithTriage(result, {}, {}, {}, domainSafetyByHost);
    assert.equal(result.decision, 'keep', 'Initial decision from search phase wins over domain classifier');
  });
});
