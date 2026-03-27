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
  state.eventsPath = path.join(state.runDir, 'run_events.ndjson');
  state.runMetaPath = path.join(state.runDir, 'run.json');
  state.needSetPath = path.join(state.runDir, 'needset.json');
  state.searchProfilePath = path.join(state.runDir, 'search_profile.json');
  state.brandResolutionPath = path.join(state.runDir, 'brand_resolution.json');
  state.runtimeScreencastDir = path.join(state.runDir, 'runtime_screencast');

  if (!isNewRound) {
    state.startedAt = toIso(row.ts || new Date().toISOString());
    await fs.mkdir(state.runDir, { recursive: true });
    await ensureBaselineArtifacts(state, state.startedAt);
    await writeRunMeta(state, {
      status: 'running',
      started_at: state.startedAt
    }, { writeJson: true });
  }

  return true;
}

export async function writeRunMeta(state, extra = {}, { writeJson = false } = {}) {
  if (!state.runId) return;
  const doc = {
    run_id: state.runId || '',
    started_at: state.startedAt || '',
    ended_at: state.endedAt || '',
    status: state.status || 'running',
    category: state.context.category || '',
    product_id: state.context.productId || '',
    s3key: state.context.s3Key || '',
    out_root: state.outRoot,
    events_path: state.eventsPath || '',
    counters: state.counters,
    stages: state.stageState,
    identity_fingerprint: state.identityFingerprint || '',
    identity_lock_status: state.identityLockStatus || '',
    dedupe_mode: state.dedupeMode || '',
    phase_cursor: state.phaseCursor || '',
    boot_step: state.bootStep || '',
    boot_progress: state.bootProgress || 0,
    browser_pool: state.browserPool || null,
    startup_ms: state.startupMs,
    needset: state.needSet
      ? {
        total_fields: asInt(state.needSet.total_fields, 0),
        generated_at: state.needSet.generated_at || null,
        summary: state.needSet.summary || null,
        rows_count: Array.isArray(state.needSet.rows) ? state.needSet.rows.length : 0
      }
      : null,
    search_profile: state.searchProfile
      ? {
        status: String(state.searchProfile.status || '').trim() || 'pending',
        query_count: asInt(
          state.searchProfile.query_count
          ?? state.searchProfile.selected_query_count
          ?? (Array.isArray(state.searchProfile.query_rows) ? state.searchProfile.query_rows.length : 0),
          0
        ),
        generated_at: state.searchProfile.generated_at || null
      }
      : null,
    artifacts: {
      has_needset: Boolean(state.needSet),
      has_search_profile: Boolean(state.searchProfile),
      needset_path: state.needSetPath || '',
      search_profile_path: state.searchProfilePath || '',
      brand_resolution_path: state.brandResolutionPath || ''
    },
    ...extra
  };
  if (writeJson && state.runMetaPath) {
    await fs.writeFile(state.runMetaPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }
  if (state.specDb) {
    try {
      const sqlExtra = {};
      if (doc.run_base) sqlExtra.run_base = doc.run_base;
      if (doc.latest_base) sqlExtra.latest_base = doc.latest_base;
      state.specDb.upsertRun({
        run_id: doc.run_id,
        category: doc.category,
        product_id: doc.product_id,
        status: doc.status,
        started_at: doc.started_at,
        ended_at: doc.ended_at,
        phase_cursor: doc.phase_cursor,
        boot_step: doc.boot_step,
        boot_progress: doc.boot_progress,
        identity_fingerprint: doc.identity_fingerprint,
        identity_lock_status: doc.identity_lock_status,
        dedupe_mode: doc.dedupe_mode,
        s3key: doc.s3key,
        out_root: doc.out_root,
        counters: doc.counters,
        stages: doc.stages,
        startup_ms: doc.startup_ms,
        browser_pool: doc.browser_pool,
        needset_summary: doc.needset,
        search_profile_summary: doc.search_profile,
        artifacts: doc.artifacts,
        extra: sqlExtra,
      });
    } catch { /* best-effort: pipeline continues without SQL run meta */ }
  }
}

export async function writeNeedSet(state, payload = {}) {
  if (!state.needSetPath) return;
  await fs.writeFile(state.needSetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (state.specDb && state.runId) {
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
  if (!state.searchProfilePath) return;
  await fs.writeFile(state.searchProfilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (state.specDb && state.runId) {
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

  if (state.needSetPath) {
    await writeNeedSet(state, state.needSet);
  }
  if (state.searchProfilePath) {
    await writeSearchProfile(state, state.searchProfile);
  }
  if (state.runtimeScreencastDir) {
    await fs.mkdir(state.runtimeScreencastDir, { recursive: true });
  }
}

export function rememberScreencastFrame(state, frame = {}) {
  const workerId = String(frame.worker_id || '').trim();
  const data = String(frame.data || '').trim();
  if (!workerId || !data) return;
  state._lastScreencastFrameByWorker.set(workerId, {
    run_id: state.runId || '',
    worker_id: workerId,
    data,
    width: asInt(frame.width, 0),
    height: asInt(frame.height, 0),
    ts: toIso(frame.ts || new Date().toISOString()),
  });
}

export function runtimeScreencastArtifactPath(state, workerId = '') {
  const normalizedWorkerId = String(workerId || '').trim();
  if (!state.runtimeScreencastDir || !normalizedWorkerId) return '';
  return path.join(state.runtimeScreencastDir, `${normalizedWorkerId}.json`);
}

export async function persistScreencastFrame(state, workerId = '') {
  const normalizedWorkerId = String(workerId || '').trim();
  if (!normalizedWorkerId) return false;
  const frame = state._lastScreencastFrameByWorker.get(normalizedWorkerId);
  if (!frame || !state.runtimeScreencastDir) return false;
  await fs.mkdir(state.runtimeScreencastDir, { recursive: true });
  const artifactPath = runtimeScreencastArtifactPath(state, normalizedWorkerId);
  if (!artifactPath) return false;
  await fs.writeFile(artifactPath, `${JSON.stringify(frame)}\n`, 'utf8');
  return true;
}

export async function persistAllScreencastFrames(state) {
  const workerIds = Array.from(state._lastScreencastFrameByWorker.keys());
  for (const workerId of workerIds) {
    await persistScreencastFrame(state, workerId);
  }
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
  await persistScreencastFrame(state, workerId);
}
