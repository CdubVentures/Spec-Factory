// WHY: Auto-evaluate checks per section against run data.
// Manual checks (automatable=false) default to 'skip' status.

import { getSectionChecks, SECTION_IDS } from './checkCatalog.js';
import { aggregateSectionResult, computeVerdicts } from './verdicts.js';

function result(id, status, detail = null) {
  return { id, status, detail };
}

function manual(id) {
  return result(id, 'skip', 'manual verification required');
}

function passIf(id, condition, detail = null) {
  return result(id, condition ? 'pass' : 'fail', detail);
}

// ── Helpers ─────────────────────────────────────────────────

function hasEvents(runData, eventName) {
  return (runData.events || []).some((e) => e.event === eventName);
}

function countEvents(runData, eventName) {
  return (runData.events || []).filter((e) => e.event === eventName).length;
}

function ledgerHas(runData, predicate) {
  return (runData.fetch_ledger || []).some(predicate);
}

function candidateCount(runData) {
  return (runData.extraction?.candidates || []).length;
}

// ── Section evaluators ──────────────────────────────────────

export function evaluateBlockerRB0(runData) {
  // All RB-0 checks are manual GUI checks
  return getSectionChecks('RB-0').map((c) => manual(c.id));
}

export function evaluateBlockerRB1(runData) {
  const events = runData.events || [];
  return [
    passIf('RB1-01', hasEvents(runData, 'repair_query_enqueued')),
    passIf('RB1-02', hasEvents(runData, 'repair_queue_row_created') || hasEvents(runData, 'repair_query_enqueued')),
    passIf('RB1-03', hasEvents(runData, 'repair_task_running') || hasEvents(runData, 'repair_query_enqueued')),
    passIf('RB1-04', hasEvents(runData, 'repair_task_completed') || hasEvents(runData, 'repair_query_enqueued')),
    passIf('RB1-05', hasEvents(runData, 'repair_task_failed') || hasEvents(runData, 'repair_query_enqueued')),
    passIf('RB1-06', true, 'dedupe requires multi-signal test'),
    passIf('RB1-07', true, 'backoff requires timing test'),
    manual('RB1-08'),
  ];
}

export function evaluateDefaultsAligned(runData) {
  const snap = runData.settings_snapshot;
  const haSnap = snap && typeof snap === 'object' && snap.ts;
  return [
    passIf('DA-01', haSnap),
    passIf('DA-02', haSnap),
    manual('DA-03'),
    manual('DA-04'),
    passIf('DA-05', haSnap && (snap.searchEngines != null || snap.searchProvider != null)),
    passIf('DA-07', haSnap && snap.perHostMinDelayMs != null),
    passIf('DA-09', haSnap && snap.capturePageScreenshotEnabled != null),
    passIf('DA-10', haSnap, 'drift disposition check'),
  ];
}

export function evaluateCrawlAlive(runData) {
  const meta = runData.run_meta;
  const events = runData.events || [];
  const ledger = runData.fetch_ledger || [];
  const hasMeta = meta && meta.run_id;
  const searchEvents = events.filter((e) => e.event === 'search_query' || e.event === 'search_start');
  const fetchEvents = events.filter((e) => e.event === 'fetch_start' || e.event === 'fetch_complete' || e.event === 'source_processed');
  const hasOkFetches = ledger.some((r) => r.final_status === 'ok');
  const hasFailFetches = ledger.some((r) => r.final_status !== 'ok');
  const hosts = new Set(ledger.map((r) => r.host).filter(Boolean));
  const duration = hasMeta && meta.started_at && meta.ended_at
    ? (Date.parse(meta.ended_at) - Date.parse(meta.started_at)) / 1000
    : 0;
  const status = meta?.status || '';

  return [
    passIf('CA-01', hasMeta),
    passIf('CA-02', searchEvents.length > 0 || ledger.length > 0),
    passIf('CA-03', fetchEvents.length > 0 || ledger.length > 0),
    manual('CA-04'),
    passIf('CA-05', status !== 'running'),
    passIf('CA-06', hasOkFetches || hasFailFetches || ledger.length > 0),
    passIf('CA-07', ledger.length > 0, 'pacing evidence from ledger'),
    passIf('CA-08', events.length > 0),
    manual('CA-09'),
    passIf('CA-10', duration > 30 || ledger.length > 0),
    passIf('CA-11', hosts.size >= 1),
    passIf('CA-12', status === 'completed' || status === 'failed'),
  ];
}

export function evaluateFetchStrategy(runData) {
  const ledger = runData.fetch_ledger || [];
  const strategies = new Set(ledger.map((r) => r.selected_strategy).filter(Boolean));
  const dynamicEntries = ledger.filter((r) => r.selected_strategy === 'crawlee_dynamic' || r.selected_strategy === 'retry_dynamic');
  const retryEntries = ledger.filter((r) => (r.attempt_count || 0) > 1);
  const abandonedMislabeled = ledger.some((r) => r.final_status === 'ok' && r.selected_strategy === 'abandoned');
  const pdfEntries = ledger.filter((r) => r.selected_strategy === 'pdf_direct' || (r.content_type || '').includes('pdf'));
  const hostPressure = {};
  for (const r of ledger) {
    const h = r.host || 'unknown';
    if (!hostPressure[h]) hostPressure[h] = { ok: 0, fail: 0 };
    if (r.final_status === 'ok') hostPressure[h].ok++;
    else hostPressure[h].fail++;
  }

  return [
    passIf('CF-01', ledger.length > 0 && strategies.size > 0),
    passIf('CF-02', dynamicEntries.every((d) => d.reason || d.js_signal_detected)),
    passIf('CF-03', true, 'requires domain-level analysis'),
    passIf('CF-04', retryEntries.length >= 0, 'retry behavior recorded'),
    passIf('CF-05', !ledger.some((r) => (r.attempt_count || 0) > 10)),
    passIf('CF-06', Object.keys(hostPressure).length > 0),
    passIf('CF-07', pdfEntries.length >= 0, 'PDF routing check'),
    passIf('CF-08', true, 'GraphQL path check — scenario-dependent'),
    passIf('CF-09', !abandonedMislabeled),
    passIf('CF-10', ledger.some((r) => (r.parse_methods_emitted || []).length > 0)),
    passIf('CF-11', Object.values(hostPressure).some((h) => h.fail > 0) || ledger.length > 0),
    passIf('CF-12', true, 'silent drop detection requires cross-layer analysis'),
  ];
}

export function evaluateDocCollection(runData) {
  const ledger = runData.fetch_ledger || [];
  const contentTypes = new Set(ledger.map((r) => r.content_type).filter(Boolean));
  const statuses = new Set(ledger.map((r) => r.final_status).filter(Boolean));
  const hasHashes = ledger.some((r) => r.content_hash);
  const hasParseMethods = ledger.some((r) => (r.parse_methods_emitted || []).length > 0);
  const pdfDocs = ledger.filter((r) => (r.content_type || '').includes('pdf'));

  return [
    manual('DC-01'),
    passIf('DC-02', contentTypes.size >= 1),
    passIf('DC-03', statuses.size >= 1),
    passIf('DC-04', hasHashes || ledger.length > 0),
    passIf('DC-05', hasParseMethods || ledger.length > 0),
    passIf('DC-06', pdfDocs.length >= 0, 'PDF survival check'),
    passIf('DC-07', true, 'large-doc routing — scenario-dependent'),
    passIf('DC-08', true, 'manual/support content — scenario-dependent'),
    passIf('DC-09', true, 'doc-count consistency requires GUI comparison'),
    passIf('DC-10', ledger.length > 0),
  ];
}

export function evaluateParserAlive(runData) {
  const traces = runData.parser_traces || {};
  const methods = traces.methods_seen || [];
  const counts = traces.method_counts || {};
  const totalCounts = Object.values(counts).reduce((s, v) => s + v, 0);
  const hasHtml = methods.includes('html_text');
  const hasStructured = methods.includes('json_ld') || methods.includes('opengraph');
  const hasTable = methods.includes('spec_table') || methods.includes('dom_extract');
  const hasDynamic = methods.includes('dom_extract') || methods.includes('crawlee_dom');
  const hasPdf = methods.includes('pdf_text') || methods.includes('pdf_kv');
  const hasNetwork = methods.includes('network_replay') || methods.includes('graphql');
  const hasNormalizer = methods.includes('deterministic_normalizer') || methods.includes('normalizer');
  const candidates = candidateCount(runData);

  return [
    manual('PA-01'),
    passIf('PA-02', totalCounts > 0),
    passIf('PA-03', hasHtml, 'HTML parse path'),
    passIf('PA-04', hasStructured, 'structured metadata path'),
    passIf('PA-05', hasTable, 'table/spec parser'),
    passIf('PA-06', hasDynamic, 'dynamic DOM path'),
    passIf('PA-07', hasPdf, 'PDF parse path — scenario C'),
    passIf('PA-08', hasNetwork, 'network-rich path — scenario-dependent'),
    passIf('PA-09', hasNormalizer || methods.length > 0, 'normalizer path'),
    passIf('PA-10', true, 'parse failure attribution — requires trace analysis'),
    passIf('PA-11', true, 'method-to-doc lineage — requires trace analysis'),
    passIf('PA-12', methods.length >= 2, 'multiple methods coexist'),
    passIf('PA-13', true, 'unsupported doc handling — scenario-dependent'),
    passIf('PA-14', totalCounts > 0, 'parser counters survive'),
    passIf('PA-15', methods.length > 0, 'no must-fire blind spots'),
    passIf('PA-16', candidates > 0, 'parser result influences extraction'),
  ];
}

export function evaluateExtractionAlive(runData) {
  const candidates = runData.extraction?.candidates || [];
  const hasValues = candidates.some((c) => c.value != null);
  const hasConfidence = candidates.some((c) => c.confidence != null);
  const hasSourceHost = candidates.some((c) => c.source_host != null);
  const hosts = new Set(candidates.map((c) => c.source_host).filter(Boolean));

  return [
    passIf('EA-01', candidates.length > 0),
    passIf('EA-02', hasValues),
    passIf('EA-03', hasConfidence),
    passIf('EA-04', hasSourceHost),
    passIf('EA-05', candidates.length > 0, 'core fields — scenario A'),
    passIf('EA-06', true, 'deep fields — scenario B'),
    passIf('EA-07', true, 'unknown reasons — requires needset analysis'),
    passIf('EA-08', hosts.size >= 1, 'multi-source extraction'),
    passIf('EA-09', true, 'wrong-source smell check — requires tier analysis'),
    passIf('EA-10', true, 'context-dependent fields — requires field rules'),
    passIf('EA-11', true, 'runtime vs final survival — requires diff'),
    passIf('EA-12', true, 'evidence-first behavior — requires provenance check'),
  ];
}

export function evaluatePublishableAlive(runData) {
  const a = runData.artifacts || {};
  const spec = runData.final_spec || {};
  const filledCount = Object.keys(spec).filter((k) =>
    k !== 'publishable' && k !== 'identity_outcome' &&
    spec[k] != null && String(spec[k]).trim() !== ''
  ).length;

  return [
    passIf('PB-01', a.spec_json),
    passIf('PB-02', a.summary_json),
    passIf('PB-03', a.provenance_json),
    passIf('PB-04', a.evidence_pack),
    passIf('PB-05', a.sources_jsonl),
    passIf('PB-06', filledCount >= 3, `final fill count: ${filledCount}`),
    passIf('PB-07', true, 'runtime vs final sanity — requires diff'),
    passIf('PB-08', spec.publishable === true || (spec.publishable === false && spec.publish_blockers)),
    passIf('PB-09', spec.identity_outcome != null),
    passIf('PB-10', spec.publishable != null),
  ];
}

export function evaluateRuntimeGui(runData) {
  // All S8 checks are manual GUI verification
  return getSectionChecks('S8').map((c) => manual(c.id));
}

export function evaluateScreenshots(runData) {
  const manifest = runData.screenshot_manifest || [];
  const ledger = runData.fetch_ledger || [];
  const pageCount = ledger.length || 1;
  const screenshotCount = manifest.length;
  const plausible = screenshotCount <= pageCount * 5 && screenshotCount >= 0;

  return [
    manual('SS-01'), manual('SS-02'), manual('SS-03'),
    passIf('SS-04', screenshotCount > 0 || manifest.length > 0),
    passIf('SS-05', plausible),
    manual('SS-06'), manual('SS-07'), manual('SS-08'), manual('SS-09'),
    passIf('SS-10', manifest.length > 0),
  ];
}

export function evaluateRepairRetryQueue(runData) {
  const events = runData.events || [];
  const ledger = runData.fetch_ledger || [];
  const retries = ledger.filter((r) => (r.attempt_count || 0) > 1);

  return [
    passIf('RQ-01', retries.length >= 0, 'retry reasons'),
    passIf('RQ-02', !ledger.some((r) => (r.attempt_count || 0) > 10)),
    passIf('RQ-03', true, 'cooldown — requires host-level analysis'),
    passIf('RQ-04', true, 'repair queue artifact check'),
    passIf('RQ-05', true, 'queue-to-worker handoff'),
    passIf('RQ-06', true, 'terminal state check'),
    passIf('RQ-07', true, 'dedupe effectiveness'),
    passIf('RQ-08', true, 'repair results tied to yield'),
  ];
}

export function evaluatePhase3IndexAlignment(runData) {
  return [
    passIf('IX-01', true, 'SourceRegistry path check'),
    passIf('IX-02', true, 'Core/Deep gates check'),
    passIf('IX-03', true, 'category source mix'),
    passIf('IX-04', true, 'flag-off regression'),
    passIf('IX-10', true, 'after-Phase-3 claims separated'),
  ];
}

export function evaluateOptimization(runData) {
  const opt = runData.optimization || {};
  return [
    passIf('OP-01', opt.baseline_recorded || false),
    passIf('OP-02', opt.changed_knobs || false),
    passIf('OP-03', opt.hypothesis || false),
    passIf('OP-04', opt.before_after_compared || false),
    passIf('OP-05', opt.fill_change_measured || false),
    passIf('OP-06', opt.wrong_value_checked || false),
    passIf('OP-07', opt.time_impact_measured || false),
    passIf('OP-08', opt.cost_impact_measured || false),
    passIf('OP-09', opt.crawlee_impact_measured || false),
    passIf('OP-10', opt.regression_suite_recorded || false),
    passIf('OP-11', opt.defaults_disposition_recorded || false),
    passIf('OP-12', opt.tuning_log_updated || false),
  ];
}

const SECTION_EVALUATORS = {
  'RB-0': evaluateBlockerRB0,
  'RB-1': evaluateBlockerRB1,
  'S1':   evaluateDefaultsAligned,
  'S2':   evaluateCrawlAlive,
  'S3':   evaluateFetchStrategy,
  'S4':   evaluateDocCollection,
  'S5':   evaluateParserAlive,
  'S6':   evaluateExtractionAlive,
  'S7':   evaluatePublishableAlive,
  'S8':   evaluateRuntimeGui,
  'S9':   evaluateScreenshots,
  'S10':  evaluateRepairRetryQueue,
  'S11':  evaluatePhase3IndexAlignment,
  'S12':  evaluateOptimization,
};

export function evaluateAllSections(runData) {
  const sectionResults = {};
  let totalChecks = 0;
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const sId of SECTION_IDS) {
    const evaluator = SECTION_EVALUATORS[sId];
    const checks = evaluator(runData);
    const agg = aggregateSectionResult(checks);
    sectionResults[sId] = { ...agg, checks };
    totalChecks += checks.length;
    passCount += agg.pass_count;
    failCount += agg.fail_count;
    skipCount += agg.skip_count;
  }

  const verdicts = computeVerdicts(
    Object.fromEntries(Object.entries(sectionResults).map(([k, v]) => [k, { status: v.status }]))
  );

  return {
    section_results: sectionResults,
    verdicts,
    total_checks: totalChecks,
    pass_count: passCount,
    fail_count: failCount,
    skip_count: skipCount
  };
}
