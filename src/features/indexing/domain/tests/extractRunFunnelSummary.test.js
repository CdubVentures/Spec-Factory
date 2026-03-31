import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractRunFunnelSummary, extractDomainBreakdown } from '../extractRunFunnelSummary.js';

// ── Event factories (match actual telemetry.events shape) ────────

function searchFinished(query, resultCount = 10) {
  return { stage: 'search', event: 'search_finished', payload: { query, result_count: resultCount } };
}

function fetchQueued(url) {
  return { stage: 'fetch', event: 'fetch_queued', payload: { url } };
}

function serpSelectorCompleted(candidateCount, funnelOverrides = {}) {
  return {
    stage: 'search', event: 'serp_selector_completed',
    payload: {
      candidates: Array.from({ length: candidateCount }, (_, i) => ({ url: `https://example.com/${i}` })),
      funnel: { raw_input: candidateCount, ...funnelOverrides },
    },
  };
}

function domainsClassified(classifications) {
  return {
    stage: 'search', event: 'domains_classified',
    payload: { classifications },
  };
}

// ── extractRunFunnelSummary ──────────────────────────────────────

describe('extractRunFunnelSummary', () => {

  it('extracts full funnel from realistic event set', () => {
    const events = [
      searchFinished('brand model specs', 10),
      searchFinished('brand model rtings.com', 10),
      searchFinished('brand model techpowerup.com', 8),
      serpSelectorCompleted(57),
      fetchQueued('https://a.com'), fetchQueued('https://b.com'), fetchQueued('https://c.com'),
      domainsClassified([
        { domain: 'a.com', safety_class: 'safe' },
        { domain: 'b.com', safety_class: 'safe' },
        { domain: 'c.com', safety_class: 'caution' },
      ]),
    ];
    const counters = { fetched_ok: 2, fetched_blocked: 0, fetched_404: 0, fetched_error: 1, parse_completed: 2 };

    const f = extractRunFunnelSummary(events, counters);

    assert.equal(f.queries_executed, 3);
    assert.equal(f.results_found, 28);
    assert.equal(f.candidates_triaged, 57);
    assert.equal(f.urls_selected, 3);
    assert.equal(f.urls_ok, 2);
    assert.equal(f.urls_blocked, 0);
    assert.equal(f.urls_error, 1);
    assert.equal(f.docs_parsed, 2);
    assert.equal(f.domains_total, 3);
    assert.equal(f.domains_safe, 2);
    assert.equal(f.domains_caution, 1);
  });

  it('returns zeros for empty events', () => {
    const f = extractRunFunnelSummary([], {});
    assert.equal(f.queries_executed, 0);
    assert.equal(f.results_found, 0);
    assert.equal(f.candidates_triaged, 0);
    assert.equal(f.urls_selected, 0);
    assert.equal(f.urls_ok, 0);
    assert.equal(f.urls_blocked, 0);
    assert.equal(f.urls_error, 0);
    assert.equal(f.docs_parsed, 0);
    assert.equal(f.domains_total, 0);
    assert.equal(f.domains_safe, 0);
    assert.equal(f.domains_caution, 0);
  });

  it('uses counters as fallback when events are sparse', () => {
    const f = extractRunFunnelSummary([], { fetched_ok: 10, fetched_error: 2, parse_completed: 11 });
    assert.equal(f.urls_ok, 10);
    assert.equal(f.urls_error, 2);
    assert.equal(f.docs_parsed, 11);
  });

  it('combines fetched_blocked and fetched_404 into urls_blocked', () => {
    const f = extractRunFunnelSummary([], { fetched_blocked: 2, fetched_404: 3 });
    assert.equal(f.urls_blocked, 5);
  });

  it('handles missing payload gracefully', () => {
    const events = [
      { stage: 'search', event: 'search_finished', payload: null },
      { stage: 'search', event: 'serp_selector_completed', payload: {} },
    ];
    const f = extractRunFunnelSummary(events, {});
    assert.equal(f.queries_executed, 1);
    assert.equal(f.results_found, 0);
    assert.equal(f.candidates_triaged, 0);
  });
});

// ── extractDomainBreakdown ───────────────────────────────────────

describe('extractDomainBreakdown', () => {

  it('combines classification + crawl data per domain', () => {
    const events = [
      domainsClassified([
        { domain: 'endgamegear.com', role: 'manufacturer', safety_class: 'safe' },
        { domain: 'amazon.com', role: 'retail', safety_class: 'caution' },
      ]),
    ];
    const crawlSources = [
      { host: 'endgamegear.com', http_status: 200, size_bytes: 100000 },
      { host: 'endgamegear.com', http_status: 200, size_bytes: 200000 },
      { host: 'amazon.com', http_status: 200, size_bytes: 3000000 },
      { host: 'amazon.com', http_status: 403, size_bytes: 0 },
    ];

    const domains = extractDomainBreakdown(events, crawlSources);

    assert.equal(domains.length, 2);
    const eg = domains.find((d) => d.domain === 'endgamegear.com');
    assert.equal(eg.role, 'manufacturer');
    assert.equal(eg.safety, 'safe');
    assert.equal(eg.urls, 2);
    assert.equal(eg.ok, 2);
    assert.equal(eg.errors, 0);
    assert.equal(eg.avg_size, 150000);

    const az = domains.find((d) => d.domain === 'amazon.com');
    assert.equal(az.role, 'retail');
    assert.equal(az.safety, 'caution');
    assert.equal(az.urls, 2);
    assert.equal(az.ok, 1);
    assert.equal(az.errors, 1);
  });

  it('includes unclassified domains from crawl_sources', () => {
    const domains = extractDomainBreakdown([], [
      { host: 'unknown-site.com', http_status: 200, size_bytes: 5000 },
    ]);
    assert.equal(domains.length, 1);
    assert.equal(domains[0].domain, 'unknown-site.com');
    assert.equal(domains[0].role, 'unknown');
    assert.equal(domains[0].safety, 'unknown');
    assert.equal(domains[0].ok, 1);
  });

  it('returns empty for no data', () => {
    const domains = extractDomainBreakdown([], []);
    assert.equal(domains.length, 0);
  });
});
