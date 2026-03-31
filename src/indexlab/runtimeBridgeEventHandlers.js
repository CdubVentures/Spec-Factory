// WHY: Table-driven event dispatcher replacing the 767-line if/else chain.
// Each handler is a named function for independent readability and greppability.

import {
  toIso, asInt, asFloat, asNullableInt, asNullableFloat, asNullableText, asBool,
  normalizeRunId, isSearchEvent,
  inferLlmRouteRole, classifyLlmCallType, LLM_CALL_TYPE_TAB
} from './runtimeBridgeCoercers.js';
import { toNeedSetSnapshot, pickSearchQueryFromUrl } from './runtimeBridgePayloads.js';
import {
  ensureRun, writeRunMeta, writeNeedSet, writeSearchProfile,
  ensureBaselineArtifacts, recordSearchProfileQuery,
  applySearchProfilePlannedPayload, extractRuntimeEventPayload,
  emit, finishFetchUrl
} from './runtimeBridgeArtifacts.js';
import { setPhaseCursor, recordStartupMs, startStage, finishStage } from './runtimeBridgeStageLifecycle.js';
import { dedupeOutcomeToEventKey } from '../pipeline/dedupeOutcomeEvent.js';

// ── Individual event handlers ──────────────────────────────────────────────

async function handleRunStarted(state, deps, { ts, row }) {
  state.startedAt = ts;
  state.setContext({
    category: row.category || row.cat || state.context.category || '',
    productId: row.productId || row.product_id || state.context.productId || ''
  });
  setPhaseCursor(state, 'phase_00_bootstrap');
  await ensureBaselineArtifacts(state, ts);
  await startStage(state, 'search', ts, { trigger: 'run_started' });
}

async function handleRunContext(state, deps, { ts, row }) {
  state.identityFingerprint = String(row.identity_fingerprint || state.identityFingerprint || '').trim();
  state.identityLockStatus = String(row.identity_lock_status || state.identityLockStatus || '').trim();
  state.dedupeMode = String(row.dedupe_mode || state.dedupeMode || '').trim();
  const phaseCursor = String(row.phase_cursor || '').trim();
  if (phaseCursor) {
    setPhaseCursor(state, phaseCursor);
  }
  await emit(state, 'runtime', 'run_context', {
    scope: 'run',
    run_profile: 'standard',
    runtime_mode: String(row.runtime_mode || '').trim(),
    identity_fingerprint: state.identityFingerprint,
    identity_lock_status: state.identityLockStatus,
    dedupe_mode: state.dedupeMode,
    phase_cursor: state.phaseCursor
  }, ts);
  await writeRunMeta(state);
}

async function handleSearchProfileGenerated(state, deps, { ts, row }) {
  setPhaseCursor(state, 'phase_03_search_profile');
  const payload = extractRuntimeEventPayload(row);
  const applied = applySearchProfilePlannedPayload(state, payload, ts);
  if (applied) {
    await writeSearchProfile(state, state.searchProfile);
  }
}

async function handleSourceFetchQueued(state, deps, { ts, url, row }) {
  const workerId = String(row.worker_id || '').trim();
  if (url && workerId) {
    state.fetchByUrl.set(url, { started_at: null, worker_id: workerId, queued: true });
    state.workerByUrl.set(url, workerId);
  }
  await emit(state, 'fetch', 'fetch_queued', {
    scope: 'url',
    url,
    worker_id: workerId,
    host: String(row.host || ''),
    state: 'queued',
  }, ts);
}

async function handleSourceFetchStarted(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'source_fetch_started' });
  if (state.stageState.search.started_at && !state.stageState.search.ended_at) {
    await finishStage(state, 'search', ts, { reason: 'first_fetch_started' });
  }
  const searchQuery = pickSearchQueryFromUrl(url);
  if (searchQuery) {
    await recordSearchProfileQuery(state, {
      query: searchQuery,
      provider: String(row.provider || '').trim() || 'url_signal',
      incrementAttempt: true,
      ts
    });
  }
  if (url) {
    // WHY: Reuse the worker_id from source_fetch_queued if the URL was pre-populated.
    // This prevents creating a duplicate worker with a different ID.
    const existingWorker = state.workerByUrl.get(url);
    const workerId = existingWorker || ('fetch-' + (++state.counters.pages_checked));
    state.fetchClosedByUrl.delete(url);
    state.fetchByUrl.set(url, { started_at: ts, worker_id: workerId });
    if (!existingWorker) state.workerByUrl.set(url, workerId);
  }
  await emit(state, 'fetch', 'fetch_started', {
    scope: 'url',
    url,
    host: String(row.host || ''),
    tier: asInt(row.tier, 0),
    role: String(row.role || ''),
    fetcher_kind: String(row.fetcher_kind || ''),
    host_budget_score: asFloat(row.host_budget_score, 0),
    host_budget_state: String(row.host_budget_state || ''),
    worker_id: url ? state.workerByUrl.get(url) || '' : '',
    retry_count: asInt(row.retry_count, 0),
    proxy_url: String(row.proxy_url || ''),
  }, ts);
}

async function handleSourceFetchSkipped(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'source_fetch_skipped' });
  await emit(state, 'fetch', 'fetch_skipped', {
    scope: 'url',
    url,
    host: String(row.host || ''),
    skip_reason: String(row.skip_reason || row.reason || ''),
    reason: String(row.reason || ''),
    next_retry_ts: String(row.next_retry_ts || ''),
    host_budget_score: asFloat(row.host_budget_score, 0),
    host_budget_state: String(row.host_budget_state || '')
  }, ts);
}

// WHY: Crawlee's errorHandler fires before each retry attempt. Emit fetch_retrying
// so the worker pool builder can set the worker state to 'retrying'.
async function handleSourceFetchRetrying(state, deps, { ts, url, row }) {
  const workerId = url ? state.workerByUrl.get(url) || '' : '';
  await emit(state, 'fetch', 'fetch_retrying', {
    scope: 'url', url,
    worker_id: workerId || String(row.worker_id || ''),
    retry_count: asInt(row.retry_count, 0),
    error: String(row.error || ''),
  }, ts);
}

async function handleSourceFetchFailed(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'source_fetch_failed' });
  await finishFetchUrl(state, {
    url, ts,
    status: asInt(row.status, 0),
    error: String(row.message || ''),
    fetchMs: asInt(row.fetch_ms, 0),
    fetcherKind: String(row.fetcher_kind || ''),
    hostBudgetScore: asFloat(row.host_budget_score, 0),
    hostBudgetState: String(row.host_budget_state || ''),
    finalUrl: String(row.final_url || ''),
    contentType: String(row.content_type || ''),
    contentHash: String(row.content_hash || ''),
    bytes: asInt(row.bytes, 0),
    timeoutRescued: asBool(row.timeout_rescued),
  });
}

async function handleSourceProcessed(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'source_processed' });
  await startStage(state, 'parse', ts, { trigger: 'source_processed' });
  await startStage(state, 'index', ts, { trigger: 'source_processed' });

  const status = asInt(row.status, 0);
  const workerId = url ? state.workerByUrl.get(url) || '' : '';
  await finishFetchUrl(state, {
    url, ts, status,
    fetchMs: asInt(row.fetch_ms, 0),
    fetcherKind: String(row.fetcher_kind || ''),
    hostBudgetScore: asFloat(row.host_budget_score, 0),
    hostBudgetState: String(row.host_budget_state || ''),
    finalUrl: String(row.final_url || ''),
    contentType: String(row.content_type || ''),
    contentHash: String(row.content_hash || ''),
    bytes: asInt(row.bytes, 0)
  });

  await emit(state, 'parse', 'source_processed', {
    scope: 'url', url,
    final_url: String(row.final_url || '').trim(),
    host: String(row.host || '').trim(),
    status,
    candidate_count: asInt(row.candidate_count, 0),
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    fetch_ms: asInt(row.fetch_ms, 0),
    parse_ms: asInt(row.parse_ms, 0),
    content_type: String(row.content_type || '').trim(),
    content_hash: String(row.content_hash || '').trim(),
    bytes: asInt(row.bytes, 0),
    article_extraction_method: String(row.article_extraction_method || '').trim(),
    static_dom_mode: String(row.static_dom_mode || '').trim(),
    fetcher_kind: String(row.fetcher_kind || '').trim(),
    worker_id: workerId,
  }, ts);

  state.counters.parse_completed += 1;
  await emit(state, 'parse', 'parse_finished', {
    scope: 'url', url,
    final_url: String(row.final_url || '').trim(),
    host: String(row.host || '').trim(),
    status,
    candidate_count: asInt(row.candidate_count, 0),
    fetch_ms: asInt(row.fetch_ms, 0),
    parse_ms: asInt(row.parse_ms, 0),
    fetch_attempts: asInt(row.fetch_attempts, 0),
    fetch_retry_count: asInt(row.fetch_retry_count, 0),
    fetch_policy_matched_host: String(row.fetch_policy_matched_host || '').trim(),
    fetch_policy_override_applied: asBool(row.fetch_policy_override_applied, false),
    article_title: String(row.article_title || '').trim(),
    article_excerpt: String(row.article_excerpt || '').trim(),
    article_preview: String(row.article_preview || '').trim(),
    article_extraction_method: String(row.article_extraction_method || '').trim(),
    article_quality_score: asFloat(row.article_quality_score, 0),
    article_char_count: asInt(row.article_char_count, 0),
    article_heading_count: asInt(row.article_heading_count, 0),
    article_duplicate_sentence_ratio: asFloat(row.article_duplicate_sentence_ratio, 0),
    article_low_quality: asBool(row.article_low_quality, false),
    article_fallback_reason: String(row.article_fallback_reason || '').trim(),
    article_policy_mode: String(row.article_policy_mode || '').trim(),
    article_policy_matched_host: String(row.article_policy_matched_host || '').trim(),
    article_policy_override_applied: asBool(row.article_policy_override_applied, false),
    static_dom_mode: String(row.static_dom_mode || '').trim(),
    static_dom_accepted_field_candidates: asInt(row.static_dom_accepted_field_candidates, 0),
    static_dom_rejected_field_candidates: asInt(row.static_dom_rejected_field_candidates, 0),
    static_dom_parse_error_count: asInt(row.static_dom_parse_error_count, 0),
    static_dom_rejected_field_candidates_audit_count: asInt(row.static_dom_rejected_field_candidates_audit_count, 0),
    structured_json_ld_count: asInt(row.structured_json_ld_count, 0),
    structured_microdata_count: asInt(row.structured_microdata_count, 0),
    structured_opengraph_count: asInt(row.structured_opengraph_count, 0),
    structured_candidates: asInt(row.structured_candidates, 0),
    structured_rejected_candidates: asInt(row.structured_rejected_candidates, 0),
    structured_error_count: asInt(row.structured_error_count, 0),
    structured_snippet_rows: Array.isArray(row.structured_snippet_rows) ? row.structured_snippet_rows.slice(0, 20) : [],
    pdf_docs_parsed: asInt(row.pdf_docs_parsed, 0),
    pdf_pairs_total: asInt(row.pdf_pairs_total, 0),
    pdf_kv_pairs: asInt(row.pdf_kv_pairs, 0),
    pdf_table_pairs: asInt(row.pdf_table_pairs, 0),
    pdf_pages_scanned: asInt(row.pdf_pages_scanned, 0),
    pdf_error_count: asInt(row.pdf_error_count, 0),
    pdf_backend_selected: String(row.pdf_backend_selected || '').trim(),
    scanned_pdf_docs_detected: asInt(row.scanned_pdf_docs_detected, 0),
    scanned_pdf_ocr_docs_attempted: asInt(row.scanned_pdf_ocr_docs_attempted, 0),
    scanned_pdf_ocr_docs_succeeded: asInt(row.scanned_pdf_ocr_docs_succeeded, 0),
    scanned_pdf_ocr_pairs: asInt(row.scanned_pdf_ocr_pairs, 0),
    scanned_pdf_ocr_kv_pairs: asInt(row.scanned_pdf_ocr_kv_pairs, 0),
    scanned_pdf_ocr_table_pairs: asInt(row.scanned_pdf_ocr_table_pairs, 0),
    scanned_pdf_ocr_low_conf_pairs: asInt(row.scanned_pdf_ocr_low_conf_pairs, 0),
    scanned_pdf_ocr_error_count: asInt(row.scanned_pdf_ocr_error_count, 0),
    scanned_pdf_ocr_backend_selected: String(row.scanned_pdf_ocr_backend_selected || '').trim(),
    scanned_pdf_ocr_confidence_avg: asFloat(row.scanned_pdf_ocr_confidence_avg, 0),
    screenshot_uri: String(row.screenshot_uri || '').trim(),
    dom_snippet_uri: String(row.dom_snippet_uri || '').trim(),
    fetcher_kind: String(row.fetcher_kind || ''),
    host_budget_score: asFloat(row.host_budget_score, 0),
    host_budget_state: String(row.host_budget_state || ''),
    worker_id: workerId
  }, ts);
}

async function handleFieldsFilledFromSource(state, deps, { ts, url, row }) {
  await startStage(state, 'index', ts, { trigger: 'fields_filled_from_source' });
  const count = asInt(row.count, 0);
  state.counters.indexed_docs += 1;
  state.counters.fields_filled += Math.max(0, count);
  await emit(state, 'index', 'index_finished', {
    scope: 'url', url, count,
    filled_fields: Array.isArray(row.filled_fields) ? row.filled_fields : [],
    worker_id: url ? state.workerByUrl.get(url) || '' : ''
  }, ts);
}

async function handleVisualAssetCaptured(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'visual_asset_captured' });
  await emit(state, 'fetch', 'visual_asset_captured', {
    scope: 'url', url,
    screenshot_uri: String(row.screenshot_uri || '').trim(),
    quality_score: asFloat(row.quality_score, 0),
    width: asInt(row.width, 0),
    height: asInt(row.height, 0),
    format: String(row.format || '').trim(),
    bytes: asInt(row.bytes, 0),
    capture_ms: asInt(row.capture_ms, 0),
    worker_id: url ? state.workerByUrl.get(url) || '' : ''
  }, ts);
}

async function handleSchedulerFallbackStarted(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'scheduler_fallback_started' });
  await emit(state, 'fetch', 'scheduler_fallback_started', {
    scope: 'url', url,
    from_mode: String(row.from_mode || '').trim(),
    to_mode: String(row.to_mode || '').trim(),
    outcome: String(row.outcome || '').trim(),
    attempt: asInt(row.attempt, 0)
  }, ts);
}

async function handleSchedulerFallbackSucceeded(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'scheduler_fallback_succeeded' });
  await emit(state, 'fetch', 'scheduler_fallback_succeeded', {
    scope: 'url', url,
    mode: String(row.mode || '').trim(),
    attempt: asInt(row.attempt, 0),
    from_mode: String(row.from_mode || '').trim()
  }, ts);
}

async function handleSchedulerFallbackExhausted(state, deps, { ts, url, row }) {
  await startStage(state, 'fetch', ts, { trigger: 'scheduler_fallback_exhausted' });
  await emit(state, 'fetch', 'scheduler_fallback_exhausted', {
    scope: 'url', url,
    modes_tried: Array.isArray(row.modes_tried) ? row.modes_tried : [],
    final_outcome: String(row.final_outcome || '').trim()
  }, ts);
}

async function handleRepairQueryEnqueued(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'repair_query_enqueued', {
    scope: 'job',
    domain: String(row.domain || row.host || ''),
    host: String(row.host || row.domain || ''),
    query: String(row.query || ''),
    status: asInt(row.status, 0),
    reason: String(row.reason || ''),
    source_url: String(row.source_url || row.url || ''),
    cooldown_until: String(row.cooldown_until || row.next_retry_ts || ''),
    provider: String(row.provider || ''),
    doc_hint: String(row.doc_hint || ''),
    field_targets: Array.isArray(row.field_targets) ? row.field_targets : []
  }, ts);
}

async function handleRepairSearchStarted(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'repair_search_started', {
    scope: 'job',
    domain: String(row.domain || ''),
    query: String(row.query || ''),
    field_targets: Array.isArray(row.field_targets) ? row.field_targets : [],
    reason: String(row.reason || ''),
    source_url: String(row.source_url || ''),
  }, ts);
}

async function handleRepairSearchCompleted(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'repair_search_completed', {
    scope: 'job',
    domain: String(row.domain || ''),
    query: String(row.query || ''),
    urls_found: asInt(row.urls_found, 0),
    urls_seeded: asInt(row.urls_seeded, 0),
    field_targets: Array.isArray(row.field_targets) ? row.field_targets : [],
  }, ts);
}

async function handleRepairSearchFailed(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'repair_search_failed', {
    scope: 'job',
    domain: String(row.domain || ''),
    query: String(row.query || ''),
    error: String(row.error || ''),
    field_targets: Array.isArray(row.field_targets) ? row.field_targets : [],
  }, ts);
}

async function handleUrlCooldownApplied(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'url_cooldown_applied', {
    scope: 'url',
    url: String(row.url || ''),
    status: asInt(row.status, 0),
    cooldown_seconds: asInt(row.cooldown_seconds, 0),
    next_retry_ts: String(row.next_retry_ts || row.next_retry_at || ''),
    cooldown_until: String(row.cooldown_until || row.next_retry_ts || ''),
    reason: String(row.reason || '')
  }, ts);
}

async function handleBlockedDomainCooldownApplied(state, deps, { ts, row }) {
  await emit(state, 'scheduler', 'blocked_domain_cooldown_applied', {
    scope: 'host',
    host: String(row.host || ''),
    status: asInt(row.status, 0),
    blocked_count: asInt(row.blocked_count, 0),
    threshold: asInt(row.threshold, 0),
    removed_count: asInt(row.removed_count, 0)
  }, ts);
}

async function handleNeedsetComputed(state, deps, { ts, row }) {
  await startStage(state, 'index', ts, { trigger: 'needset_computed' });
  setPhaseCursor(state, 'phase_01_needset');
  const payload = toNeedSetSnapshot(row, ts);
  payload.status = 'executed';
  payload.source = 'runtime_bridge';

  // WHY: The search-plan planner emits needset_computed mid-run with bundles that
  // have queries and populated profile_influence. The finalization emits a second
  // needset_computed with NeedSet-only data that lacks these. Preserve the best
  // search-plan panel data so needset.json always has it.
  const prevBundles = state.needSet?.bundles || [];
  const prevHasQueries = prevBundles.some((b) => Array.isArray(b.queries) && b.queries.length > 0);
  const newHasQueries = (payload.bundles || []).some((b) => Array.isArray(b.queries) && b.queries.length > 0);
  if (prevHasQueries && !newHasQueries) {
    payload.bundles = prevBundles;
    payload.profile_influence = state.needSet.profile_influence || payload.profile_influence;
    payload.deltas = state.needSet.deltas || payload.deltas;
  }

  state.needSet = payload;
  await emit(state, 'index', 'needset_computed', {
    scope: 'needset',
    total_fields: payload.total_fields,
    summary: payload.summary,
    blockers: payload.blockers,
    focus_fields: payload.focus_fields,
    bundles: payload.bundles,
    profile_mix: payload.profile_mix,
    profile_influence: payload.profile_influence,
    deltas: payload.deltas,
    rows: payload.rows,
    debug: payload.debug,
    round: payload.round,
    identity: payload.identity,
    fields: payload.fields,
    planner_seed: payload.planner_seed,
    schema_version: payload.schema_version,
    needset_size: Array.isArray(payload.fields)
      ? payload.fields.filter((f) => f.state !== 'accepted').length : 0,
  }, ts);
  await writeNeedSet(state, payload);
  await writeRunMeta(state, {
    needset: {
      total_fields: payload.total_fields,
      summary: payload.summary,
      generated_at: payload.generated_at
    }
  });
}

async function handleBrandResolved(state, deps, { ts, row }) {
  await startStage(state, 'search', ts, { trigger: 'brand_resolved' });
  setPhaseCursor(state, 'phase_02_brand_resolver');
  const brandPayload = {
    scope: 'brand',
    brand: String(row.brand || '').trim(),
    status: String(row.status || 'resolved').trim(),
    skip_reason: String(row.skip_reason || '').trim(),
    official_domain: String(row.official_domain || '').trim(),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    support_domain: String(row.support_domain || '').trim(),
    confidence: asFloat(row.confidence, 0),
    candidates: Array.isArray(row.candidates) ? row.candidates.map((c) => ({
      name: String(c?.name || '').trim(),
      confidence: asFloat(c?.confidence, 0),
      evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets : [],
      disambiguation_note: String(c?.disambiguation_note || '').trim(),
    })) : [],
  };
  await emit(state, 'search', 'brand_resolved', brandPayload, ts);
  if (state.specDb && state.runId) {
    try {
      state.specDb.upsertRunArtifact({
        run_id: state.runId,
        artifact_type: 'brand_resolution',
        category: state.context?.category || '',
        payload: brandPayload,
      });
    } catch { /* best-effort */ }
  }
}

async function handleSearchPlanGenerated(state, deps, { ts, row }) {
  await startStage(state, 'search', ts, { trigger: 'search_plan_generated' });
  setPhaseCursor(state, 'phase_04_search_planner');
  await emit(state, 'search', 'search_plan_generated', {
    scope: 'plan',
    pass_index: asInt(row.pass_index, 0),
    pass_name: String(row.pass_name || '').trim(),
    queries_generated: Array.isArray(row.queries_generated) ? row.queries_generated : [],
    stop_condition: String(row.stop_condition || '').trim(),
    plan_rationale: String(row.plan_rationale || '').trim(),
    query_target_map: row.query_target_map && typeof row.query_target_map === 'object' ? row.query_target_map : {},
    missing_critical_fields: Array.isArray(row.missing_critical_fields) ? row.missing_critical_fields : [],
    mode: String(row.mode || '').trim(),
    source: String(row.source || '').trim(),
    enhancement_rows: Array.isArray(row.enhancement_rows) ? row.enhancement_rows : [],
  }, ts);
}

async function handleQueryJourneyCompleted(state, deps, { ts, row }) {
  setPhaseCursor(state, 'phase_05_query_journey');
  // WHY: Populate query_journey data in prefetch so the GUI gate allows
  // search_results bouncy ball only after query journey finishes.
  if (!state.prefetchData) state.prefetchData = {};
  state.prefetchData.query_journey = {
    selected_query_count: asInt(row.selected_query_count, 0),
    selected_queries: Array.isArray(row.selected_queries) ? row.selected_queries : [],
    search_plan_query_count: asInt(row.search_plan_query_count, 0),
    deterministic_query_count: asInt(row.deterministic_query_count, 0),
    rejected_count: asInt(row.rejected_count, 0),
  };
  await emit(state, 'search', 'query_journey_completed', {
    scope: 'journey',
    selected_query_count: asInt(row.selected_query_count, 0),
    selected_queries: Array.isArray(row.selected_queries) ? row.selected_queries : [],
    search_plan_query_count: asInt(row.search_plan_query_count, 0),
    deterministic_query_count: asInt(row.deterministic_query_count, 0),
  }, ts);

}

async function handleSearchResultsCollected(state, deps, { ts, row }) {
  await startStage(state, 'search', ts, { trigger: 'search_results_collected' });
  const originalScope = String(row.scope || '').trim();
  const _screenshotFilename = String(row.screenshot_filename || '').trim();
  await emit(state, 'search', 'search_results_collected', {
    scope: originalScope === 'frontier_cache' ? 'cooldown_skip' : 'query',
    query: String(row.query || '').trim(),
    provider: String(row.provider || '').trim(),
    dedupe_count: asInt(row.dedupe_count, 0),
    ...(_screenshotFilename ? { screenshot_filename: _screenshotFilename } : {}),
    results: Array.isArray(row.results) ? row.results.map((r) => ({
      title: String(r?.title || '').trim(),
      url: String(r?.url || '').trim(),
      domain: String(r?.domain || '').trim(),
      snippet: String(r?.snippet || '').trim(),
      rank: asInt(r?.rank, 0),
      relevance_score: asFloat(r?.relevance_score, 0),
      decision: String(r?.decision || '').trim(),
      reason: String(r?.reason || '').trim(),
      provider: String(r?.provider || '').trim(),
      already_crawled: Boolean(r?.already_crawled),
    })) : [],
  }, ts);
}

async function handleSerpSelectorCompleted(state, deps, { ts, row }) {
  await startStage(state, 'search', ts, { trigger: 'serp_selector_completed' });
  setPhaseCursor(state, 'phase_07_serp_selector');
  await emit(state, 'search', 'serp_selector_completed', {
    scope: 'triage',
    query: String(row.query || '').trim(),
    kept_count: asInt(row.kept_count, 0),
    dropped_count: asInt(row.dropped_count, 0),
    funnel: row.funnel && typeof row.funnel === 'object' ? {
      raw_input: asInt(row.funnel.raw_input, 0),
      hard_drop_count: asInt(row.funnel.hard_drop_count, 0),
      candidates_after_hard_drop: asInt(row.funnel.candidates_after_hard_drop, 0),
      canon_merge_count: asInt(row.funnel.canon_merge_count, 0),
      candidates_classified: asInt(row.funnel.candidates_classified, 0),
      candidates_sent_to_llm: asInt(row.funnel.candidates_sent_to_llm, 0),
      overflow_capped: asInt(row.funnel.overflow_capped, 0),
      llm_model: String(row.funnel.llm_model || '').trim(),
      llm_applied: Boolean(row.funnel.llm_applied),
    } : null,
    candidates: Array.isArray(row.candidates) ? row.candidates.map((c) => ({
      url: String(c?.url || '').trim(),
      title: String(c?.title || '').trim(),
      domain: String(c?.domain || '').trim(),
      snippet: String(c?.snippet || '').trim(),
      score: asFloat(c?.score, 0),
      decision: String(c?.decision || '').trim(),
      rationale: String(c?.rationale || '').trim(),
      score_components: c?.score_components && typeof c.score_components === 'object' ? {
        base_relevance: asFloat(c.score_components.base_relevance, 0),
        tier_boost: asFloat(c.score_components.tier_boost, 0),
        identity_match: asFloat(c.score_components.identity_match, 0),
        penalties: asFloat(c.score_components.penalties, 0),
      } : { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 },
      role: String(c?.role || '').trim(),
      identity_prelim: String(c?.identity_prelim || '').trim(),
      host_trust_class: String(c?.host_trust_class || '').trim(),
      primary_lane: c?.primary_lane ?? null,
      triage_disposition: String(c?.triage_disposition || '').trim(),
      doc_kind_guess: String(c?.doc_kind_guess || '').trim(),
      approval_bucket: String(c?.approval_bucket || '').trim(),
    })) : [],
  }, ts);
}

async function handleDomainsClassified(state, deps, { ts, row }) {
  await startStage(state, 'search', ts, { trigger: 'domains_classified' });
  await emit(state, 'search', 'domains_classified', {
    scope: 'classification',
    classifications: Array.isArray(row.classifications) ? row.classifications.map((cls) => ({
      domain: String(cls?.domain || '').trim(),
      role: String(cls?.role || '').trim(),
      safety_class: String(cls?.safety_class || '').trim(),
      budget_score: asFloat(cls?.budget_score, 0),
      cooldown_remaining: asInt(cls?.cooldown_remaining, 0),
      success_rate: asFloat(cls?.success_rate, 0),
      avg_latency_ms: asInt(cls?.avg_latency_ms, 0),
      fetch_count: asInt(cls?.fetch_count, 0),
      blocked_count: asInt(cls?.blocked_count, 0),
      timeout_count: asInt(cls?.timeout_count, 0),
      last_blocked_ts: cls?.last_blocked_ts ? String(cls.last_blocked_ts).trim() : null,
      notes: String(cls?.notes || '').trim(),
    })) : [],
  }, ts);
}

async function handleEvidenceIndexResult(state, deps, { ts, row }) {
  const dedupeOutcome = String(row.dedupe_outcome || 'unknown').trim();
  const eventKey = dedupeOutcomeToEventKey(dedupeOutcome);
  await emit(state, 'index', eventKey, {
    scope: 'evidence_index',
    url: String(row.url || ''),
    host: String(row.host || ''),
    doc_id: String(row.doc_id || ''),
    dedupe_outcome: dedupeOutcome,
    chunks_indexed: asInt(row.chunks_indexed, 0),
    facts_indexed: asInt(row.facts_indexed, 0),
    snippet_count: asInt(row.snippet_count, 0)
  }, ts);
}


async function handlePhase07PrimeSourcesBuilt(state, deps, { ts, row }) {
  await startStage(state, 'index', ts, { trigger: 'phase07_prime_sources_built' });
  setPhaseCursor(state, 'phase_07_prime_sources');
  await emit(state, 'index', 'phase07_prime_sources_built', {
    scope: 'phase07',
    fields_attempted: asInt(row.fields_attempted, 0),
    fields_with_hits: asInt(row.fields_with_hits, 0),
    fields_satisfied_min_refs: asInt(row.fields_satisfied_min_refs, 0),
    refs_selected_total: asInt(row.refs_selected_total, 0),
    distinct_sources_selected: asInt(row.distinct_sources_selected, 0)
  }, ts);
  await writeRunMeta(state);
}

async function handleRunCompleted(state, deps, { ts, row }) {
  state.status = 'completed';
  state.endedAt = ts;
  state.identityFingerprint = String(row.identity_fingerprint || state.identityFingerprint || '').trim();
  state.identityLockStatus = String(row.identity_lock_status || state.identityLockStatus || '').trim();
  state.dedupeMode = String(row.dedupe_mode || state.dedupeMode || '').trim();
  setPhaseCursor(state, String(row.phase_cursor || '').trim() || 'completed');
  await finishStage(state, 'search', ts, { reason: 'run_completed' });
  await finishStage(state, 'fetch', ts, { reason: 'run_completed' });
  await finishStage(state, 'parse', ts, { reason: 'run_completed' });
  await finishStage(state, 'index', ts, { reason: 'run_completed' });
  await emit(state, 'runtime', 'run_completed', {
    scope: 'run',
    identity_fingerprint: state.identityFingerprint,
    identity_lock_status: state.identityLockStatus,
    dedupe_mode: state.dedupeMode,
    phase_cursor: state.phaseCursor,
    counters: { ...state.counters }
  }, ts);
  await ensureBaselineArtifacts(state, ts);
  await writeRunMeta(state, { status: 'completed', ended_at: ts });
}

// ── Search event handler (discovery_query_started/completed, throttled) ────

async function handleSearchEvent(state, deps, { eventName, ts, row }) {
  await startStage(state, 'search', ts, { trigger: eventName });
  const { searchSlots } = deps;

  if (eventName === 'discovery_query_started') {
    setPhaseCursor(state, 'phase_06_search_results');
    const query = String(row.query || '').trim();
    const provider = String(row.provider || '').trim();
    const queryKey = searchSlots.searchQueryKey(row);
    const slot = searchSlots.allocateSlot(queryKey);
    state.counters.search_workers += 1;
    await recordSearchProfileQuery(state, { query, provider, incrementAttempt: true, ts });
    await emit(state, 'search', 'search_started', {
      scope: 'query', query, provider,
      worker_id: slot.worker_id,
      slot: slot.slot,
      tasks_started: slot.tasks_started,
      is_fallback: Boolean(row.is_fallback),
    }, ts);
  } else if (eventName === 'discovery_query_completed') {
    const query = String(row.query || '').trim();
    const provider = String(row.provider || '').trim();
    const resultCount = asInt(row.result_count, 0);
    const queryKey = searchSlots.searchQueryKey(row);
    const slot = searchSlots.releaseSlot(queryKey);
    await recordSearchProfileQuery(state, { query, provider, resultCount, incrementAttempt: false, ts });
    await emit(state, 'search', 'search_finished', {
      scope: 'query', query, provider,
      result_count: resultCount,
      duration_ms: asInt(row.duration_ms, 0),
      worker_id: slot.worker_id,
      slot: slot.slot,
      tasks_started: slot.tasks_started,
      is_fallback: Boolean(row.is_fallback),
    }, ts);
  } else if (eventName === 'search_request_throttled') {
    const query = String(row.query || '').trim();
    const provider = String(row.provider || '').trim();
    const key = String(row.key || row.host || '').trim();
    const waitMs = Math.max(0, asInt(row.wait_ms ?? row.waited_ms, 0));
    const providedWorkerId = String(row.worker_id || '').trim();
    let searchWorkerId = providedWorkerId;
    if (!searchWorkerId) {
      const queryKey = searchSlots.searchQueryKey(row);
      const letter = searchSlots.getQuerySlot(queryKey);
      const activeSlot = letter ? searchSlots.getSlots().get(letter) : null;
      searchWorkerId = activeSlot ? activeSlot.worker_id : `search-${searchSlots.getSlotLabels()[0] || 'a'}`;
    }
    await emit(state, 'search', 'search_request_throttled', {
      scope: 'query', query, provider, key,
      wait_ms: waitMs,
      worker_id: searchWorkerId
    }, ts);
  }
}

// ── LLM event handler (llm_call_started/completed/failed) ─────────────────

async function handleLlmEvent(state, deps, { eventName, ts, row }) {
  const { llmTracker } = deps;
  const llmEvent = eventName === 'llm_call_started'
    ? 'llm_started'
    : (eventName === 'llm_call_completed' ? 'llm_finished' : 'llm_failed');
  const llmReason = String(row.reason || row.purpose || '').trim();
  const llmRouteRole = inferLlmRouteRole(String(row.route_role || '').trim(), llmReason);
  const llmCallType = classifyLlmCallType(llmReason);
  const llmPrefetchTab = LLM_CALL_TYPE_TAB[llmCallType] || null;
  const llmRound = Math.max(1, asNullableInt(row.round) ?? 1);
  const llmPromptTokens = asNullableInt(row.prompt_tokens);
  const llmCompletionTokens = asNullableInt(row.completion_tokens);
  const llmTotalTokens = asNullableInt(row.total_tokens);
  const llmEstimatedCost = asNullableFloat(row.estimated_cost ?? row.cost_usd);
  const llmDurationMs = asNullableInt(row.duration_ms);
  const llmInputSummary = asNullableText(row.input_summary);
  const llmOutputSummary = asNullableText(row.output_summary);
  if (eventName === 'llm_call_started' && !llmReason && !String(row.model || '').trim()) {
    state._observability.llm_missing_telemetry += 1;
  }
  const llmWorkerId = llmTracker.resolveLlmWorkerId({ row, llmEvent, llmReason });
  const llmCallEntry = llmTracker.getLlmCallMap().get(llmWorkerId);
  const isFallback = Boolean(llmCallEntry?.is_fallback);
  if ((eventName === 'llm_call_completed' || eventName === 'llm_call_failed') && llmWorkerId.includes('orphan')) {
    state._observability.llm_orphan_finish += 1;
  }
  llmTracker.recordLlmAggregate({
    workerId: llmWorkerId, llmEvent,
    callType: llmCallType,
    model: String(row.model || '').trim(),
    promptTokens: llmPromptTokens,
    completionTokens: llmCompletionTokens,
    estimatedCost: llmEstimatedCost
  });
  await emit(state, 'llm', llmEvent, {
    scope: 'call',
    reason: llmReason,
    route_role: llmRouteRole,
    call_type: llmCallType,
    prefetch_tab: llmPrefetchTab,
    round: llmRound,
    model: String(row.model || '').trim(),
    provider: String(row.provider || '').trim(),
    max_tokens_applied: asInt(row.max_tokens_applied, 0),
    prompt_tokens: llmPromptTokens,
    completion_tokens: llmCompletionTokens,
    total_tokens: llmTotalTokens,
    estimated_cost: llmEstimatedCost,
    duration_ms: llmDurationMs,
    input_summary: llmInputSummary,
    output_summary: llmOutputSummary,
    retry_without_schema: Boolean(row.retry_without_schema),
    json_schema_requested: Boolean(row.json_schema_requested),
    prompt_preview: String(row.prompt_preview || '').slice(0, 8000),
    response_preview: String(row.response_preview || '').slice(0, 12000),
    message: String(row.message || '').trim(),
    is_fallback: isFallback,
    is_lab: String(row.access_mode || '').trim() === 'lab',
    worker_id: llmWorkerId
  }, ts);
}

// WHY: search_queued events are emitted by the orchestrator BEFORE Search Execution phase
// starts. They pre-populate search worker slots so the GUI renders all planned
// workers immediately. The bridge must call prePopulateSlots to reserve the
// letter (a, b, c...) before discovery_query_started fires for each query.
async function handleSearchQueued(state, deps, { ts, row }) {
  const { searchSlots } = deps;
  const query = String(row.query || '').trim();
  const provider = String(row.provider || '').trim();
  if (query && searchSlots?.prePopulateSlots) {
    searchSlots.prePopulateSlots([{ query, provider }]);
  }
  await emit(state, 'search', 'search_queued', {
    scope: 'query',
    worker_id: String(row.worker_id || '').trim(),
    slot: String(row.slot || '').trim(),
    query,
    state: 'queued',
  }, ts);
}

async function handleDiscoveryEnqueueSummary(state, deps, { ts, row }) {
  setPhaseCursor(state, 'phase_08_domain_classifier');
  await emit(state, 'search', 'discovery_enqueue_summary', {
    scope: 'enqueue',
    input_selected_count: asInt(row.input_selected_count, 0),
    input_candidate_count: asInt(row.input_candidate_count, 0),
    enqueued_count: asInt(row.enqueued_count, 0),
    overflow_count: asInt(row.overflow_count, 0),
  }, ts);
}

// ── Browser pool warm-up handlers ──────────────────────────────────────────

async function handleBrowserPoolWarming(state, _deps, { row }) {
  state.browserPool = {
    status: 'warming',
    browsers: Number(row.browsers) || 0,
    slots: Number(row.slots) || 0,
    pages_per_browser: Number(row.pages_per_browser) || 1,
  };
  await writeRunMeta(state);
}

async function handleBrowserPoolWarmed(state, _deps, { row }) {
  state.browserPool = {
    ...(state.browserPool || {}),
    status: 'ready',
    browsers: Number(row.browsers) || state.browserPool?.browsers || 0,
    slots: Number(row.slots) || state.browserPool?.slots || 0,
  };
  await writeRunMeta(state);
}

// ── Bootstrap sub-step handler ─────────────────────────────────────────────

async function handleBootstrapStep(state, _deps, { ts, row }) {
  const step = String(row.step || '').trim();
  const progress = Math.max(0, Math.min(100, Number(row.progress) || 0));
  state.bootStep = step;
  state.bootProgress = progress;
  await writeRunMeta(state);
}

async function handlePluginHookCompleted(state, _deps, { ts, row }) {
  await emit(state, 'fetch', 'plugin_hook_completed', {
    scope: 'url',
    plugin: String(row.plugin || 'unknown'),
    hook: String(row.hook || ''),
    worker_id: String(row.worker_id || ''),
    result: row.result ?? null,
  }, ts);
}

async function handleExtractionPluginCompleted(state, _deps, { ts, row }) {
  await emit(state, 'extraction', 'extraction_plugin_completed', {
    scope: 'url',
    plugin: String(row.plugin || 'unknown'),
    worker_id: String(row.worker_id || ''),
    url: String(row.url || ''),
    result: row.result ?? null,
  }, ts);
}

async function handleExtractionPluginFailed(state, _deps, { ts, row }) {
  await emit(state, 'extraction', 'extraction_plugin_failed', {
    scope: 'url',
    reason: String(row.reason || 'unknown'),
    worker_id: String(row.worker_id || ''),
  }, ts);
}

// WHY: Carries artifact filenames emitted after screenshot persistence.
// The extraction builder merges these into matching extraction_plugin_completed entries.
async function handleExtractionArtifactsPersisted(state, _deps, { ts, row }) {
  await emit(state, 'extraction', 'extraction_artifacts_persisted', {
    scope: 'url',
    plugin: String(row.plugin || ''),
    url: String(row.url || ''),
    worker_id: String(row.worker_id || ''),
    filenames: Array.isArray(row.filenames) ? row.filenames : [],
    file_sizes: Array.isArray(row.file_sizes) ? row.file_sizes : [],
  }, ts);
}

// WHY: Crawlee's native stats snapshot — emitted after each batch in runFetchPlan.
// Just re-emit into the bridge event stream so METRICS_HANDLERS can pick it up.
async function handleCrawlerStats(state, deps, { ts, row }) {
  await emit(state, 'fetch', 'crawler_stats', {
    scope: 'run',
    status_codes: row.status_codes && typeof row.status_codes === 'object' ? row.status_codes : {},
    retry_histogram: Array.isArray(row.retry_histogram) ? row.retry_histogram : [],
    top_errors: Array.isArray(row.top_errors) ? row.top_errors : [],
    avg_ok_ms: asInt(row.avg_ok_ms, 0),
    avg_fail_ms: asInt(row.avg_fail_ms, 0),
  }, ts);
}

// ── Event handler registry (table-driven dispatch) ────────────────────────

const EVENT_HANDLERS = new Map([
  ['run_started',                     handleRunStarted],
  ['run_context',                     handleRunContext],
  ['run_completed',                   handleRunCompleted],
  ['search_profile_generated',        handleSearchProfileGenerated],
  ['source_fetch_queued',             handleSourceFetchQueued],
  ['source_fetch_started',            handleSourceFetchStarted],
  ['source_fetch_skipped',            handleSourceFetchSkipped],
  ['source_fetch_retrying',           handleSourceFetchRetrying],
  ['source_fetch_failed',             handleSourceFetchFailed],
  ['source_processed',                handleSourceProcessed],
  ['fields_filled_from_source',       handleFieldsFilledFromSource],
  ['visual_asset_captured',           handleVisualAssetCaptured],
  ['scheduler_fallback_started',      handleSchedulerFallbackStarted],
  ['scheduler_fallback_succeeded',    handleSchedulerFallbackSucceeded],
  ['scheduler_fallback_exhausted',    handleSchedulerFallbackExhausted],
  ['repair_query_enqueued',           handleRepairQueryEnqueued],
  ['repair_search_started',           handleRepairSearchStarted],
  ['repair_search_completed',         handleRepairSearchCompleted],
  ['repair_search_failed',            handleRepairSearchFailed],
  ['url_cooldown_applied',            handleUrlCooldownApplied],
  ['blocked_domain_cooldown_applied', handleBlockedDomainCooldownApplied],
  ['needset_computed',                handleNeedsetComputed],
  ['brand_resolved',                  handleBrandResolved],
  ['search_plan_generated',           handleSearchPlanGenerated],
  ['query_journey_completed',         handleQueryJourneyCompleted],
  ['search_results_collected',        handleSearchResultsCollected],
  ['serp_selector_completed',           handleSerpSelectorCompleted],
  ['domains_classified',              handleDomainsClassified],
  ['evidence_index_result',           handleEvidenceIndexResult],
  ['phase07_prime_sources_built',     handlePhase07PrimeSourcesBuilt],
  ['discovery_enqueue_summary',       handleDiscoveryEnqueueSummary],
  ['search_queued',                   handleSearchQueued],
  ['bootstrap_step',                  handleBootstrapStep],
  ['browser_pool_warming',            handleBrowserPoolWarming],
  ['browser_pool_warmed',             handleBrowserPoolWarmed],
  ['plugin_hook_completed',           handlePluginHookCompleted],
  ['extraction_plugin_completed',     handleExtractionPluginCompleted],
  ['extraction_plugin_failed',        handleExtractionPluginFailed],
  ['extraction_artifacts_persisted',  handleExtractionArtifactsPersisted],
  ['crawler_stats',                   handleCrawlerStats],
]);

const LLM_EVENTS = new Set(['llm_call_started', 'llm_call_completed', 'llm_call_failed']);

// ── Main dispatch function ────────────────────────────────────────────────

export async function dispatchRuntimeEvent(state, deps, row = {}) {
  const ready = await ensureRun(state, row);
  if (!ready) return;
  const runId = normalizeRunId(row);
  if (runId !== state.runId) return;

  const prevCategory = String(state.context.category || '').trim();
  const prevProductId = String(state.context.productId || '').trim();
  const rowCategory = String(row.category || row.cat || '').trim();
  const rowProductId = String(row.productId || row.product_id || '').trim();
  if (rowCategory || rowProductId) {
    state.setContext({
      category: rowCategory || state.context.category || '',
      productId: rowProductId || state.context.productId || ''
    });
  }

  const eventName = String(row.event || '').trim();
  const ts = toIso(row.ts || new Date().toISOString());
  if ((rowCategory && rowCategory !== prevCategory) || (rowProductId && rowProductId !== prevProductId)) {
    await ensureBaselineArtifacts(state, ts);
  }
  const url = String(row.url || row.finalUrl || '').trim();
  if (eventName !== 'run_started') {
    recordStartupMs(state, 'first_event', ts);
  }

  const ctx = { eventName, ts, url, row };

  // Table-driven dispatch
  const handler = EVENT_HANDLERS.get(eventName);
  if (handler) {
    await handler(state, deps, ctx);
  }

  // Search events (multi-match: discovery_query_*, search_provider_*, search_request_throttled)
  if (isSearchEvent(eventName)) {
    await handleSearchEvent(state, deps, ctx);
  }

  // LLM events (multi-match)
  if (LLM_EVENTS.has(eventName)) {
    await handleLlmEvent(state, deps, ctx);
  }

  // Error fallthrough
  if (row.level === 'error' || eventName === 'max_run_seconds_reached') {
    await emit(state, 'error', 'error', {
      event: eventName,
      message: String(row.message || ''),
      url
    }, ts);
  }
}
