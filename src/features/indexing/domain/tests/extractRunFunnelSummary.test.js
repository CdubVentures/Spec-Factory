import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractRunFunnelSummary, extractDomainBreakdown, extractFetchErrors, extractExtractionSummary } from '../extractRunFunnelSummary.js';

// ── Event factories (match actual telemetry.events shape) ────────

function searchFinished(query, resultCount = 10, tier = null, hint_source = null) {
  return { stage: 'search', event: 'search_finished', payload: { query, result_count: resultCount, tier, hint_source } };
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
    assert.equal(f.candidates_unique, 57);
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
    assert.equal(f.candidates_unique, 0);
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
    assert.equal(f.candidates_unique, 0);
  });

  it('counts tier1/tier2/tier3 from search_finished events', () => {
    const events = [
      searchFinished('brand model specs', 10, 'seed', 'tier1_seed'),
      searchFinished('brand model rtings.com', 8, 'seed', 'tier1_seed'),
      searchFinished('brand model sensor', 5, 'group_search', 'tier2_group'),
      searchFinished('brand model dpi', 3, 'key_search', 'tier3_key'),
      searchFinished('brand model weight', 2, 'key_search', 'tier3_key'),
    ];
    const f = extractRunFunnelSummary(events, {});
    assert.equal(f.tier1_queries, 2);
    assert.equal(f.tier2_queries, 1);
    assert.equal(f.tier3_queries, 2);
    assert.equal(f.queries_executed, 5);
  });

  it('tier counts default to 0 when no tier data in events', () => {
    const events = [
      searchFinished('brand model specs', 10),
      searchFinished('brand model other', 5),
    ];
    const f = extractRunFunnelSummary(events, {});
    assert.equal(f.tier1_queries, 0);
    assert.equal(f.tier2_queries, 0);
    assert.equal(f.tier3_queries, 0);
    assert.equal(f.queries_executed, 2);
  });

  it('classifies by hint_source when tier field is missing', () => {
    const events = [
      searchFinished('q1', 10, null, 'tier1_seed'),
      searchFinished('q2', 5, null, 'tier2_group'),
      searchFinished('q3', 3, null, 'tier3_key'),
    ];
    const f = extractRunFunnelSummary(events, {});
    assert.equal(f.tier1_queries, 1);
    assert.equal(f.tier2_queries, 1);
    assert.equal(f.tier3_queries, 1);
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

// ── extractFetchErrors ───────────────────────────────────────────

describe('extractFetchErrors', () => {

  it('extracts HTTP 403 and timeout errors', () => {
    const events = [
      domainsClassified([
        { domain: 'bestbuy.ca', role: 'retail', safety_class: 'caution' },
        { domain: 'amazon.com', role: 'retail', safety_class: 'caution' },
      ]),
      { stage: 'fetch', event: 'fetch_finished', payload: { url: 'https://bestbuy.ca/product/123', status: 403, status_class: 'blocked', ms: 2100 } },
      { stage: 'fetch', event: 'fetch_finished', payload: { url: 'https://amazon.com/dp/B08VDN', status: 200, status_class: 'ok', ms: 45100, error: 'requestHandler timed out after 45 seconds.' } },
      { stage: 'fetch', event: 'fetch_finished', payload: { url: 'https://endgamegear.com/xm1', status: 200, status_class: 'ok', ms: 3000 } },
    ];

    const errors = extractFetchErrors(events);
    assert.equal(errors.length, 2);

    const blocked = errors.find((e) => e.error_type === 'http_403');
    assert.ok(blocked);
    assert.equal(blocked.host, 'bestbuy.ca');
    assert.equal(blocked.domain_safety, 'caution');
    assert.equal(blocked.response_ms, 2100);

    const timeout = errors.find((e) => e.error_type === 'timeout');
    assert.ok(timeout);
    assert.equal(timeout.host, 'amazon.com');
    assert.equal(timeout.response_ms, 45100);
  });

  it('returns empty for no errors', () => {
    const events = [
      { stage: 'fetch', event: 'fetch_finished', payload: { url: 'https://ok.com', status: 200, status_class: 'ok', ms: 500 } },
    ];
    assert.equal(extractFetchErrors(events).length, 0);
  });

  it('returns empty for no events', () => {
    assert.equal(extractFetchErrors([]).length, 0);
  });
});

// ── extractExtractionSummary ─────────────────────────────────────

describe('extractExtractionSummary', () => {

  it('aggregates plugin artifacts from extraction_plugin_completed events', () => {
    const events = [
      { event: 'extraction_plugin_completed', payload: { plugin: 'screenshot', result: { screenshot_count: 1, total_bytes: 250000 } } },
      { event: 'extraction_plugin_completed', payload: { plugin: 'screenshot', result: { screenshot_count: 2, total_bytes: 500000 } } },
      { event: 'extraction_plugin_completed', payload: { plugin: 'video', result: { total_bytes: 100000 } } },
      { event: 'extraction_artifacts_persisted', payload: { plugin: 'screenshot', filenames: ['a.jpg', 'b.jpg'] } },
      { event: 'extraction_artifacts_persisted', payload: { plugin: 'screenshot', filenames: ['c.jpg'] } },
      { event: 'extraction_artifacts_persisted', payload: { plugin: 'video', filenames: ['v.webm'] } },
    ];

    const s = extractExtractionSummary(events);
    assert.equal(s.plugins.screenshot.urls, 2);
    assert.equal(s.plugins.screenshot.artifacts, 3);
    assert.equal(s.plugins.screenshot.total_bytes, 750000);
    assert.equal(s.plugins.video.urls, 1);
    assert.equal(s.plugins.video.artifacts, 1);
    assert.equal(s.plugins.video.total_bytes, 100000);
    assert.equal(s.total_artifacts, 4);
    assert.equal(s.total_bytes, 850000);
  });

  it('aggregates parse quality from parse_finished events', () => {
    const events = [
      { event: 'parse_finished', payload: { candidate_count: 5, article_char_count: 1000, article_low_quality: false, structured_json_ld_count: 2, structured_microdata_count: 0, structured_opengraph_count: 1 } },
      { event: 'parse_finished', payload: { candidate_count: 0, article_char_count: 0, article_low_quality: false, structured_json_ld_count: 0, structured_microdata_count: 0, structured_opengraph_count: 0 } },
      { event: 'parse_finished', payload: { candidate_count: 3, article_char_count: 500, article_low_quality: true, structured_json_ld_count: 0, structured_microdata_count: 0, structured_opengraph_count: 0 } },
    ];

    const s = extractExtractionSummary(events);
    assert.equal(s.urls_parsed, 3);
    assert.equal(s.total_candidates, 8);
    assert.equal(s.structured_data_found, 1);
    assert.equal(s.articles_extracted, 2);
    assert.equal(s.low_quality_articles, 1);
  });

  it('returns zeros for empty events', () => {
    const s = extractExtractionSummary([]);
    assert.equal(s.total_artifacts, 0);
    assert.equal(s.total_bytes, 0);
    assert.equal(s.urls_parsed, 0);
    assert.deepEqual(s.plugins, {});
  });

  it('auto-discovers new plugin types', () => {
    const events = [
      { event: 'extraction_plugin_completed', payload: { plugin: 'pdf', result: { total_bytes: 50000 } } },
      { event: 'extraction_artifacts_persisted', payload: { plugin: 'pdf', filenames: ['doc.pdf'] } },
    ];
    const s = extractExtractionSummary(events);
    assert.ok(s.plugins.pdf);
    assert.equal(s.plugins.pdf.urls, 1);
    assert.equal(s.plugins.pdf.artifacts, 1);
    assert.equal(s.plugins.pdf.total_bytes, 50000);
  });
});
