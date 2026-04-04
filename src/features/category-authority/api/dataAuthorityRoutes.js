import { getDataPropagationCountersSnapshot } from '../../../core/events/dataPropagationCounters.js';
import { getSettingsPersistenceCountersSnapshot } from '../../../core/events/settingsPersistenceCounters.js';

function normalizedToken(value) {
  return String(value || '').trim();
}

function normalizedTimestamp(value) {
  const token = normalizedToken(value);
  if (!token) return null;
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toSyncVersion(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toSyncState(syncState, category) {
  const source = syncState && typeof syncState === 'object' ? syncState : {};
  return {
    category: normalizedToken(source.category) || normalizedToken(category).toLowerCase(),
    specdb_sync_version: toSyncVersion(source.specdb_sync_version),
    last_sync_status: normalizedToken(source.last_sync_status) || 'unknown',
    last_sync_at: normalizedTimestamp(source.last_sync_at),
    last_sync_meta: source.last_sync_meta && typeof source.last_sync_meta === 'object'
      ? source.last_sync_meta
      : {},
  };
}

function toSessionState(sessionRules) {
  const source = sessionRules && typeof sessionRules === 'object' ? sessionRules : {};
  return {
    compiledAt: normalizedTimestamp(source.compiledAt),
    mapSavedAt: normalizedTimestamp(source.mapSavedAt),
    compileStale: Boolean(source.compileStale),
  };
}

function toVersionPayload({ sessionState, syncState }) {
  const mapHash = sessionState.mapSavedAt ? `map:${sessionState.mapSavedAt}` : null;
  const compiledHash = sessionState.compiledAt ? `compiled:${sessionState.compiledAt}` : null;
  const syncVersion = toSyncVersion(syncState.specdb_sync_version);
  const updatedAt = syncState.last_sync_at || sessionState.mapSavedAt || sessionState.compiledAt || null;
  return {
    map_hash: mapHash,
    compiled_hash: compiledHash,
    specdb_sync_version: syncVersion,
    updated_at: updatedAt,
  };
}

export function buildAuthorityVersionToken(snapshotOrVersion) {
  const source = snapshotOrVersion && typeof snapshotOrVersion === 'object'
    ? (snapshotOrVersion.version && typeof snapshotOrVersion.version === 'object'
      ? snapshotOrVersion.version
      : snapshotOrVersion)
    : {};
  return [
    normalizedToken(source.map_hash) || 'none',
    normalizedToken(source.compiled_hash) || 'none',
    String(toSyncVersion(source.specdb_sync_version)),
    normalizedToken(source.updated_at) || '',
  ].join('|');
}

function uniqueSortedTokens(values) {
  const seen = new Set();
  const output = [];
  for (const rawValue of values) {
    const token = normalizedToken(rawValue).toLowerCase();
    if (!token || token === 'all' || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  output.sort();
  return output;
}

function resolveChangedDomains({ sessionState, syncState }) {
  const domains = ['studio', 'review-layout'];
  if (sessionState.mapSavedAt) {
    domains.push('labels');
  }
  if (sessionState.compileStale) {
    domains.push('mapping');
  }
  const syncVersion = toSyncVersion(syncState.specdb_sync_version);
  if (syncVersion > 0 && syncState.last_sync_status === 'ok') {
    domains.push('component', 'enum', 'review', 'product');
  }
  if (Array.isArray(syncState.last_sync_meta?.domains)) {
    domains.push(...syncState.last_sync_meta.domains);
  }
  return uniqueSortedTokens(domains);
}

function buildObservabilityForCategory(category) {
  const snapshot = getDataPropagationCountersSnapshot();
  const settingsSnapshot = getSettingsPersistenceCountersSnapshot();
  const normalizedCategory = normalizedToken(category).toLowerCase();
  const queueByCategory = snapshot?.queue_cleanup?.by_category || {};
  return {
    data_change: {
      total: Number(snapshot?.broadcast?.total || 0),
      last_broadcast_at: snapshot?.broadcast?.last_broadcast_at || null,
      category_count: Number(snapshot?.broadcast?.by_category?.[normalizedCategory] || 0),
      by_event: snapshot?.broadcast?.by_event || {},
    },
    queue_cleanup: {
      attempt_total: Number(snapshot?.queue_cleanup?.attempt_total || 0),
      success_total: Number(snapshot?.queue_cleanup?.success_total || 0),
      failed_total: Number(snapshot?.queue_cleanup?.failed_total || 0),
      last_success_at: snapshot?.queue_cleanup?.last_success_at || null,
      last_failure_at: snapshot?.queue_cleanup?.last_failure_at || null,
      last_failure_reason: snapshot?.queue_cleanup?.last_failure_reason || '',
      category: queueByCategory[normalizedCategory] || {
        attempt_total: 0,
        success_total: 0,
        failed_total: 0,
        last_success_at: null,
        last_failure_at: null,
        last_failure_reason: '',
      },
    },
    settings_persistence: settingsSnapshot,
  };
}

function defaultSyncState(category) {
  return {
    category: normalizedToken(category).toLowerCase(),
    specdb_sync_version: 0,
    last_sync_status: 'unknown',
    last_sync_at: null,
    last_sync_meta: {},
  };
}

export function buildAuthoritySnapshotPayload({
  category,
  sessionRules,
  syncState,
}) {
  const normalizedCategory = normalizedToken(category).toLowerCase();
  const resolvedSessionState = toSessionState(sessionRules);
  const resolvedSyncState = toSyncState(syncState || defaultSyncState(normalizedCategory), normalizedCategory);
  const version = toVersionPayload({
    sessionState: resolvedSessionState,
    syncState: resolvedSyncState,
  });
  const snapshot = {
    category: normalizedCategory,
    authority_version: buildAuthorityVersionToken(version),
    version,
    changed_domains: resolveChangedDomains({
      sessionState: resolvedSessionState,
      syncState: resolvedSyncState,
    }),
    compile_stale: resolvedSessionState.compileStale,
    source_timestamps: {
      compiled_at: resolvedSessionState.compiledAt,
      map_saved_at: resolvedSessionState.mapSavedAt,
      specdb_sync_at: resolvedSyncState.last_sync_at,
    },
    specdb_sync: {
      status: resolvedSyncState.last_sync_status,
      version: resolvedSyncState.specdb_sync_version,
      updated_at: resolvedSyncState.last_sync_at,
      meta: resolvedSyncState.last_sync_meta,
    },
    observability: buildObservabilityForCategory(normalizedCategory),
  };
  return snapshot;
}

export function registerDataAuthorityRoutes(ctx) {
  const {
    jsonRes,
    config,
    sessionCache,
    getSpecDb,
  } = ctx;

  return async function handleDataAuthorityRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'data-authority' || !parts[1] || parts[2] !== 'snapshot' || parts[3]) {
      return false;
    }
    if (method !== 'GET') return false;

    const category = normalizedToken(parts[1]).toLowerCase();
    if (!category || category === 'all') {
      return jsonRes(res, 400, { error: 'category_required' });
    }

    const sessionRules = await sessionCache?.getSessionRules?.(category).catch(() => null);
    const specDb = getSpecDb?.(category) || null;
    const syncState = typeof specDb?.getSpecDbSyncState === 'function'
      ? specDb.getSpecDbSyncState(category)
      : defaultSyncState(category);

    return jsonRes(res, 200, buildAuthoritySnapshotPayload({
      category,
      sessionRules,
      syncState,
    }));
  };
}
