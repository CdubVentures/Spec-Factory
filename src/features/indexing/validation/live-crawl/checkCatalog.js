// WHY: Single source of truth for all 148 live-crawl validation checks.
// Each check maps to a section from TESTING-LIVE-CRAWL-VALIDATION-MEGA-V2.md.

export const VERDICT_IDS = Object.freeze([
  'defaults_aligned',
  'crawl_alive',
  'parser_alive',
  'extraction_alive',
  'publishable_alive'
]);

export const SECTION_IDS = Object.freeze([
  'RB-0', 'RB-1',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7',
  'S8', 'S9', 'S10', 'S11', 'S12'
]);

const SECTION_META = Object.freeze({
  'RB-0': { title: 'CP-0 GUI lane contract', check_count: 5 },
  'RB-1': { title: 'CP-1 repair queue handoff', check_count: 8 },
  'S1':   { title: 'Defaults-Aligned Gate', check_count: 9 },
  'S2':   { title: 'Crawl Alive Gate', check_count: 12 },
  'S3':   { title: 'Crawlee / Fetch Strategy Attribution Gate', check_count: 12 },
  'S4':   { title: 'Document Collection Gate', check_count: 10 },
  'S5':   { title: 'Parser Alive Gate', check_count: 16 },
  'S6':   { title: 'Extraction Alive Gate', check_count: 12 },
  'S7':   { title: 'Publishable Alive Gate', check_count: 10 },
  'S8':   { title: 'Runtime GUI Proof Gate', check_count: 14 },
  'S9':   { title: 'Screenshots / Screencast Proof Gate', check_count: 10 },
  'S10':  { title: 'Repair / Retry / Queue Proof Gate', check_count: 8 },
  'S11':  { title: 'Phase-3 Index Alignment Gate', check_count: 10 },
  'S12':  { title: 'Optimization Gate', check_count: 12 },
});

const VERDICT_MAP = Object.freeze({
  'RB-0': 'defaults_aligned',
  'RB-1': 'defaults_aligned',
  'S1':   'defaults_aligned',
  'S2':   'crawl_alive',
  'S3':   'crawl_alive',
  'S4':   'crawl_alive',
  'S5':   'parser_alive',
  'S6':   'extraction_alive',
  'S7':   'publishable_alive',
  'S8':   'crawl_alive',
  'S9':   'crawl_alive',
  'S10':  'crawl_alive',
  'S11':  'extraction_alive',
  'S12':  'publishable_alive',
});

export function sectionToVerdict(sectionId) {
  return VERDICT_MAP[sectionId] || null;
}

export function getSection(sectionId) {
  return SECTION_META[sectionId] || null;
}

// ── Check definitions ───────────────────────────────────────
// Format: [id, section, description, pass_when, automatable]

const RAW_CHECKS = [
  // RB-0: CP-0 GUI lane contract (5)
  ['RB0-01', 'RB-0', 'Runtime route opens cleanly', 'No blank screen, no fatal error', false],
  ['RB0-02', 'RB-0', 'Category selector renders', 'Expected options visible', false],
  ['RB0-03', 'RB-0', 'Category change propagates', 'Panels update without timeout', false],
  ['RB0-04', 'RB-0', 'Worker detail opens', 'Drawer renders identity banner + tabs', false],
  ['RB0-05', 'RB-0', '10x local stability', '10/10 pass', false],
  // RB-1: CP-1 repair queue handoff (8)
  ['RB1-01', 'RB-1', 'repair_query_enqueued emitted', 'Event present with payload', true],
  ['RB1-02', 'RB-1', 'Queue row created', 'Dedupe key + metadata stored', true],
  ['RB1-03', 'RB-1', 'Worker picks up repair task', 'Task enters running', true],
  ['RB1-04', 'RB-1', 'Success path completes', 'Terminal completed', true],
  ['RB1-05', 'RB-1', 'Failure path completes', 'Terminal failed after retries', true],
  ['RB1-06', 'RB-1', 'Dedupe enforced', 'Duplicate signal -> single effective task', true],
  ['RB1-07', 'RB-1', 'Backoff enforced', 'Retry schedule respected', true],
  ['RB1-08', 'RB-1', 'Runtime GUI reflects state', 'Queue/worker surfaces show transition', false],
  // S1: Defaults-Aligned Gate (10)
  ['DA-01', 'S1', 'Canonical config captured', 'Exact runtime snapshot saved for the run', true],
  ['DA-02', 'S1', 'Server values captured', 'Loaded runtime config written to artifact/log', true],
  ['DA-03', 'S1', 'UI values captured', 'Runtime settings panel shows same effective values', false],
  ['DA-04', 'S1', 'Fresh-session proof', 'Same values after reload / cleared stale overrides', false],
  ['DA-05', 'S1', 'searchProvider aligned', 'Claimed provider matches live run', true],
  ['DA-07', 'S1', 'Fetch strategy knobs aligned', 'preferHttpFetcher, dynamicCrawleeEnabled, retry limits, pacing values captured', true],
  ['DA-08', 'S1', 'Parsing knobs aligned', 'structured metadata, PDF, OCR, chart-related settings captured', true],
  ['DA-09', 'S1', 'Screenshot knobs aligned', 'capture enabled + format/quality values captured', true],
  ['DA-10', 'S1', 'Drift disposition recorded', 'Any mismatch marked promoted, temporary, or reverted', true],
  // S2: Crawl Alive Gate (12)
  ['CA-01', 'S2', 'Real live run started', 'Run ID, product, timestamps recorded', true],
  ['CA-02', 'S2', 'Real queries executed', 'Search traces non-zero', true],
  ['CA-03', 'S2', 'Real pages fetched', 'Fetch traces non-zero', true],
  ['CA-04', 'S2', 'Workers not fake-active', 'URL, elapsed time, and transitions move while run is active', false],
  ['CA-05', 'S2', 'No zombie workers after completion', 'No worker stuck in running', true],
  ['CA-06', 'S2', 'Fetch success and failures both visible', 'fetched_ok plus blocked/error/404 telemetry visible', true],
  ['CA-07', 'S2', 'Per-host pacing visible', 'Evidence of host delay / scheduler / retry logic', true],
  ['CA-08', 'S2', 'Runtime events stream is alive', 'NDJSON or WS stream non-zero during run', true],
  ['CA-09', 'S2', 'Runtime counters advance mid-run', 'Docs / fetch / field / queue counters change during run', false],
  ['CA-10', 'S2', 'Duration sensible', '> 30s and < run limit unless blocker reproducing', true],
  ['CA-11', 'S2', 'Multi-surface host mix', 'Manufacturer + at least one non-manufacturer host when justified', true],
  ['CA-12', 'S2', 'End state honest', 'Completed/failed status matches actual artifacts and logs', true],
  // S3: Crawlee / Fetch Strategy Attribution Gate (12)
  ['CF-01', 'S3', 'Static-first vs dynamic path visible', 'Each URL has selected strategy', true],
  ['CF-02', 'S3', 'Dynamic usage justified', 'Dynamic runs show reason / JS signal / blocked static case', true],
  ['CF-03', 'S3', 'Static pages do not overuse Crawlee', 'Static-friendly hosts mostly stay static unless evidence says otherwise', true],
  ['CF-04', 'S3', 'Retry behavior attributable', 'Retries and backoff recorded per URL', true],
  ['CF-05', 'S3', 'Scheduler did not thrash', 'No infinite retry/fallback loops', true],
  ['CF-06', 'S3', 'Per-host pressure visible', 'Domain-level blocked/timeouts surfaced', true],
  ['CF-07', 'S3', 'PDF routing visible', 'PDF URLs do not disappear into generic fetch noise', true],
  ['CF-08', 'S3', 'GraphQL/network-rich pages recorded', 'Replay/network capture visible when used', true],
  ['CF-09', 'S3', 'Final status honest', 'abandoned or blocked URLs not mislabeled as success', true],
  ['CF-10', 'S3', 'Strategy-to-yield relationship measurable', 'Can tell which strategies produced accepted evidence', true],
  ['CF-11', 'S3', 'Challenge/block rate visible', '403/429/timeout patterns attributable by host', true],
  ['CF-12', 'S3', 'No silent drops', 'URLs do not vanish between discovery, fetch, and artifact layers', true],
  // S4: Document Collection Gate (10)
  ['DC-01', 'S4', 'Docs tab populates live', 'Rows appear during run', false],
  ['DC-02', 'S4', 'Multiple content types visible', 'HTML and any relevant PDF/JSON/network/doc artifacts visible', true],
  ['DC-03', 'S4', 'Status distribution honest', 'ok, blocked, error, 404 visible where applicable', true],
  ['DC-04', 'S4', 'Content hash present when expected', 'Row expansion shows hash / metadata', true],
  ['DC-05', 'S4', 'Parse status visible', 'Rows indicate parse outcome or method presence', true],
  ['DC-06', 'S4', 'PDF docs survive to artifacts', 'PDF traces/artifacts present when PDF URL fetched', true],
  ['DC-07', 'S4', 'Large-doc routing sane', 'Huge/unsupported docs surface as bounded failures, not silent disappearance', true],
  ['DC-08', 'S4', 'Manual/support/spec content appears', 'Manufacturer/support/manual document types are represented when available', true],
  ['DC-09', 'S4', 'No doc-count illusion', 'Runtime doc counts and artifact doc counts are directionally consistent', true],
  ['DC-10', 'S4', 'Final accepted sources explainable', 'Sources JSONL aligns with observed docs/hosts', true],
  // S5: Parser Alive Gate (16)
  ['PA-01', 'S5', 'Phase cards animate/live update', 'Pipeline shows real movement during run', false],
  ['PA-02', 'S5', 'Method counts non-zero', 'At least one real method count increments', true],
  ['PA-03', 'S5', 'HTML parse path proven', 'HTML method fires on HTML docs', true],
  ['PA-04', 'S5', 'Structured metadata path proven', 'json_ld and/or opengraph observed where expected', true],
  ['PA-05', 'S5', 'Table/spec parser proven', 'Table/spec extraction visible where page contains tables', true],
  ['PA-06', 'S5', 'Dynamic DOM path proven', 'JS-rendered content parsed when required', true],
  ['PA-07', 'S5', 'PDF parse path proven', 'pdf_text and/or pdf_kv visible on PDF/manual scenario', true],
  ['PA-08', 'S5', 'Network-rich path proven', 'GraphQL/network-based path visible when relevant', true],
  ['PA-09', 'S5', 'Normalizer path proven', 'Final normalized values tied to raw parse outputs', true],
  ['PA-10', 'S5', 'Parse failures visible', 'Failures attributed by doc/method, not silent', true],
  ['PA-11', 'S5', 'Method-to-doc lineage visible', 'Can tell which doc triggered which method', true],
  ['PA-12', 'S5', 'Mixed parser coexistence works', 'Multiple methods can fire without clobbering each other', true],
  ['PA-13', 'S5', 'Unsupported docs handled honestly', 'Explicit unsupported/bounded-failure state', true],
  ['PA-14', 'S5', 'Parser counters survive to artifacts', 'Runtime method counts align with traces', true],
  ['PA-15', 'S5', 'No must-fire blind spots', 'Scenario-specific must-fire methods are not all missing', true],
  ['PA-16', 'S5', 'Parser result influences extraction', 'Parser output actually reaches candidate extraction', true],
  // S6: Extraction Alive Gate (12)
  ['EA-01', 'S6', 'Extraction rows appear live', 'Extract drawer populates during run', true],
  ['EA-02', 'S6', 'Candidate values visible', 'Values not just counts', true],
  ['EA-03', 'S6', 'Confidence visible', 'Score or classification visible', true],
  ['EA-04', 'S6', 'Source host visible', 'Can trace candidate to host/doc', true],
  ['EA-05', 'S6', 'Easy/core fields fill on easy scenario', 'Core manufacturer fields appear when evidence exists', true],
  ['EA-06', 'S6', 'Deep fields appear on deep scenario', 'Review/lab/manual scenario yields deeper fields', true],
  ['EA-07', 'S6', 'Unknown reasons honest', 'Missing fields explicitly classified', true],
  ['EA-08', 'S6', 'Multi-source extraction visible', 'Mixed-source run shows multiple source contributions', true],
  ['EA-09', 'S6', 'Wrong-source smell check passes', 'No obvious Tier4/community overwrite of core facts', true],
  ['EA-10', 'S6', 'Context-dependent fields handled honestly', 'Not-applicable fields not guessed', true],
  ['EA-11', 'S6', 'Runtime extraction survives reduction', 'Values visible in runtime are not all dropped by finalization', true],
  ['EA-12', 'S6', 'Evidence-first behavior holds', 'No evidence -> no publishable value', true],
  // S7: Publishable Alive Gate (10)
  ['PB-01', 'S7', 'spec.json exists', 'Final spec artifact written', true],
  ['PB-02', 'S7', 'summary.json exists', 'Validation / publish summary written', true],
  ['PB-03', 'S7', 'provenance.json exists', 'Per-field evidence lineage written', true],
  ['PB-04', 'S7', 'Evidence pack exists', 'Evidence artifact present', true],
  ['PB-05', 'S7', 'Accepted sources artifact exists', 'sources.jsonl or equivalent present', true],
  ['PB-06', 'S7', 'Non-trivial final fill', 'Final spec is not a near-empty shell', true],
  ['PB-07', 'S7', 'Runtime vs final sanity holds', 'Runtime fill counts and final spec are directionally consistent', true],
  ['PB-08', 'S7', 'Publish blockers explicit', 'If not publishable, blocker reason is explicit', true],
  ['PB-09', 'S7', 'Identity outcome explicit', 'Locked / provisional / conflict state captured', true],
  ['PB-10', 'S7', 'Final verdict honest', 'publishable=true/false aligns with actual output quality', true],
  // S8: Runtime GUI Proof Gate (14)
  ['UI-01', 'S8', 'Overview tab alive', 'KPI + flow + blockers update', false],
  ['UI-02', 'S8', 'Search worker panel alive', 'Queries, provider, results visible', false],
  ['UI-03', 'S8', 'Fetch worker panel alive', 'URLs, state, timing visible', false],
  ['UI-04', 'S8', 'LLM worker panel alive', 'Model, tokens, cost visible when used', false],
  ['UI-05', 'S8', 'Docs drawer tab alive', 'Live doc rows + expansion work', false],
  ['UI-06', 'S8', 'Extract drawer tab alive', 'Live extraction rows + filters work', false],
  ['UI-07', 'S8', 'Queue drawer tab alive', 'Lane/status/reason/timeline visible', false],
  ['UI-08', 'S8', 'Shots drawer tab alive', 'Retained frame + thumbnail grid live', false],
  ['UI-09', 'S8', 'Metrics drawer tab alive', 'KPI grid/funnel/histogram non-zero where expected', false],
  ['UI-10', 'S8', 'Pipeline drawer tab alive', 'Phase cards and methods reflect actual worker lineage', false],
  ['UI-11', 'S8', 'Prefetch tabs honest', 'Available tabs populate; disabled tabs visibly disabled for config-off states', false],
  ['UI-12', 'S8', 'Cross-surface nav works', 'Worker buttons focus expected prefetch tab', false],
  ['UI-13', 'S8', 'Observability counters sane', 'No unexplained orphan finish / missing telemetry spikes', false],
  ['UI-14', 'S8', 'No stale-after-complete behavior', 'Final state remains viewable after run ends', false],
  // S9: Screenshots / Screencast Proof Gate (10)
  ['SS-01', 'S9', 'Retained frame visible mid-run', 'Not just after completion', false],
  ['SS-02', 'S9', 'Retained frame timestamp advances', 'Multiple timestamps observed', false],
  ['SS-03', 'S9', 'Thumbnail grid changes during run', 'Grid count or images update while running', false],
  ['SS-04', 'S9', 'Runtime screencast files written', 'Screencast directory populated', true],
  ['SS-05', 'S9', 'Screenshot count plausible', 'Not wildly disconnected from fetched page count', true],
  ['SS-06', 'S9', 'Lightbox opens', 'User can inspect selected screenshot', false],
  ['SS-07', 'S9', 'Keyboard nav works', 'Left/right/escape work', false],
  ['SS-08', 'S9', 'Badge metadata visible', 'Dimensions/timestamp overlay present', false],
  ['SS-09', 'S9', 'Final retained frame stable', 'No spinner/blank final state', false],
  ['SS-10', 'S9', 'Screenshot manifest exists', 'Each captured asset traceable to worker/url/timestamp', true],
  // S10: Repair / Retry / Queue Proof Gate (8)
  ['RQ-01', 'S10', 'Retry reasons visible', 'Timeout/block/error retries explainable', true],
  ['RQ-02', 'S10', 'Retry budget enforced', 'Max retries not exceeded silently', true],
  ['RQ-03', 'S10', 'Cooldown visible', 'Host/url cooldown surfaced', true],
  ['RQ-04', 'S10', 'Repair queue artifact visible', 'Repair task leaves durable trace', true],
  ['RQ-05', 'S10', 'Queue-to-worker handoff visible', 'Runtime GUI and artifacts agree', true],
  ['RQ-06', 'S10', 'Terminal state reached', 'Completed or failed with reason', true],
  ['RQ-07', 'S10', 'Dedupe effective', 'Repeated identical repair signals do not explode queue', true],
  ['RQ-08', 'S10', 'Repair results tied back to yield', 'Can tell whether repair produced usable docs/evidence', true],
  // S11: Phase-3 Index Alignment Gate (10)
  ['IX-01', 'S11', 'SourceRegistry path is active when enabled', 'Category registry loads and is inspectable', true],
  ['IX-02', 'S11', 'QueryCompiler path is active when enabled', 'Query planning reflects compiled/provider-aware behavior', true],
  ['IX-03', 'S11', 'Core/Deep gates are active when enabled', 'Core fact acceptance behaves safely', true],
  ['IX-04', 'S11', 'Phase-3 resolver inputs are visible', 'Domain hints / host groups / unresolved tokens inspectable', true],
  ['IX-05', 'S11', 'effective_host_plan truth is honest', 'Present when real, null when not yet primary live path', true],
  ['IX-06', 'S11', 'Runtime panels do not overclaim v2', 'GUI labels/status reflect actual path, not future intent', false],
  ['IX-07', 'S11', 'Category source mix is sensible', 'Manufacturer/lab/retailer mix consistent with category authority', true],
  ['IX-08', 'S11', 'Host-plan gaps recorded', 'If live path still uses source rows more than host plan, report it plainly', true],
  ['IX-09', 'S11', 'Flag-off regression understood', 'Legacy behavior still characterized when relevant', true],
  ['IX-10', 'S11', 'After-Phase-3 claims separated', 'QueryIndex/URLIndex/late compounding claims not used as current blockers unless live', true],
  // S12: Optimization Gate (12)
  ['OP-01', 'S12', 'Baseline recorded', 'Before values captured', true],
  ['OP-02', 'S12', 'Changed knobs named', 'Exact knob/value delta recorded', true],
  ['OP-03', 'S12', 'Hypothesis written', 'Expected effect stated before run', true],
  ['OP-04', 'S12', 'Before/after compared', 'Metrics collected both sides', true],
  ['OP-05', 'S12', 'Fill change measured', 'Field fill impact captured', true],
  ['OP-06', 'S12', 'Wrong-value risk checked', 'Spot-check or gate check performed', true],
  ['OP-07', 'S12', 'Time impact measured', 'Runtime delta recorded', true],
  ['OP-08', 'S12', 'Cost impact measured', 'Search/LLM usage delta recorded', true],
  ['OP-09', 'S12', 'Crawlee impact measured', 'Dynamic usage vs yield compared', true],
  ['OP-10', 'S12', 'Regression suite recorded', 'Targeted + broader test result noted', true],
  ['OP-11', 'S12', 'Defaults disposition recorded', 'Promoted to config or reverted', true],
  ['OP-12', 'S12', 'Tuning log updated', 'Cumulative log entry written', true],
];

export const CHECK_CATALOG = Object.freeze(
  RAW_CHECKS.map(([id, section, description, pass_when, automatable]) => ({
    id, section, description, pass_when, automatable
  }))
);

export function getCheck(id) {
  return CHECK_CATALOG.find((c) => c.id === id) || null;
}

export function getSectionChecks(sectionId) {
  return CHECK_CATALOG.filter((c) => c.section === sectionId);
}
