import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import {
  CONVERGENCE_SETTINGS_ROUTE_PUT,
  snapshotConvergenceSettings,
} from '../../settings-authority/index.js';

export function createConvergenceSettingsHandler({
  jsonRes,
  readJsonBody,
  config,
  broadcastWs,
  persistenceCtx,
}) {
  return async function handleConvergenceSettings(parts, params, method, req, res) {
    if (parts[0] !== 'convergence-settings') return false;

    // GET /api/v1/convergence-settings
    if (method === 'GET') {
      return jsonRes(res, 200, snapshotConvergenceSettings(config));
    }

    // PUT /api/v1/convergence-settings
    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const INT_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys);
      const FLOAT_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys);
      const BOOL_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys);
      const ALL_KEYS = new Set([...INT_KEYS, ...FLOAT_KEYS, ...BOOL_KEYS]);
      const nextConvergenceSnapshot = {
        ...snapshotConvergenceSettings(config),
      };
      const applied = {};
      const rejected = {};
      for (const [key, value] of Object.entries(body || {})) {
        if (!ALL_KEYS.has(key)) { rejected[key] = 'unknown_key'; continue; }
        if (INT_KEYS.has(key)) {
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(0, n);
          nextConvergenceSnapshot[key] = clamped;
          applied[key] = clamped;
        } else if (FLOAT_KEYS.has(key)) {
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(0, Math.min(1, n));
          nextConvergenceSnapshot[key] = clamped;
          applied[key] = clamped;
        } else if (BOOL_KEYS.has(key)) {
          const b = value === true || value === 'true' || value === 1;
          nextConvergenceSnapshot[key] = b;
          applied[key] = b;
        }
      }
      const userSettingsState = persistenceCtx.getUserSettingsState();
      const currentUserConvergence = (
        userSettingsState
        && userSettingsState.convergence
        && typeof userSettingsState.convergence === 'object'
      )
        ? userSettingsState.convergence
        : {};
      const convergencePatch = {};
      for (const [key, value] of Object.entries(applied)) {
        convergencePatch[key] = value;
      }
      const convergenceToPersist = {
        ...currentUserConvergence,
        ...convergencePatch,
      };
      Object.assign(nextConvergenceSnapshot, convergenceToPersist);
      persistenceCtx.recordRouteWriteAttempt('convergence', 'convergence-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistenceCtx.persistCanonicalSections({
          convergence: nextConvergenceSnapshot,
        });
        await persistenceCtx.persistLegacySettingsFile(
          'convergence-settings.json',
          persistedArtifacts.legacy.convergence,
        );
        persistenceCtx.recordRouteWriteOutcome('convergence', 'convergence-settings-route', true);
      } catch {
        persistenceCtx.recordRouteWriteOutcome('convergence', 'convergence-settings-route', false, 'convergence_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'convergence_settings_persist_failed' });
      }
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'convergence',
          applied,
        },
      });
      const snapshot = snapshotConvergenceSettings(config);
      return jsonRes(res, 200, { ok: true, applied, snapshot, rejected });
    }

    return false;
  };
}
