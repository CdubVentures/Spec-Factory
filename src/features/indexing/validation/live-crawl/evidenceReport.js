// WHY: Build the Required Evidence Table from run data.
// Per TESTING-LIVE-CRAWL-VALIDATION-MEGA-V2.md "Required Evidence Table" section.

export const EVIDENCE_REPORT_FIELDS = Object.freeze([
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
]);

export function buildEvidenceReport(runData) {
  const rd = runData || {};
  const meta = rd.run_meta || {};
  const snap = rd.settings_snapshot || {};
  const events = rd.events || [];
  const ledger = rd.fetch_ledger || [];
  const extraction = rd.extraction || {};
  const spec = rd.final_spec || {};
  const traces = rd.parser_traces || {};
  const manifest = rd.screenshot_manifest || [];
  const verdicts = rd.verdicts || {};

  const searchEvents = events.filter((e) =>
    e.event === 'search_query' || e.event === 'search_start'
  );
  const llmEvents = events.filter((e) =>
    e.event === 'llm_call' || e.event === 'llm_start'
  );

  const blocked = ledger.filter((r) => r.final_status === 'blocked').length;
  const errored = ledger.filter((r) => r.final_status === 'error').length;
  const notFound = ledger.filter((r) => r.final_status === '404').length;

  const filledFields = Object.keys(spec).filter((k) =>
    k !== 'publishable' && k !== 'identity_outcome' &&
    spec[k] != null && String(spec[k]).trim() !== '' &&
    String(spec[k]).trim().toLowerCase() !== 'unk'
  );

  const runtimeFilled = Object.keys(extraction.candidates || {}).length ||
    (Array.isArray(extraction.candidates) ? extraction.candidates.length : 0);

  const startEnd = meta.started_at && meta.ended_at
    ? `${meta.started_at} -> ${meta.ended_at}`
    : null;

  return {
    run_id: meta.run_id || null,
    scenario: rd.scenario || null,
    product: meta.product_id || null,
    brand_model: rd.brand_model || null,
    start_end: startEnd,
    exit_code: meta.exit_code ?? null,
    searchEngines: snap.searchEngines || snap.searchProvider || null,
    discoveryEnabled: snap.discoveryEnabled ?? null,
    preferHttpFetcher: snap.preferHttpFetcher ?? null,
    dynamicCrawleeEnabled: snap.dynamicCrawleeEnabled ?? null,
    queries_executed: searchEvents.length || ledger.length,
    pages_fetched: ledger.length,
    pages_blocked_error_404: `${blocked}/${errored}/${notFound}`,
    llm_calls: llmEvents.length,
    accepted_sources: null, // requires sources.jsonl analysis
    key_parser_phases: traces.methods_seen || [],
    key_parser_methods: traces.methods_seen || [],
    screenshot_count: manifest.length,
    runtime_screencast: manifest.length > 0 ? 'present' : 'missing',
    identity_outcome: spec.identity_outcome || null,
    runtime_fields_filled: runtimeFilled,
    final_fields_filled: filledFields.length,
    publishable: spec.publishable || false,
    defaults_aligned: verdicts.defaults_aligned || 'RED',
    crawl_alive: verdicts.crawl_alive || 'RED',
    parser_alive: verdicts.parser_alive || 'RED',
    extraction_alive: verdicts.extraction_alive || 'RED',
    publishable_alive: verdicts.publishable_alive || 'RED',
    what_this_proves: rd.what_this_proves || null,
    what_this_does_not_prove: rd.what_this_does_not_prove || null
  };
}
