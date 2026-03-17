import { emitDataChange } from '../../../api/events/dataChangeContract.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
  snapshotRuntimeSettings,
} from '../../settings-authority/index.js';

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
      const STRING_MAP = RUNTIME_SETTINGS_ROUTE_GET.stringMap;
      const INT_MAP = RUNTIME_SETTINGS_ROUTE_GET.intMap;
      const FLOAT_MAP = RUNTIME_SETTINGS_ROUTE_GET.floatMap;
      const BOOL_MAP = RUNTIME_SETTINGS_ROUTE_GET.boolMap;
      const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey;
      const settings = {};
      for (const [feKey, cfgKey] of Object.entries(STRING_MAP)) {
        settings[feKey] = String(config[cfgKey] ?? '');
      }
      for (const [feKey, cfgKey] of Object.entries(INT_MAP)) {
        settings[feKey] = toInt(config[cfgKey], 0);
      }
      for (const [feKey, cfgKey] of Object.entries(FLOAT_MAP)) {
        const v = Number.parseFloat(String(config[cfgKey] ?? 0));
        settings[feKey] = Number.isFinite(v) ? v : 0;
      }
      if (typeof config.dynamicFetchPolicyMapJson === 'string') {
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = config.dynamicFetchPolicyMapJson;
      } else if (config.dynamicFetchPolicyMap && typeof config.dynamicFetchPolicyMap === 'object') {
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = JSON.stringify(config.dynamicFetchPolicyMap);
      } else {
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = '';
      }
      for (const [feKey, cfgKey] of Object.entries(BOOL_MAP)) {
        settings[feKey] = Boolean(config[cfgKey]);
      }
      return jsonRes(res, 200, settings);
    }

    // PUT /api/v1/runtime-settings
    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
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

      for (const [key, value] of Object.entries(body || {})) {
        if (key in STRING_ENUM_MAP) {
          const { cfgKey, allowed } = STRING_ENUM_MAP[key];
          const str = String(value ?? '').trim().toLowerCase();
          if (!allowed.includes(str)) { rejected[key] = 'invalid_enum'; continue; }
          nextRuntimeSnapshot[cfgKey] = str;
          applied[key] = str;
          runtimePatch[cfgKey] = str;
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
      return jsonRes(res, 200, { ok: true, applied, ...(Object.keys(rejected).length > 0 ? { rejected } : {}) });
    }

    return false;
  };
}
