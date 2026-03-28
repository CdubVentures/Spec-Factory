// WHY: File I/O and artifact persistence extracted from runtimeBridge.js
// All functions receive `state` (the bridge instance) as first argument,
// reading/writing its properties directly. This preserves mutation semantics.

import fs from 'node:fs/promises';
import path from 'node:path';
import { toIso, asInt, asFloat, normalizeRunId, normalizeStageStatus } from './runtimeBridgeCoercers.js';
import {
  toNeedSetBaseline, toSearchProfileBaseline, normalizeQueryToken,
  toSearchProfileQueryRow, toSearchProfileQueryCard,
  mergeSearchProfileRows
} from './runtimeBridgePayloads.js';

export async function ensureRun(state, row = {}) {
  const runId = normalizeRunId(row);
  if (!runId) return false;
  if (state.runId === runId && state.runDir) return true;

  const isNewRound = state.runId
    && state.runId !== runId
    && String(row.event || '').trim() === 'run_started';

  if (state.runId && state.runId !== runId && !isNewRound) return false;

  if (isNewRound) {
    state._previousRunIds = state._previousRunIds || [];
    state._previousRunIds.push(state.runId);
  }

  state.runId = runId;
  state.runDir = path.join(state.outRoot, state._previousRunIds?.[0] || runId);
  state.runMetaPath = path.join(state.runDir, 'run.json');

  if (!isNewRound) {
    state.startedAt = toIso(row.ts || new Date().toISOString());
    await fs.mkdir(state.runDir, { recursive: true });
    await ensureBaselineArtifacts(state, state.startedAt);
    await writeRunMeta(state, {
      status: 'running',
      started_at: state.startedAt
    });
  }

  return true;
}

// WHY: Wave 5.5 — slimmed to product-relevant fields only. GUI telemetry
// (stages, startup_ms, browser_pool, needset_summary, search_profile_summary,
// artifacts, boot_step, boot_progress) now captured in run-summary.json at finalize.
// JSON file writes (run.json) eliminated — run-summary.json replaces them.
export async function writeRunMeta(state, extra = {}) {
  if (!state.runId) return;
  if (state.specDb) {
    try {
      state.specDb.upsertRun({
        run_id: state.runId || '',
        category: state.context?.category || '',
        product_id: state.context?.productId || '',
        status: extra.status || state.status || 'running',
        started_at: extra.started_at || state.startedAt || '',
        ended_at: extra.ended_at || state.endedAt || '',
        phase_cursor: state.phaseCursor || '',
        identity_fingerprint: state.identityFingerprint || '',
        identity_lock_status: state.identityLockStatus || '',
        dedupe_mode: state.dedupeMode || '',
        s3key: state.context?.s3Key || '',
        out_root: state.outRoot || '',
        counters: state.counters || {},
      });
    } catch { /* best-effort: pipeline continues without SQL run meta */ }
  }
}

export async function writeNeedSet(state, payload = {}) {
  if (!state.runId) return;
  if (state.specDb) {
    try {
      state.specDb.upsertRunArtifact({
        run_id: state.runId,
        artifact_type: 'needset',
        category: state.context?.category || '',
        payload,
      });
    } catch { /* best-effort */ }
  }
}

export async function writeSearchProfile(state, payload = {}) {
  if (!state.runId) return;
  if (state.specDb) {
    try {
      state.specDb.upsertRunArtifact({
        run_id: state.runId,
        artifact_type: 'search_profile',
        category: state.context?.category || '',
        payload,
      });
    } catch { /* best-effort */ }
  }
}

export async function writeRunSummaryArtifact(state, payload) {
  if (!state.runId) return;
  // WHY: SQL is the sole source for run-summary (Wave 5.5+).
  // File write killed — readers use SQL run_artifacts with fallback to bridge_events.
  if (state.specDb) {
    try {
      state.specDb.upsertRunArtifact({
        run_id: state.runId,
        artifact_type: 'run_summary',
        category: state.context?.category || '',
        payload,
      });
    } catch { /* best-effort */ }
  }
}

function buildNeedSetBaseline(state, ts = '') {
  return toNeedSetBaseline({
    runId: state.runId,
    category: state.context.category || '',
    productId: state.context.productId || '',
    ts: ts || state.startedAt || new Date().toISOString()
  });
}

function buildSearchProfileBaseline(state, ts = '') {
  return toSearchProfileBaseline({
    runId: state.runId,
    category: state.context.category || '',
    productId: state.context.productId || '',
    ts: ts || state.startedAt || new Date().toISOString()
  });
}

export function refreshSearchProfileCollections(state, ts = '') {
  if (!state.searchProfile || typeof state.searchProfile !== 'object') {
    state.searchProfile = buildSearchProfileBaseline(state, ts);
  }
  const rows = Array.isArray(state.searchProfile.query_rows)
    ? state.searchProfile.query_rows
    : [];
  const normalizedRows = rows
    .map((row) => toSearchProfileQueryRow(row))
    .filter((row) => row.query)
    .slice(0, 100);
  state.searchProfile.query_rows = normalizedRows;
  state.searchProfile.query_stats = normalizedRows.map((row) => ({
    query: row.query,
    attempts: row.attempts,
    result_count: row.result_count,
    providers: row.providers
  }));
  state.searchProfile.queries = normalizedRows.map((row) => toSearchProfileQueryCard(row));
  state.searchProfile.query_count = normalizedRows.length;
  state.searchProfile.selected_queries = normalizedRows.map((row) => row.query);
  state.searchProfile.selected_query_count = normalizedRows.length;
  state.searchProfile.generated_at = toIso(ts || state.searchProfile.generated_at || new Date().toISOString());
  // WHY: Preserve caller's status ('planned' from applySearchProfilePlannedPayload,
  // 'executed' from recordSearchProfileQuery). Only default when missing or pending.
  if (!state.searchProfile.status || state.searchProfile.status === 'pending') {
    state.searchProfile.status = normalizedRows.length > 0 ? 'executed' : 'pending';
  }
  state.searchProfile.run_id = state.runId || '';
  state.searchProfile.category = state.context.category || '';
  state.searchProfile.product_id = state.context.productId || '';
}

export async function recordSearchProfileQuery(state, {
  query = '',
  provider = '',
  resultCount = null,
  incrementAttempt = false,
  ts = ''
} = {}) {
  const token = normalizeQueryToken(query);
  if (!token) return false;
  if (!state.searchProfile || typeof state.searchProfile !== 'object') {
    state.searchProfile = buildSearchProfileBaseline(state, ts);
  }
  const rows = Array.isArray(state.searchProfile.query_rows)
    ? state.searchProfile.query_rows
    : [];
  const existing = rows.find((row) => normalizeQueryToken(row?.query || '') === token);
  const row = existing || toSearchProfileQueryRow({
    query: String(query || '').trim(),
    target_fields: [],
    attempts: 0,
    result_count: 0,
    providers: []
  });
  if (!existing) rows.push(row);
  if (incrementAttempt) {
    row.attempts = Math.max(0, asInt(row.attempts, 0)) + 1;
  } else if (asInt(row.attempts, 0) === 0) {
    row.attempts = 1;
  }
  if (resultCount !== null && resultCount !== undefined) {
    row.result_count = Math.max(0, asInt(row.result_count, 0)) + Math.max(0, asInt(resultCount, 0));
  }
  const providerToken = String(provider || '').trim();
  if (providerToken) {
    const providers = Array.isArray(row.providers) ? row.providers : [];
    if (!providers.includes(providerToken)) providers.push(providerToken);
    row.providers = providers.slice(0, 8);
  }
  state.searchProfile.query_rows = rows;
  refreshSearchProfileCollections(state, ts);
  await writeSearchProfile(state, state.searchProfile);
  return true;
}

export function applySearchProfilePlannedPayload(state, payload = {}, ts = '') {
  if (!payload || typeof payload !== 'object') return;
  if (!state.searchProfile || typeof state.searchProfile !== 'object') {
    state.searchProfile = buildSearchProfileBaseline(state, ts);
  }
  const base = payload?.query_rows && Array.isArray(payload.query_rows)
    ? payload.query_rows
    : [];
  const runtimeRows = Array.isArray(state.searchProfile?.query_rows)
    ? state.searchProfile.query_rows
    : [];
  const mergedRows = mergeSearchProfileRows(runtimeRows, base);
  state.searchProfile = {
    ...state.searchProfile,
    ...payload,
    query_rows: mergedRows
  };
  state.searchProfile.generated_at = toIso(ts || state.searchProfile.generated_at || new Date().toISOString());
  state.searchProfile.status = mergedRows.length > 0 ? 'planned' : 'pending';
  refreshSearchProfileCollections(state, ts);
  return true;
}

export async function ensureBaselineArtifacts(state, ts = '') {
  const markerTs = toIso(ts || state.startedAt || new Date().toISOString());
  if (!state.needSet || typeof state.needSet !== 'object') {
    state.needSet = buildNeedSetBaseline(state, markerTs);
  }
  if (!state.searchProfile || typeof state.searchProfile !== 'object') {
    state.searchProfile = buildSearchProfileBaseline(state, markerTs);
  }
  state.needSet.run_id = state.runId || '';
  state.needSet.category = state.context.category || '';
  state.needSet.product_id = state.context.productId || '';
  state.needSet.generated_at = String(state.needSet.generated_at || markerTs).trim() || markerTs;
  state.searchProfile.run_id = state.runId || '';
  state.searchProfile.category = state.context.category || '';
  state.searchProfile.product_id = state.context.productId || '';
  refreshSearchProfileCollections(state, markerTs);

  await writeNeedSet(state, state.needSet);
  await writeSearchProfile(state, state.searchProfile);
}

export async function emit(state, stage, event, payload = {}, ts = '') {
  if (!state.runId) return;
  const row = {
    run_id: state.runId,
    category: state.context.category || '',
    product_id: state.context.productId || '',
    ts: toIso(ts || new Date().toISOString()),
    stage: String(stage || '').trim(),
    event: String(event || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {}
  };
  if (state.specDb) {
    try {
      state.specDb.insertBridgeEvent({
        ...row,
        payload: JSON.stringify(row.payload),
      });
    } catch { /* best-effort: pipeline continues without SQL bridge event */ }
  }
  if (state.onEvent) {
    try {
      state.onEvent(row);
    } catch {
      // ignore callback failures
    }
  }
}

export function extractRuntimeEventPayload(row = {}) {
  if (!row || typeof row !== 'object') {
    return {};
  }

  const nestedPayload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : null;
  if (nestedPayload) {
    return nestedPayload;
  }

  const ignoredKeys = new Set([
    'event',
    'ts',
    'run_id',
    'runId',
    'cat',
    'category',
    'product_id',
    'productId',
    'stage',
    'payload',
    'level',
    'message',
    'url',
    'finalUrl',
    'worker_id',
    'runtime_mode',
    'identity_fingerprint',
    'identity_lock_status',
    'dedupe_mode',
    'phase_cursor'
  ]);

  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !ignoredKeys.has(key))
  );
}

export async function finishFetchUrl(state, {
  url = '',
  ts = '',
  status = 0,
  error = '',
  fetchMs = 0,
  fetcherKind = '',
  hostBudgetScore = 0,
  hostBudgetState = '',
  finalUrl = '',
  contentType = '',
  contentHash = '',
  bytes = 0,
  timeoutRescued = false
} = {}) {
  const started = url ? state.fetchByUrl.get(url) : null;
  const alreadyClosed = url ? state.fetchClosedByUrl.has(url) : false;
  if (!started && alreadyClosed) {
    return;
  }
  if (url) {
    state.fetchByUrl.delete(url);
    state.fetchClosedByUrl.add(url);
  }
  const computedMs = started?.started_at
    ? Math.max(0, Date.parse(toIso(ts)) - Date.parse(toIso(started.started_at)))
    : 0;
  const durationMs = Math.max(0, asInt(fetchMs, 0) || computedMs);
  const statusClass = normalizeStageStatus(status);
  const workerId = started?.worker_id || (url ? state.workerByUrl.get(url) : '') || '';
  if (statusClass === 'ok') state.counters.fetched_ok += 1;
  else if (statusClass === '404') state.counters.fetched_404 += 1;
  else if (statusClass === 'blocked') state.counters.fetched_blocked += 1;
  else state.counters.fetched_error += 1;

  await emit(state, 'fetch', 'fetch_finished', {
    scope: 'url',
    url,
    final_url: String(finalUrl || ''),
    status: asInt(status, 0),
    status_class: statusClass,
    ms: durationMs,
    error,
    fetcher_kind: String(fetcherKind || ''),
    host_budget_score: asFloat(hostBudgetScore, 0),
    host_budget_state: String(hostBudgetState || ''),
    content_type: String(contentType || ''),
    content_hash: String(contentHash || ''),
    bytes: asInt(bytes, 0),
    worker_id: workerId,
    // WHY: Only emit when true — keeps payload clean for non-rescued fetches.
    // The worker pool builder checks this to show 'timeout_rescued' (yellow)
    // instead of 'failed' (red) when the page actually loaded and has data.
    ...(timeoutRescued ? { timeout_rescued: true } : {}),
  }, ts);
}
