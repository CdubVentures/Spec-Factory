import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceReport,
  EVIDENCE_REPORT_FIELDS
} from '../src/features/indexing/validation/live-crawl/evidenceReport.js';

test('EVIDENCE_REPORT_FIELDS has all required fields from document', () => {
  const required = [
    'run_id', 'scenario', 'product', 'brand_model', 'start_end',
    'exit_code', 'searchProvider', 'discoveryEnabled',
    'preferHttpFetcher', 'dynamicCrawleeEnabled', 'queries_executed',
    'pages_fetched', 'pages_blocked_error_404', 'llm_calls',
    'accepted_sources', 'key_parser_phases', 'key_parser_methods',
    'screenshot_count', 'runtime_screencast', 'identity_outcome',
    'runtime_fields_filled', 'final_fields_filled', 'publishable',
    'defaults_aligned', 'crawl_alive', 'parser_alive',
    'extraction_alive', 'publishable_alive',
    'what_this_proves', 'what_this_does_not_prove'
  ];
  for (const f of required) {
    assert.ok(EVIDENCE_REPORT_FIELDS.includes(f), `missing field: ${f}`);
  }
});

test('buildEvidenceReport populates from run data', () => {
  const runData = {
    run_meta: { run_id: 'run-001', product_id: 'mouse-razer-viper', started_at: '2026-03-09T12:00:00Z', ended_at: '2026-03-09T12:05:00Z', exit_code: 0 },
    settings_snapshot: { searchEngines: 'bing,startpage,duckduckgo', discoveryEnabled: true, preferHttpFetcher: true, dynamicCrawleeEnabled: true },
    scenario: 'A',
    brand_model: 'Razer Viper V3 Pro',
    events: Array(5).fill({ event: 'search_query' }),
    fetch_ledger: Array(10).fill({ final_status: 'ok' }),
    extraction: { candidates: Array(15).fill({}) },
    final_spec: { weight: '85g', sensor: 'PAW3950', publishable: true, identity_outcome: 'locked' },
    parser_traces: { methods_seen: ['html_text', 'json_ld'] },
    screenshot_manifest: Array(8).fill({}),
    verdicts: {
      defaults_aligned: 'GREEN',
      crawl_alive: 'GREEN',
      parser_alive: 'PARTIAL',
      extraction_alive: 'GREEN',
      publishable_alive: 'GREEN'
    }
  };

  const report = buildEvidenceReport(runData);
  assert.equal(report.run_id, 'run-001');
  assert.equal(report.scenario, 'A');
  assert.equal(report.searchEngines, 'bing,startpage,duckduckgo');
  assert.equal(report.pages_fetched, 10);
  assert.equal(report.screenshot_count, 8);
  assert.equal(report.defaults_aligned, 'GREEN');
  assert.equal(report.parser_alive, 'PARTIAL');
  assert.equal(report.publishable, true);
});

test('buildEvidenceReport handles missing data gracefully', () => {
  const report = buildEvidenceReport({});
  assert.equal(report.run_id, null);
  assert.equal(report.pages_fetched, 0);
  assert.equal(report.defaults_aligned, 'RED');
  assert.equal(report.publishable, false);
});

test('buildEvidenceReport includes what_this_proves and what_this_does_not_prove', () => {
  const report = buildEvidenceReport({
    what_this_proves: 'manufacturer-first fast authority',
    what_this_does_not_prove: 'PDF extraction path'
  });
  assert.equal(report.what_this_proves, 'manufacturer-first fast authority');
  assert.equal(report.what_this_does_not_prove, 'PDF extraction path');
});

test('buildEvidenceReport computes blocked/error/404 counts', () => {
  const report = buildEvidenceReport({
    fetch_ledger: [
      { final_status: 'ok' },
      { final_status: 'blocked' },
      { final_status: 'error' },
      { final_status: '404' },
      { final_status: 'ok' }
    ]
  });
  assert.equal(report.pages_fetched, 5);
  assert.equal(report.pages_blocked_error_404, '1/1/1');
});
