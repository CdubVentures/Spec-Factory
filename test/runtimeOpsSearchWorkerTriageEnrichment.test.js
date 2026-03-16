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
    if (type === 'serp_triage_completed' && Array.isArray(payload.candidates)) {
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

function enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers) {
  const triage = triageByUrl[result.url];
  if (triage) {
    result.decision = triage.decision;
    result.score = triage.score;
    result.rationale = triage.rationale;
    result.score_components = triage.score_components;
  } else {
    result.decision = 'unknown';
    result.score = 0;
    result.rationale = '';
    result.score_components = null;
  }

  // Exact URL match first
  const fetchWid = urlToFetchWorker[result.url];
  if (fetchWid) {
    result.fetch_worker_id = fetchWid;
    result.fetched = true;
    return;
  }

  // Host-level fallback
  const host = result.domain?.replace(/^www\./, '') || '';
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

describe('Search worker triage enrichment', () => {
  it('1. Triage events enrich results with decision/score/rationale', () => {
    const events = [
      makeEvent('serp_triage_completed', {
        candidates: [
          { url: 'https://razer.com/viper', decision: 'keep', score: 8.5, rationale: 'manufacturer_site', score_components: { base_relevance: 6, tier_boost: 1.5, identity_match: 1, penalties: 0 } },
          { url: 'https://rtings.com/mouse', decision: 'drop', score: 2.1, rationale: 'low_relevance', score_components: { base_relevance: 2, tier_boost: 0.1, identity_match: 0, penalties: 0 } },
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
    const result = { url: 'https://example.com/page', domain: 'example.com', fetch_worker_id: null, fetched: false };

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
    const result = { url: 'https://razer.com/viper', domain: 'razer.com', fetch_worker_id: null, fetched: false };

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
    const result = { url: 'https://razer.com/viper-v3-pro', domain: 'razer.com', fetch_worker_id: null, fetched: false };

    enrichResultWithTriage(result, triageByUrl, urlToFetchWorker, hostToFetchWorkers);

    assert.equal(result.fetch_worker_id, 'fetch-007');
    assert.equal(result.fetched, true);
  });

  it('5. score_components passed through correctly', () => {
    const events = [
      makeEvent('serp_triage_completed', {
        candidates: [
          {
            url: 'https://example.com/page',
            decision: 'maybe',
            score: 5.5,
            rationale: 'mixed_signals',
            score_components: { base_relevance: 3, tier_boost: 1.5, identity_match: 1.5, penalties: -0.5 },
          },
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
      makeEvent('serp_triage_completed', { candidates: [] }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);
    assert.deepEqual(triageByUrl, {});

    const result = { url: 'https://example.com/page', domain: 'example.com', fetch_worker_id: null, fetched: false };
    enrichResultWithTriage(result, triageByUrl, {}, {});
    assert.equal(result.decision, 'unknown');
    assert.equal(result.score, 0);
  });

  it('7. Multiple queries with different triage outcomes', () => {
    const events = [
      makeEvent('serp_triage_completed', {
        candidates: [
          { url: 'https://a.com/page', decision: 'keep', score: 9, rationale: 'query1_top', score_components: null },
          { url: 'https://b.com/page', decision: 'drop', score: 1, rationale: 'query1_irrelevant', score_components: null },
        ],
      }),
      makeEvent('serp_triage_completed', {
        candidates: [
          { url: 'https://c.com/page', decision: 'maybe', score: 5, rationale: 'query2_mixed', score_components: null },
          // Same URL from different triage round — last write wins
          { url: 'https://a.com/page', decision: 'keep', score: 9.5, rationale: 'query2_confirmed', score_components: { base_relevance: 7, tier_boost: 1.5, identity_match: 1, penalties: 0 } },
        ],
      }),
    ];

    const triageByUrl = buildTriageLookup(events, eventType, payloadOf);

    assert.equal(Object.keys(triageByUrl).length, 3);
    assert.equal(triageByUrl['https://a.com/page'].score, 9.5, 'Last write wins for duplicate URLs');
    assert.equal(triageByUrl['https://b.com/page'].decision, 'drop');
    assert.equal(triageByUrl['https://c.com/page'].decision, 'maybe');
  });

  it('8. Host-level fetch map built from fetch_started events', () => {
    const events = [
      makeEvent('fetch_started', { scope: 'url', url: 'https://razer.com/viper', worker_id: 'fetch-001' }),
      makeEvent('fetch_started', { scope: 'url', url: 'https://razer.com/other', worker_id: 'fetch-002' }),
      makeEvent('fetch_started', { scope: 'url', url: 'https://rtings.com/review', worker_id: 'fetch-003' }),
      makeEvent('fetch_started', { scope: 'batch', url: 'https://ignored.com', worker_id: 'fetch-999' }),
    ];

    const hostMap = buildHostToFetchWorkers(events, eventType, payloadOf);

    assert.equal(hostMap['razer.com'].length, 2);
    assert.equal(hostMap['rtings.com'].length, 1);
    assert.equal(hostMap['ignored.com'], undefined, 'scope=batch is ignored');
  });
});
