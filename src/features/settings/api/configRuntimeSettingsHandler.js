import { emitDataChange } from '../../../api/events/dataChangeContract.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
  snapshotRuntimeSettings,
} from '../../settings-authority/index.js';

function buildRuntimeSettingsGetSnapshot(cfg, toInt) {
  const STRING_MAP = RUNTIME_SETTINGS_ROUTE_GET.stringMap;
  const INT_MAP = RUNTIME_SETTINGS_ROUTE_GET.intMap;
  const FLOAT_MAP = RUNTIME_SETTINGS_ROUTE_GET.floatMap;
  const BOOL_MAP = RUNTIME_SETTINGS_ROUTE_GET.boolMap;
  const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey;
  const settings = {};
  for (const [feKey, cfgKey] of Object.entries(STRING_MAP)) {
    settings[feKey] = String(cfg[cfgKey] ?? '');
  }
  for (const [feKey, cfgKey] of Object.entries(INT_MAP)) {
    settings[feKey] = toInt(cfg[cfgKey], 0);
  }
  for (const [feKey, cfgKey] of Object.entries(FLOAT_MAP)) {
    const v = Number.parseFloat(String(cfg[cfgKey] ?? 0));
    settings[feKey] = Number.isFinite(v) ? v : 0;
  }
  if (typeof cfg.dynamicFetchPolicyMapJson === 'string') {
    settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = cfg.dynamicFetchPolicyMapJson;
  } else if (cfg.dynamicFetchPolicyMap && typeof cfg.dynamicFetchPolicyMap === 'object') {
    settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = JSON.stringify(cfg.dynamicFetchPolicyMap);
  } else {
    settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = '';
  }
  for (const [feKey, cfgKey] of Object.entries(BOOL_MAP)) {
    settings[feKey] = Boolean(cfg[cfgKey]);
  }
  return settings;
}

export function createRuntimeSettingsHandler({
  jsonRes,
  readJsonBody,
  toInt,
  config,
  broadcastWs,
  persistenceCtx,
}) {
  return async function handleRuntimeSettings(parts, params, method, req, res) {
    if (parts[0] !== 'runtime-settings') return false;

    // GET /api/v1/runtime-settings
    if (method === 'GET') {
      const snapshot = buildRuntimeSettingsGetSnapshot(config, toInt);
      console.log('[SETTINGS-DEBUG] GET /runtime-settings fetchConcurrency=', snapshot.fetchConcurrency);
      return jsonRes(res, 200, snapshot);
    }

    // PUT or POST /api/v1/runtime-settings
    // WHY: POST accepted because navigator.sendBeacon (autosave on hard reload) always sends POST.
    if (method === 'PUT' || method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      console.log('[SETTINGS-DEBUG]', method, '/runtime-settings keys=', Object.keys(body || {}).length, 'fetchConcurrency=', (body || {}).fetchConcurrency);
      const STRING_ENUM_MAP = RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap;
      const STRING_FREE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap;
      const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey;
      const INT_RANGE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap;
      const FLOAT_RANGE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap;
      const BOOL_MAP = RUNTIME_SETTINGS_ROUTE_PUT.boolMap;
      const nextRuntimeSnapshot = {
        ...snapshotRuntimeSettings(config),
      };

      const applied = {};
      const rejected = {};
      const runtimePatch = {};

      // WHY: Build set of all known keys so unknown keys can be rejected.
      const ALL_KNOWN_KEYS = new Set([
        ...Object.keys(STRING_ENUM_MAP),
        DYNAMIC_FETCH_POLICY_MAP_JSON_KEY,
        ...Object.keys(STRING_FREE_MAP),
        ...Object.keys(INT_RANGE_MAP),
        ...Object.keys(FLOAT_RANGE_MAP),
        ...Object.keys(BOOL_MAP),
      ]);

      for (const [key, value] of Object.entries(body || {})) {
        if (!ALL_KNOWN_KEYS.has(key)) {
          rejected[key] = 'unknown_key';
          continue;
        }
        if (key in STRING_ENUM_MAP) {
          const { cfgKey, allowed, csv } = STRING_ENUM_MAP[key];
          const str = String(value ?? '').trim().toLowerCase();
          if (csv) {
            // CSV field: validate each comma-separated token against allowed list
            const tokens = str ? str.split(',').map(t => t.trim()).filter(Boolean) : [];
            const valid = tokens.filter(t => allowed.includes(t));
            const normalized = [...new Set(valid)].join(',');
            nextRuntimeSnapshot[cfgKey] = normalized;
            applied[key] = normalized;
            runtimePatch[cfgKey] = normalized;
          } else {
            if (!allowed.includes(str)) { rejected[key] = 'invalid_enum'; continue; }
            nextRuntimeSnapshot[cfgKey] = str;
            applied[key] = str;
            runtimePatch[cfgKey] = str;
          }
        } else if (key === DYNAMIC_FETCH_POLICY_MAP_JSON_KEY) {
          const normalized = String(value ?? '').trim();
          if (!normalized) {
            nextRuntimeSnapshot.dynamicFetchPolicyMapJson = '';
            nextRuntimeSnapshot.dynamicFetchPolicyMap = {};
            applied[key] = '';
            runtimePatch.dynamicFetchPolicyMapJson = '';
            runtimePatch.dynamicFetchPolicyMap = {};
            continue;
          }
          try {
            const parsed = JSON.parse(normalized);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
              rejected[key] = 'invalid_json_object';
              continue;
            }
            nextRuntimeSnapshot.dynamicFetchPolicyMap = parsed;
            nextRuntimeSnapshot.dynamicFetchPolicyMapJson = JSON.stringify(parsed);
            applied[key] = nextRuntimeSnapshot.dynamicFetchPolicyMapJson;
            runtimePatch.dynamicFetchPolicyMap = parsed;
            runtimePatch.dynamicFetchPolicyMapJson = nextRuntimeSnapshot.dynamicFetchPolicyMapJson;
          } catch {
            rejected[key] = 'invalid_json_object';
          }
        } else if (key in STRING_FREE_MAP) {
          const cfgKey = STRING_FREE_MAP[key];
          const str = String(value ?? '').trim();
          nextRuntimeSnapshot[cfgKey] = str;
          applied[key] = str;
          runtimePatch[cfgKey] = str;
        } else if (key in INT_RANGE_MAP) {
          const { cfgKey, min, max } = INT_RANGE_MAP[key];
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          nextRuntimeSnapshot[cfgKey] = clamped;
          applied[key] = clamped;
          runtimePatch[cfgKey] = clamped;
        } else if (key in FLOAT_RANGE_MAP) {
          const { cfgKey, min, max } = FLOAT_RANGE_MAP[key];
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          nextRuntimeSnapshot[cfgKey] = clamped;
          applied[key] = clamped;
          runtimePatch[cfgKey] = clamped;
        } else if (key in BOOL_MAP) {
          const cfgKey = BOOL_MAP[key];
          const b = value === true || value === 'true' || value === 1;
          nextRuntimeSnapshot[cfgKey] = b;
          applied[key] = b;
          runtimePatch[cfgKey] = b;
        }
      }
      const userSettingsState = persistenceCtx.getUserSettingsState();
      const currentUserRuntime = (
        userSettingsState
        && userSettingsState.runtime
        && typeof userSettingsState.runtime === 'object'
      )
        ? userSettingsState.runtime
        : {};
      Object.assign(nextRuntimeSnapshot, currentUserRuntime, runtimePatch);

      persistenceCtx.recordRouteWriteAttempt('runtime', 'runtime-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistenceCtx.persistCanonicalSections({
          runtime: nextRuntimeSnapshot,
        });
        await persistenceCtx.persistLegacySettingsFile('settings.json', persistedArtifacts.legacy.runtime);
        persistenceCtx.recordRouteWriteOutcome('runtime', 'runtime-settings-route', true);
      } catch {
        persistenceCtx.recordRouteWriteOutcome('runtime', 'runtime-settings-route', false, 'runtime_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'runtime_settings_persist_failed' });
      }
      emitDataChange({
        broadcastWs,
        event: 'runtime-settings-updated',
        meta: { applied },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'runtime',
          applied,
        },
      });
      const snapshot = buildRuntimeSettingsGetSnapshot(config, toInt);
      return jsonRes(res, 200, { ok: true, applied, snapshot, rejected });
    }

    return false;
  };
}
