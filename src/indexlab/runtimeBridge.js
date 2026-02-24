import fs from 'node:fs/promises';
import path from 'node:path';
import { dedupeOutcomeToEventKey } from '../pipeline/dedupeOutcomeEvent.js';

function toIso(value) {
  const raw = String(value || '').trim();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return new Date().toISOString();
}

function asInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function asFloat(value, fallback = 0) {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return fallback;
}

function normalizeRunId(row = {}) {
  return String(row.runId || row.run_id || '').trim();
}

function normalizeStageStatus(statusCode) {
  const status = asInt(statusCode, 0);
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return '404';
  if (status === 403 || status === 429) return 'blocked';
  if (status >= 300 && status < 400) return 'redirect';
  if (status > 0) return 'error';
  return 'error';
}

function isSearchEvent(name = '') {
  return (
    name.startsWith('discovery_')
    || name.startsWith('search_provider_')
    || name === 'search_provider_diagnostics'
  );
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function inferLlmRouteRole(routeRole = '', reason = '') {
  const explicit = String(routeRole || '').trim().toLowerCase();
  if (['plan', 'extract', 'validate', 'write'].includes(explicit)) {
    return explicit;
  }
  const token = String(reason || '').trim().toLowerCase();
  if (!token) return '';
  if (token.includes('extract')) return 'extract';
  if (token.includes('validate') || token.includes('verify')) return 'validate';
  if (token.includes('write') || token.includes('summary')) return 'write';
  if (
    token.includes('planner')
    || token.includes('search_profile')
    || token.includes('searchprofile')
    || token.includes('triage')
    || token.includes('rerank')
  ) {
    return 'plan';
  }
  return '';
}

function toNeedSetSnapshot(row = {}, ts = '') {
  const safeTs = toIso(ts || row.ts || new Date().toISOString());
  const identityLockState = row.identity_lock_state && typeof row.identity_lock_state === 'object'
    ? row.identity_lock_state
    : {};
  const identityAuditRows = Array.isArray(row.identity_audit_rows)
    ? row.identity_audit_rows
    : [];
  const payload = {
    run_id: String(row.runId || row.run_id || '').trim(),
    category: String(row.category || row.cat || '').trim(),
    product_id: String(row.productId || row.product_id || '').trim(),
    generated_at: safeTs,
    total_fields: asInt(row.total_fields, 0),
    needset_size: asInt(row.needset_size ?? row.size, 0),
    identity_lock_state: {
      status: String(identityLockState.status || '').trim(),
      confidence: Number.parseFloat(String(identityLockState.confidence ?? 0)) || 0,
      identity_gate_validated: Boolean(identityLockState.identity_gate_validated),
      extraction_gate_open: Boolean(identityLockState.extraction_gate_open),
      family_model_count: asInt(identityLockState.family_model_count, 0),
      ambiguity_level: String(identityLockState.ambiguity_level || '').trim() || 'unknown',
      publishable: Boolean(identityLockState.publishable),
      publish_blockers: Array.isArray(identityLockState.publish_blockers) ? identityLockState.publish_blockers : [],
      reason_codes: Array.isArray(identityLockState.reason_codes) ? identityLockState.reason_codes : [],
      page_count: asInt(identityLockState.page_count, 0),
      max_match_score: Number.parseFloat(String(identityLockState.max_match_score ?? 0)) || 0,
      updated_at: String(identityLockState.updated_at || safeTs).trim() || safeTs
    },
    identity_audit_rows: identityAuditRows.slice(0, 60),
    reason_counts: toObject(row.reason_counts),
    required_level_counts: toObject(row.required_level_counts),
    needs: Array.isArray(row.needs) ? row.needs : [],
    snapshots: Array.isArray(row.snapshots) ? row.snapshots : []
  };
  if (payload.snapshots.length === 0) {
    payload.snapshots = [{ ts: safeTs, needset_size: payload.needset_size }];
  }
  return payload;
}

function toNeedSetBaseline({
  runId = '',
  category = '',
  productId = '',
  ts = ''
} = {}) {
  const generatedAt = toIso(ts || new Date().toISOString());
  return {
    run_id: String(runId || '').trim(),
    category: String(category || '').trim(),
    product_id: String(productId || '').trim(),
    generated_at: generatedAt,
    total_fields: 0,
    needset_size: 0,
    field_count: 0,
    pending_fields: 0,
    unresolved_fields: 0,
    reason_counts: {},
    required_level_counts: {},
    identity_lock_state: {
      status: 'unlocked',
      confidence: 0,
      identity_gate_validated: false,
      extraction_gate_open: false,
      family_model_count: 0,
      ambiguity_level: 'unknown',
      publishable: false,
      publish_blockers: [],
      reason_codes: [],
      page_count: 0,
      max_match_score: 0,
      updated_at: generatedAt
    },
    identity_audit_rows: [],
    needs: [],
    snapshots: [{ ts: generatedAt, needset_size: 0 }],
    status: 'pending',
    source: 'runtime_bridge_baseline'
  };
}

function normalizeQueryToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function pickSearchQueryFromUrl(rawUrl = '') {
  const token = String(rawUrl || '').trim();
  if (!token) return '';
  try {
    const parsed = new URL(token);
    const keys = ['q', 'query', 'search', 'k', 'keyword', 'keywords', 'ntt', 'wd', 'term'];
    for (const key of keys) {
      const value = String(parsed.searchParams.get(key) || '').trim();
      if (!value) continue;
      return value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch {
    return '';
  }
  return '';
}

function toSearchProfileBaseline({
  runId = '',
  category = '',
  productId = '',
  ts = ''
} = {}) {
  return {
    run_id: String(runId || '').trim(),
    category: String(category || '').trim(),
    product_id: String(productId || '').trim(),
    generated_at: toIso(ts || new Date().toISOString()),
    status: 'pending',
    provider: '',
    llm_query_planning: false,
    llm_query_model: '',
    llm_queries: [],
    identity_aliases: [],
    focus_fields: [],
    variant_guard_terms: [],
    query_reject_log: [],
    alias_reject_log: [],
    query_guard: {
      brand_tokens: [],
      model_tokens: [],
      required_digit_groups: [],
      accepted_query_count: 0,
      rejected_query_count: 0
    },
    query_count: 0,
    selected_query_count: 0,
    selected_queries: [],
    query_rows: [],
    query_stats: [],
    queries: [],
    source: 'runtime_bridge_baseline'
  };
}

function toSearchProfileQueryRow(entry = {}) {
  return {
    query: String(entry.query || '').trim(),
    target_fields: Array.isArray(entry.target_fields)
      ? entry.target_fields.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    attempts: Math.max(0, asInt(entry.attempts, 0)),
    result_count: Math.max(0, asInt(entry.result_count, 0)),
    providers: Array.isArray(entry.providers)
      ? entry.providers.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    hint_source: String(entry.hint_source || '').trim(),
    doc_hint: String(entry.doc_hint || '').trim(),
    domain_hint: String(entry.domain_hint || '').trim(),
    source_host: String(entry.source_host || '').trim(),
    __from_plan_profile: Boolean(entry.__from_plan_profile)
  };
}

function toSearchProfileQueryCard(entry = {}) {
  const row = toSearchProfileQueryRow(entry);
  return {
    query: row.query,
    hint_source: row.hint_source || 'runtime_bridge',
    target_fields: row.target_fields,
    doc_hint: row.doc_hint,
    domain_hint: row.domain_hint,
    source_host: row.source_host,
    result_count: row.result_count,
    attempts: row.attempts,
    providers: row.providers,
    candidate_count: 0,
    selected_count: 0,
    candidates: []
  };
}

async function appendNdjson(filePath, row) {
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function isRuntimeSource(source = '') {
  return String(source || '')
    .trim()
    .toLowerCase()
    .startsWith('runtime_bridge');
}

function mergeSearchProfileRows(runtimeRows = [], plannedRows = []) {
  const toLookup = (rows = []) => {
    const lookup = new Map();
    for (const row of rows) {
      const normalized = String(row?.query || '').trim().toLowerCase();
      if (!normalized || lookup.has(normalized)) continue;
      lookup.set(normalized, toSearchProfileQueryRow(row));
    }
    return lookup;
  };
  const runtimeLookup = toLookup(runtimeRows);
  const planLookup = toLookup(plannedRows);
  const mergedRows = [];
  const seen = new Set();
  for (const [normalized, runtimeRow] of runtimeLookup.entries()) {
    const planRow = planLookup.get(normalized);
    const merged = {
      ...runtimeRow,
      ...planRow
    };
    merged.query = String(runtimeRow.query || planRow?.query || '').trim();
    merged.attempts = Math.max(asInt(runtimeRow.attempts, 0), asInt(planRow?.attempts, 0));
    merged.result_count = Math.max(asInt(runtimeRow.result_count, 0), asInt(planRow?.result_count, 0));
    merged.providers = [
      ...(Array.isArray(planRow?.providers) ? planRow.providers : []),
      ...(Array.isArray(runtimeRow.providers) ? runtimeRow.providers : [])
    ].filter((value, index, self) => Boolean(value) && self.indexOf(value) === index).slice(0, 8);
    merged.__from_plan_profile = Boolean(planRow);

    if (merged.hint_source) {
      if (isRuntimeSource(merged.hint_source) && planRow?.hint_source) {
        merged.hint_source = String(planRow.hint_source || '').trim();
      }
    } else {
      merged.hint_source = String(planRow?.hint_source || '').trim();
    }
    if (!merged.doc_hint) merged.doc_hint = String(planRow?.doc_hint || '').trim();
    if (!merged.domain_hint) merged.domain_hint = String(planRow?.domain_hint || '').trim();
    if (!merged.source_host) merged.source_host = String(planRow?.source_host || '').trim();
    if ((!merged.target_fields || merged.target_fields.length === 0) && Array.isArray(planRow?.target_fields)) {
      merged.target_fields = [...planRow.target_fields];
    }
    if (isRuntimeSource(merged.hint_source)) {
      merged.hint_source = String(planRow?.hint_source || merged.hint_source).trim() || 'runtime_bridge';
    }
    mergedRows.push(merged);
    seen.add(normalized);
  }
  for (const [normalized, planRow] of planLookup.entries()) {
    if (seen.has(normalized)) continue;
    mergedRows.push({
      ...planRow,
      __from_plan_profile: true
    });
    seen.add(normalized);
  }
  return mergedRows
    .map((row) => toSearchProfileQueryRow(row))
    .filter((row) => row.query)
    .slice(0, 220);
}

export class IndexLabRuntimeBridge {
  constructor({ outRoot = 'artifacts/indexlab', context = {}, onEvent = null } = {}) {
    this.outRoot = path.resolve(String(outRoot || 'artifacts/indexlab'));
    this.context = { ...(context || {}) };
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.screencastTarget = '';

    this.runId = '';
    this.runDir = '';
    this.eventsPath = '';
    this.runMetaPath = '';
    this.needSetPath = '';
    this.searchProfilePath = '';
    this.brandResolutionPath = '';
    this.startedAt = '';
    this.endedAt = '';
    this.status = 'running';
    this.needSet = null;
    this.searchProfile = null;
    this.identityFingerprint = '';
    this.identityLockStatus = '';
    this.dedupeMode = '';
    this.phaseCursor = 'phase_00_bootstrap';
    this.startupMs = {
      first_event: null,
      search_started: null,
      fetch_started: null,
      parse_started: null,
      index_started: null
    };

    this.stageState = {
      search: { started_at: '', ended_at: '' },
      fetch: { started_at: '', ended_at: '' },
      parse: { started_at: '', ended_at: '' },
      index: { started_at: '', ended_at: '' }
    };
    this.fetchByUrl = new Map();
    this.workerByUrl = new Map();
    this.queue = Promise.resolve();
    this.counters = {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
      search_workers: 0
    };
  }

  setContext(next = {}) {
    this.context = {
      ...this.context,
      ...next
    };
  }

  _setPhaseCursor(next = '') {
    const token = String(next || '').trim();
    if (!token || token === this.phaseCursor) {
      return false;
    }
    this.phaseCursor = token;
    return true;
  }

  _recordStartupMs(name, ts = '') {
    if (!Object.prototype.hasOwnProperty.call(this.startupMs, name)) {
      return false;
    }
    if (this.startupMs[name] !== null) {
      return false;
    }
    const startMs = Date.parse(String(this.startedAt || ''));
    const pointMs = Date.parse(String(ts || ''));
    if (!Number.isFinite(startMs) || !Number.isFinite(pointMs)) {
      return false;
    }
    this.startupMs[name] = Math.max(0, pointMs - startMs);
    return true;
  }

  onRuntimeEvent(row = {}) {
    this.queue = this.queue
      .then(() => this._handleRuntimeEvent(row))
      .catch(() => {});
  }

  async finalize(summary = {}) {
    this.queue = this.queue
      .then(async () => {
        const endedAt = toIso(summary?.ended_at || summary?.endedAt || new Date().toISOString());
        this.endedAt = endedAt;
        if (summary?.status) {
          this.status = String(summary.status);
        } else if (!this.status) {
          this.status = 'completed';
        }
        await this._finishStage('search', endedAt, { reason: 'run_finalize' });
        await this._finishStage('fetch', endedAt, { reason: 'run_finalize' });
        await this._finishStage('parse', endedAt, { reason: 'run_finalize' });
        await this._finishStage('index', endedAt, { reason: 'run_finalize' });
        this._setPhaseCursor(String(summary?.phase_cursor || '').trim() || 'completed');
        await this._ensureBaselineArtifacts(endedAt);
        await this._writeRunMeta({
          ...summary,
          status: this.status,
          ended_at: endedAt
        });
        this.fetchByUrl.clear();
        this.workerByUrl.clear();
      })
      .catch(() => {});
    await this.queue;
  }

  broadcastScreencastFrame(frame = {}) {
    if (!this.onEvent) return;
    const target = this.screencastTarget;
    if (target && target !== '*' && target !== String(frame.worker_id || '')) return;
    this.onEvent({
      __screencast: true,
      channel: `screencast-${frame.worker_id || ''}`,
      worker_id: String(frame.worker_id || ''),
      data: frame.data || '',
      width: frame.width || 0,
      height: frame.height || 0,
      ts: frame.ts || new Date().toISOString(),
    });
  }

  async _ensureRun(row = {}) {
    const runId = normalizeRunId(row);
    if (!runId) return false;
    if (this.runId === runId && this.runDir) return true;

    const isNewRound = this.runId
      && this.runId !== runId
      && String(row.event || '').trim() === 'run_started';

    if (this.runId && this.runId !== runId && !isNewRound) return false;

    if (isNewRound) {
      this._previousRunIds = this._previousRunIds || [];
      this._previousRunIds.push(this.runId);
    }

    this.runId = runId;
    this.runDir = path.join(this.outRoot, this._previousRunIds?.[0] || runId);
    this.eventsPath = path.join(this.runDir, 'run_events.ndjson');
    this.runMetaPath = path.join(this.runDir, 'run.json');
    this.needSetPath = path.join(this.runDir, 'needset.json');
    this.searchProfilePath = path.join(this.runDir, 'search_profile.json');
    this.brandResolutionPath = path.join(this.runDir, 'brand_resolution.json');

    if (!isNewRound) {
      this.startedAt = toIso(row.ts || new Date().toISOString());
      await fs.mkdir(this.runDir, { recursive: true });
      await this._ensureBaselineArtifacts(this.startedAt);
      await this._writeRunMeta({
        status: 'running',
        started_at: this.startedAt
      });
    }

    return true;
  }

  async _writeRunMeta(extra = {}) {
    if (!this.runMetaPath) return;
    const doc = {
      run_id: this.runId || '',
      started_at: this.startedAt || '',
      ended_at: this.endedAt || '',
      status: this.status || 'running',
      category: this.context.category || '',
      product_id: this.context.productId || '',
      s3key: this.context.s3Key || '',
      out_root: this.outRoot,
      events_path: this.eventsPath || '',
      counters: this.counters,
      stages: this.stageState,
      identity_fingerprint: this.identityFingerprint || '',
      identity_lock_status: this.identityLockStatus || '',
      dedupe_mode: this.dedupeMode || '',
      phase_cursor: this.phaseCursor || '',
      startup_ms: this.startupMs,
      needset: this.needSet
        ? {
          needset_size: asInt(this.needSet.needset_size, 0),
          total_fields: asInt(this.needSet.total_fields, 0),
          generated_at: this.needSet.generated_at || null,
          identity_lock_state: this.needSet.identity_lock_state || null
        }
        : null,
      search_profile: this.searchProfile
        ? {
          status: String(this.searchProfile.status || '').trim() || 'pending',
          query_count: asInt(
            this.searchProfile.query_count
            ?? this.searchProfile.selected_query_count
            ?? (Array.isArray(this.searchProfile.query_rows) ? this.searchProfile.query_rows.length : 0),
            0
          ),
          generated_at: this.searchProfile.generated_at || null
        }
        : null,
      artifacts: {
        has_needset: Boolean(this.needSet),
        has_search_profile: Boolean(this.searchProfile),
        needset_path: this.needSetPath || '',
        search_profile_path: this.searchProfilePath || '',
        brand_resolution_path: this.brandResolutionPath || ''
      },
      ...extra
    };
    await fs.writeFile(this.runMetaPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }

  async _writeNeedSet(payload = {}) {
    if (!this.needSetPath) return;
    await fs.writeFile(this.needSetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  _buildNeedSetBaseline(ts = '') {
    return toNeedSetBaseline({
      runId: this.runId,
      category: this.context.category || '',
      productId: this.context.productId || '',
      ts: ts || this.startedAt || new Date().toISOString()
    });
  }

  _buildSearchProfileBaseline(ts = '') {
    return toSearchProfileBaseline({
      runId: this.runId,
      category: this.context.category || '',
      productId: this.context.productId || '',
      ts: ts || this.startedAt || new Date().toISOString()
    });
  }

  async _writeSearchProfile(payload = {}) {
    if (!this.searchProfilePath) return;
    await fs.writeFile(this.searchProfilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  _refreshSearchProfileCollections(ts = '') {
    if (!this.searchProfile || typeof this.searchProfile !== 'object') {
      this.searchProfile = this._buildSearchProfileBaseline(ts);
    }
    const rows = Array.isArray(this.searchProfile.query_rows)
      ? this.searchProfile.query_rows
      : [];
    const normalizedRows = rows
      .map((row) => toSearchProfileQueryRow(row))
      .filter((row) => row.query)
      .slice(0, 100);
    this.searchProfile.query_rows = normalizedRows;
    this.searchProfile.query_stats = normalizedRows.map((row) => ({
      query: row.query,
      attempts: row.attempts,
      result_count: row.result_count,
      providers: row.providers
    }));
    this.searchProfile.queries = normalizedRows.map((row) => toSearchProfileQueryCard(row));
    this.searchProfile.query_count = normalizedRows.length;
    this.searchProfile.selected_queries = normalizedRows.map((row) => row.query);
    this.searchProfile.selected_query_count = normalizedRows.length;
    this.searchProfile.generated_at = toIso(ts || this.searchProfile.generated_at || new Date().toISOString());
    this.searchProfile.status = normalizedRows.length > 0 ? 'executed' : 'pending';
    this.searchProfile.run_id = this.runId || '';
    this.searchProfile.category = this.context.category || '';
    this.searchProfile.product_id = this.context.productId || '';
  }

  async _recordSearchProfileQuery({
    query = '',
    provider = '',
    resultCount = null,
    incrementAttempt = false,
    ts = ''
  } = {}) {
    const token = normalizeQueryToken(query);
    if (!token) return false;
    if (!this.searchProfile || typeof this.searchProfile !== 'object') {
      this.searchProfile = this._buildSearchProfileBaseline(ts);
    }
    const rows = Array.isArray(this.searchProfile.query_rows)
      ? this.searchProfile.query_rows
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
    this.searchProfile.query_rows = rows;
    this._refreshSearchProfileCollections(ts);
    await this._writeSearchProfile(this.searchProfile);
    return true;
  }

  _applySearchProfilePlannedPayload(payload = {}, ts = '') {
    if (!payload || typeof payload !== 'object') return;
    if (!this.searchProfile || typeof this.searchProfile !== 'object') {
      this.searchProfile = this._buildSearchProfileBaseline(ts);
    }
    const base = payload?.query_rows && Array.isArray(payload.query_rows)
      ? payload.query_rows
      : [];
    const runtimeRows = Array.isArray(this.searchProfile?.query_rows)
      ? this.searchProfile.query_rows
      : [];
    const mergedRows = mergeSearchProfileRows(runtimeRows, base);
    this.searchProfile = {
      ...this.searchProfile,
      ...payload,
      query_rows: mergedRows
    };
    this.searchProfile.generated_at = toIso(ts || this.searchProfile.generated_at || new Date().toISOString());
    this.searchProfile.status = mergedRows.length > 0 ? 'planned' : 'pending';
    this._refreshSearchProfileCollections(ts);
    return true;
  }

  async _ensureBaselineArtifacts(ts = '') {
    const markerTs = toIso(ts || this.startedAt || new Date().toISOString());
    if (!this.needSet || typeof this.needSet !== 'object') {
      this.needSet = this._buildNeedSetBaseline(markerTs);
    }
    if (!this.searchProfile || typeof this.searchProfile !== 'object') {
      this.searchProfile = this._buildSearchProfileBaseline(markerTs);
    }
    this.needSet.run_id = this.runId || '';
    this.needSet.category = this.context.category || '';
    this.needSet.product_id = this.context.productId || '';
    this.needSet.generated_at = String(this.needSet.generated_at || markerTs).trim() || markerTs;
    this.searchProfile.run_id = this.runId || '';
    this.searchProfile.category = this.context.category || '';
    this.searchProfile.product_id = this.context.productId || '';
    this._refreshSearchProfileCollections(markerTs);

    if (this.needSetPath) {
      await this._writeNeedSet(this.needSet);
    }
    if (this.searchProfilePath) {
      await this._writeSearchProfile(this.searchProfile);
    }
  }

  async _emit(stage, event, payload = {}, ts = '') {
    if (!this.eventsPath || !this.runId) return;
    const row = {
      run_id: this.runId,
      category: this.context.category || '',
      product_id: this.context.productId || '',
      ts: toIso(ts || new Date().toISOString()),
      stage: String(stage || '').trim(),
      event: String(event || '').trim(),
      payload: payload && typeof payload === 'object' ? payload : {}
    };
    await appendNdjson(this.eventsPath, row);
    if (this.onEvent) {
      try {
        this.onEvent(row);
      } catch {
        // ignore callback failures
      }
    }
  }

  _extractRuntimeEventPayload(row = {}) {
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
      'run_profile',
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

  async _startStage(stage, ts = '', payload = {}) {
    const state = this.stageState[stage];
    if (!state || state.started_at) return;
    state.started_at = toIso(ts || new Date().toISOString());
    const startupKeyByStage = {
      search: 'search_started',
      fetch: 'fetch_started',
      parse: 'parse_started',
      index: 'index_started'
    };
    const phaseByStage = {
      search: 'phase_02_search',
      fetch: 'phase_05_fetch',
      parse: 'phase_06_parse',
      index: 'phase_06_index'
    };
    const startupKey = startupKeyByStage[stage];
    if (startupKey) {
      this._recordStartupMs(startupKey, state.started_at);
    }
    const phaseCursorUpdated = this._setPhaseCursor(phaseByStage[stage] || '');
    await this._emit(stage, `${stage}_started`, { scope: 'stage', ...payload }, state.started_at);
    if (startupKey || phaseCursorUpdated) {
      await this._writeRunMeta();
    }
  }

  async _finishStage(stage, ts = '', payload = {}) {
    const state = this.stageState[stage];
    if (!state || !state.started_at || state.ended_at) return;
    state.ended_at = toIso(ts || new Date().toISOString());
    await this._emit(stage, `${stage}_finished`, { scope: 'stage', ...payload }, state.ended_at);
  }

  async _handleRuntimeEvent(row = {}) {
    const ready = await this._ensureRun(row);
    if (!ready) return;
    const runId = normalizeRunId(row);
    if (runId !== this.runId) return;

    const prevCategory = String(this.context.category || '').trim();
    const prevProductId = String(this.context.productId || '').trim();
    const rowCategory = String(row.category || row.cat || '').trim();
    const rowProductId = String(row.productId || row.product_id || '').trim();
    if (rowCategory || rowProductId) {
      this.setContext({
        category: rowCategory || this.context.category || '',
        productId: rowProductId || this.context.productId || ''
      });
    }

    const eventName = String(row.event || '').trim();
    const ts = toIso(row.ts || new Date().toISOString());
    if ((rowCategory && rowCategory !== prevCategory) || (rowProductId && rowProductId !== prevProductId)) {
      await this._ensureBaselineArtifacts(ts);
    }
    const url = String(row.url || row.finalUrl || '').trim();
    if (eventName !== 'run_started') {
      this._recordStartupMs('first_event', ts);
    }

    if (eventName === 'run_started') {
      this.startedAt = ts;
      this.setContext({
        category: row.category || row.cat || this.context.category || '',
        productId: row.productId || row.product_id || this.context.productId || ''
      });
      this._setPhaseCursor('phase_00_bootstrap');
      await this._ensureBaselineArtifacts(ts);
      // Mark the run as active immediately so GUI activity panels do not appear stalled
      // while discovery planning/setup is still running before first fetch.
      await this._startStage('search', ts, { trigger: 'run_started' });
    }

    if (eventName === 'run_context') {
      this.identityFingerprint = String(row.identity_fingerprint || this.identityFingerprint || '').trim();
      this.identityLockStatus = String(row.identity_lock_status || this.identityLockStatus || '').trim();
      this.dedupeMode = String(row.dedupe_mode || this.dedupeMode || '').trim();
      const phaseCursor = String(row.phase_cursor || '').trim();
      if (phaseCursor) {
        this._setPhaseCursor(phaseCursor);
      }
      await this._emit('runtime', 'run_context', {
        scope: 'run',
        run_profile: String(row.run_profile || '').trim(),
        runtime_mode: String(row.runtime_mode || '').trim(),
        identity_fingerprint: this.identityFingerprint,
        identity_lock_status: this.identityLockStatus,
        dedupe_mode: this.dedupeMode,
        phase_cursor: this.phaseCursor
      }, ts);
      await this._writeRunMeta();
    }

    if (eventName === 'search_profile_generated') {
      this._setPhaseCursor('phase_02_search_profile');
      const payload = this._extractRuntimeEventPayload(row);
      const applied = this._applySearchProfilePlannedPayload(payload, ts);
      if (applied) {
        await this._writeSearchProfile(this.searchProfile);
      }
    }

    if (isSearchEvent(eventName)) {
      await this._startStage('search', ts, { trigger: eventName });
      if (eventName === 'discovery_query_started') {
        const query = String(row.query || '').trim();
        const provider = String(row.provider || '').trim();
        this.counters.search_workers += 1;
        const searchWorkerId = 'search-' + this.counters.search_workers;
        await this._recordSearchProfileQuery({
          query,
          provider,
          incrementAttempt: true,
          ts
        });
        await this._emit('search', 'search_started', {
          scope: 'query',
          query,
          provider,
          worker_id: searchWorkerId
        }, ts);
      } else if (eventName === 'discovery_query_completed') {
        const query = String(row.query || '').trim();
        const provider = String(row.provider || '').trim();
        const resultCount = asInt(row.result_count, 0);
        this.counters.search_workers += 1;
        const searchWorkerId = 'search-' + this.counters.search_workers;
        await this._recordSearchProfileQuery({
          query,
          provider,
          resultCount,
          incrementAttempt: false,
          ts
        });
        await this._emit('search', 'search_finished', {
          scope: 'query',
          query,
          provider,
          result_count: resultCount,
          duration_ms: asInt(row.duration_ms, 0),
          worker_id: searchWorkerId
        }, ts);
      }
    }

    if (eventName === 'source_fetch_started') {
      await this._startStage('fetch', ts, { trigger: eventName });
      if (this.stageState.search.started_at && !this.stageState.search.ended_at) {
        await this._finishStage('search', ts, { reason: 'first_fetch_started' });
      }
      const searchQuery = pickSearchQueryFromUrl(url);
      if (searchQuery) {
        await this._recordSearchProfileQuery({
          query: searchQuery,
          provider: String(row.provider || '').trim() || 'url_signal',
          incrementAttempt: true,
          ts
        });
      }
      if (url) {
        this.counters.pages_checked += 1;
        const workerId = 'fetch-' + this.counters.pages_checked;
        this.fetchByUrl.set(url, { started_at: ts, worker_id: workerId });
        this.workerByUrl.set(url, workerId);
      }
      await this._emit('fetch', 'fetch_started', {
        scope: 'url',
        url,
        host: String(row.host || ''),
        tier: asInt(row.tier, 0),
        role: String(row.role || ''),
        fetcher_kind: String(row.fetcher_kind || ''),
        host_budget_score: asFloat(row.host_budget_score, 0),
        host_budget_state: String(row.host_budget_state || ''),
        worker_id: url ? this.workerByUrl.get(url) || '' : ''
      }, ts);
    }

    if (eventName === 'source_fetch_skipped') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._emit('fetch', 'fetch_skipped', {
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

    if (eventName === 'source_fetch_failed') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._finishFetchUrl({
        url,
        ts,
        status: 0,
        error: String(row.message || ''),
        fetchMs: asInt(row.fetch_ms, 0),
        fetcherKind: String(row.fetcher_kind || ''),
        hostBudgetScore: asFloat(row.host_budget_score, 0),
        hostBudgetState: String(row.host_budget_state || ''),
        finalUrl: String(row.final_url || ''),
        contentType: String(row.content_type || ''),
        contentHash: String(row.content_hash || ''),
        bytes: asInt(row.bytes, 0)
      });
    }

    if (eventName === 'source_processed') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._startStage('parse', ts, { trigger: eventName });
      await this._startStage('index', ts, { trigger: eventName });

      const status = asInt(row.status, 0);
      await this._finishFetchUrl({
        url,
        ts,
        status,
        fetchMs: asInt(row.fetch_ms, 0),
        fetcherKind: String(row.fetcher_kind || ''),
        hostBudgetScore: asFloat(row.host_budget_score, 0),
        hostBudgetState: String(row.host_budget_state || ''),
        finalUrl: String(row.final_url || ''),
        contentType: String(row.content_type || ''),
        contentHash: String(row.content_hash || ''),
        bytes: asInt(row.bytes, 0)
      });

      this.counters.parse_completed += 1;
      await this._emit('parse', 'parse_finished', {
        scope: 'url',
        url,
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
        worker_id: url ? this.workerByUrl.get(url) || '' : ''
      }, ts);
    }

    if (eventName === 'fields_filled_from_source') {
      await this._startStage('index', ts, { trigger: eventName });
      const count = asInt(row.count, 0);
      this.counters.indexed_docs += 1;
      this.counters.fields_filled += Math.max(0, count);
      await this._emit('index', 'index_finished', {
        scope: 'url',
        url,
        count,
        filled_fields: Array.isArray(row.filled_fields) ? row.filled_fields : [],
        worker_id: url ? this.workerByUrl.get(url) || '' : ''
      }, ts);
    }

    if (eventName === 'visual_asset_captured') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._emit('fetch', 'visual_asset_captured', {
        scope: 'url',
        url,
        screenshot_uri: String(row.screenshot_uri || '').trim(),
        quality_score: asFloat(row.quality_score, 0),
        width: asInt(row.width, 0),
        height: asInt(row.height, 0),
        format: String(row.format || '').trim(),
        bytes: asInt(row.bytes, 0),
        capture_ms: asInt(row.capture_ms, 0),
        worker_id: url ? this.workerByUrl.get(url) || '' : ''
      }, ts);
    }

    if (eventName === 'scheduler_fallback_started') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._emit('fetch', 'scheduler_fallback_started', {
        scope: 'url',
        url,
        from_mode: String(row.from_mode || '').trim(),
        to_mode: String(row.to_mode || '').trim(),
        outcome: String(row.outcome || '').trim(),
        attempt: asInt(row.attempt, 0)
      }, ts);
    }

    if (eventName === 'scheduler_fallback_succeeded') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._emit('fetch', 'scheduler_fallback_succeeded', {
        scope: 'url',
        url,
        mode: String(row.mode || '').trim(),
        attempt: asInt(row.attempt, 0),
        from_mode: String(row.from_mode || '').trim()
      }, ts);
    }

    if (eventName === 'scheduler_fallback_exhausted') {
      await this._startStage('fetch', ts, { trigger: eventName });
      await this._emit('fetch', 'scheduler_fallback_exhausted', {
        scope: 'url',
        url,
        modes_tried: Array.isArray(row.modes_tried) ? row.modes_tried : [],
        final_outcome: String(row.final_outcome || '').trim()
      }, ts);
    }

    if (eventName === 'repair_query_enqueued') {
      await this._emit('scheduler', 'repair_query_enqueued', {
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

    if (eventName === 'url_cooldown_applied') {
      await this._emit('scheduler', 'url_cooldown_applied', {
        scope: 'url',
        url: String(row.url || ''),
        status: asInt(row.status, 0),
        cooldown_seconds: asInt(row.cooldown_seconds, 0),
        next_retry_ts: String(row.next_retry_ts || row.next_retry_at || ''),
        cooldown_until: String(row.cooldown_until || row.next_retry_ts || ''),
        reason: String(row.reason || '')
      }, ts);
    }

    if (eventName === 'blocked_domain_cooldown_applied') {
      await this._emit('scheduler', 'blocked_domain_cooldown_applied', {
        scope: 'host',
        host: String(row.host || ''),
        status: asInt(row.status, 0),
        blocked_count: asInt(row.blocked_count, 0),
        threshold: asInt(row.threshold, 0),
        removed_count: asInt(row.removed_count, 0)
      }, ts);
    }

    if (eventName === 'needset_computed') {
      await this._startStage('index', ts, { trigger: eventName });
      this._setPhaseCursor('phase_01_needset');
      const payload = toNeedSetSnapshot(row, ts);
      payload.status = 'executed';
      payload.source = 'runtime_bridge';
      this.needSet = payload;
      await this._emit('index', 'needset_computed', {
        scope: 'needset',
        needset_size: payload.needset_size,
        total_fields: payload.total_fields,
        identity_lock_state: payload.identity_lock_state,
        identity_audit_rows: payload.identity_audit_rows,
        reason_counts: payload.reason_counts,
        required_level_counts: payload.required_level_counts,
        needs: payload.needs,
        snapshots: payload.snapshots
      }, ts);
      await this._writeNeedSet(payload);
      await this._writeRunMeta({
        needset: {
          needset_size: payload.needset_size,
          total_fields: payload.total_fields,
          generated_at: payload.generated_at
        }
      });
    }

    if (eventName === 'brand_resolved') {
      await this._startStage('search', ts, { trigger: eventName });
      this._setPhaseCursor('phase_02_search_profile');
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
      await this._emit('search', 'brand_resolved', brandPayload, ts);
      if (this.brandResolutionPath) {
        await fs.writeFile(this.brandResolutionPath, `${JSON.stringify(brandPayload, null, 2)}\n`, 'utf8');
      }
    }

    if (eventName === 'search_plan_generated') {
      await this._startStage('search', ts, { trigger: eventName });
      this._setPhaseCursor('phase_02_search_profile');
      await this._emit('search', 'search_plan_generated', {
        scope: 'plan',
        pass_index: asInt(row.pass_index, 0),
        pass_name: String(row.pass_name || '').trim(),
        queries_generated: Array.isArray(row.queries_generated) ? row.queries_generated : [],
        stop_condition: String(row.stop_condition || '').trim(),
        plan_rationale: String(row.plan_rationale || '').trim(),
        query_target_map: row.query_target_map && typeof row.query_target_map === 'object' ? row.query_target_map : {},
        missing_critical_fields: Array.isArray(row.missing_critical_fields) ? row.missing_critical_fields : [],
        mode: String(row.mode || '').trim(),
      }, ts);
    }

    if (eventName === 'search_results_collected') {
      await this._startStage('search', ts, { trigger: eventName });
      await this._emit('search', 'search_results_collected', {
        scope: 'query',
        query: String(row.query || '').trim(),
        provider: String(row.provider || '').trim(),
        dedupe_count: asInt(row.dedupe_count, 0),
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
        })) : [],
      }, ts);
    }

    if (eventName === 'urls_predicted') {
      await this._startStage('search', ts, { trigger: eventName });
      await this._emit('search', 'urls_predicted', {
        scope: 'prediction',
        remaining_budget: asInt(row.remaining_budget, 0),
        predictions: Array.isArray(row.predictions) ? row.predictions.map((p) => ({
          url: String(p?.url || '').trim(),
          domain: String(p?.domain || '').trim(),
          predicted_payoff: asFloat(p?.predicted_payoff, 0),
          target_fields: Array.isArray(p?.target_fields) ? p.target_fields : [],
          risk_flags: Array.isArray(p?.risk_flags) ? p.risk_flags : [],
          decision: String(p?.decision || '').trim(),
        })) : [],
      }, ts);
    }

    if (eventName === 'serp_triage_completed') {
      await this._startStage('search', ts, { trigger: eventName });
      this._setPhaseCursor('phase_03_serp_triage');
      await this._emit('search', 'serp_triage_completed', {
        scope: 'triage',
        query: String(row.query || '').trim(),
        kept_count: asInt(row.kept_count, 0),
        dropped_count: asInt(row.dropped_count, 0),
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
        })) : [],
      }, ts);
    }

    if (eventName === 'domains_classified') {
      await this._startStage('search', ts, { trigger: eventName });
      await this._emit('search', 'domains_classified', {
        scope: 'classification',
        classifications: Array.isArray(row.classifications) ? row.classifications.map((cls) => ({
          domain: String(cls?.domain || '').trim(),
          role: String(cls?.role || '').trim(),
          safety_class: String(cls?.safety_class || '').trim(),
          budget_score: asFloat(cls?.budget_score, 0),
          cooldown_remaining: asInt(cls?.cooldown_remaining, 0),
          success_rate: asFloat(cls?.success_rate, 0),
          avg_latency_ms: asInt(cls?.avg_latency_ms, 0),
          notes: String(cls?.notes || '').trim(),
        })) : [],
      }, ts);
    }

    if (eventName === 'evidence_index_result') {
      const dedupeOutcome = String(row.dedupe_outcome || 'unknown').trim();
      const eventKey = dedupeOutcomeToEventKey(dedupeOutcome);
      await this._emit('index', eventKey, {
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

    if (eventName === 'convergence_round_started') {
      await this._emit('convergence', 'convergence_round_started', {
        scope: 'round',
        round: asInt(row.round, 0),
        mode: String(row.mode || ''),
        needset_size: asInt(row.needset_size, 0),
        llm_target_field_count: asInt(row.llm_target_field_count, 0),
        extra_query_count: asInt(row.extra_query_count, 0)
      }, ts);
    }

    if (eventName === 'convergence_round_completed') {
      this._setPhaseCursor('phase_09_convergence');
      await this._emit('convergence', 'convergence_round_completed', {
        scope: 'round',
        round: asInt(row.round, 0),
        needset_size: asInt(row.needset_size, 0),
        missing_required_count: asInt(row.missing_required_count, 0),
        critical_count: asInt(row.critical_count, 0),
        confidence: asFloat(row.confidence, 0),
        validated: asBool(row.validated, false),
        improved: asBool(row.improved, false),
        improvement_reasons: Array.isArray(row.improvement_reasons) ? row.improvement_reasons : [],
        no_progress_streak: asInt(row.no_progress_streak, 0),
        low_quality_rounds: asInt(row.low_quality_rounds, 0)
      }, ts);
    }

    if (eventName === 'convergence_stop') {
      await this._emit('convergence', 'convergence_stop', {
        scope: 'round',
        stop_reason: String(row.stop_reason || ''),
        round_count: asInt(row.round_count, 0),
        complete: asBool(row.complete, false),
        final_confidence: asFloat(row.final_confidence, 0),
        final_needset_size: asInt(row.final_needset_size, 0)
      }, ts);
    }

    if (eventName === 'phase07_prime_sources_built') {
      await this._startStage('index', ts, { trigger: eventName });
      this._setPhaseCursor('phase_07_prime_sources');
      await this._emit('index', 'phase07_prime_sources_built', {
        scope: 'phase07',
        fields_attempted: asInt(row.fields_attempted, 0),
        fields_with_hits: asInt(row.fields_with_hits, 0),
        fields_satisfied_min_refs: asInt(row.fields_satisfied_min_refs, 0),
        refs_selected_total: asInt(row.refs_selected_total, 0),
        distinct_sources_selected: asInt(row.distinct_sources_selected, 0)
      }, ts);
      await this._writeRunMeta();
    }

    if (eventName === 'llm_call_started' || eventName === 'llm_call_completed' || eventName === 'llm_call_failed') {
      const llmEvent = eventName === 'llm_call_started'
        ? 'llm_started'
        : (eventName === 'llm_call_completed' ? 'llm_finished' : 'llm_failed');
      const llmReason = String(row.reason || row.purpose || '').trim();
      const llmRouteRole = inferLlmRouteRole(String(row.route_role || '').trim(), llmReason);
      const batchId = String(row.batch_id || '').trim();
      const llmWorkerId = batchId ? 'llm-' + batchId : 'llm-' + (this.counters.search_workers + this.counters.pages_checked + 1);
      await this._emit('llm', llmEvent, {
        scope: 'call',
        reason: llmReason,
        route_role: llmRouteRole,
        model: String(row.model || '').trim(),
        provider: String(row.provider || '').trim(),
        max_tokens_applied: asInt(row.max_tokens_applied, 0),
        prompt_tokens: asInt(row.prompt_tokens, 0),
        completion_tokens: asInt(row.completion_tokens, 0),
        total_tokens: asInt(row.total_tokens, 0),
        retry_without_schema: Boolean(row.retry_without_schema),
        json_schema_requested: Boolean(row.json_schema_requested),
        prompt_preview: String(row.prompt_preview || '').slice(0, 8000),
        response_preview: String(row.response_preview || '').slice(0, 12000),
        message: String(row.message || '').trim(),
        worker_id: llmWorkerId
      }, ts);
    }

    if (row.level === 'error' || eventName === 'max_run_seconds_reached') {
      await this._emit('error', 'error', {
        event: eventName,
        message: String(row.message || ''),
        url
      }, ts);
    }

    if (eventName === 'run_completed') {
      this.status = 'completed';
      this.endedAt = ts;
      this.identityFingerprint = String(row.identity_fingerprint || this.identityFingerprint || '').trim();
      this.identityLockStatus = String(row.identity_lock_status || this.identityLockStatus || '').trim();
      this.dedupeMode = String(row.dedupe_mode || this.dedupeMode || '').trim();
      this._setPhaseCursor(String(row.phase_cursor || '').trim() || 'completed');
      await this._finishStage('search', ts, { reason: 'run_completed' });
      await this._finishStage('fetch', ts, { reason: 'run_completed' });
      await this._finishStage('parse', ts, { reason: 'run_completed' });
      await this._finishStage('index', ts, { reason: 'run_completed' });
      await this._emit('runtime', 'run_completed', {
        scope: 'run',
        identity_fingerprint: this.identityFingerprint,
        identity_lock_status: this.identityLockStatus,
        dedupe_mode: this.dedupeMode,
        phase_cursor: this.phaseCursor,
        counters: { ...this.counters }
      }, ts);
      await this._ensureBaselineArtifacts(ts);
      await this._writeRunMeta({
        status: 'completed',
        ended_at: ts
      });
    }
  }

  async _finishFetchUrl({
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
    bytes = 0
  } = {}) {
    const started = url ? this.fetchByUrl.get(url) : null;
    if (url) {
      this.fetchByUrl.delete(url);
    }
    const computedMs = started?.started_at
      ? Math.max(0, Date.parse(toIso(ts)) - Date.parse(toIso(started.started_at)))
      : 0;
    const durationMs = Math.max(0, asInt(fetchMs, 0) || computedMs);
    const statusClass = normalizeStageStatus(status);
    if (statusClass === 'ok') this.counters.fetched_ok += 1;
    else if (statusClass === '404') this.counters.fetched_404 += 1;
    else if (statusClass === 'blocked') this.counters.fetched_blocked += 1;
    else this.counters.fetched_error += 1;

    await this._emit('fetch', 'fetch_finished', {
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
      worker_id: started?.worker_id || (url ? this.workerByUrl.get(url) : '') || ''
    }, ts);
  }
}
