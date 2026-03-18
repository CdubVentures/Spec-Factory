import { emitDataChange } from '../../../api/events/dataChangeContract.js';
import { snapshotUiSettings } from '../../settings-authority/index.js';

export function createUiSettingsHandler({
  jsonRes,
  readJsonBody,
  broadcastWs,
  persistenceCtx,
}) {
  return async function handleUiSettings(parts, params, method, req, res) {
    if (parts[0] !== 'ui-settings') return false;

    if (method === 'GET') {
      return jsonRes(res, 200, snapshotUiSettings(persistenceCtx.getUiSettingsState()));
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const KEY_SET = new Set([
        'studioAutoSaveAllEnabled',
        'studioAutoSaveEnabled',
        'studioAutoSaveMapEnabled',
        'runtimeAutoSaveEnabled',
        'storageAutoSaveEnabled',
      ]);
      const nextUiSettings = {
        ...snapshotUiSettings(persistenceCtx.getUiSettingsState()),
      };
      const appliedKeys = [];
      const rejected = {};
      for (const [key, value] of Object.entries(body || {})) {
        if (!KEY_SET.has(key)) { rejected[key] = 'unknown_key'; continue; }
        const enabled = value === true || value === 'true' || value === 1;
        nextUiSettings[key] = enabled;
        appliedKeys.push(key);
      }
      const normalizedUiSnapshot = snapshotUiSettings(nextUiSettings);
      const userSettingsState = persistenceCtx.getUserSettingsState();
      const currentUserUi = (
        userSettingsState
        && userSettingsState.ui
        && typeof userSettingsState.ui === 'object'
      )
        ? userSettingsState.ui
        : {};
      const uiPatch = {};
      for (const [key, value] of Object.entries(normalizedUiSnapshot)) {
        if (!appliedKeys.includes(key)) continue;
        uiPatch[key] = value;
      }
      const snapshot = {
        ...currentUserUi,
        ...uiPatch,
      };
      persistenceCtx.recordRouteWriteAttempt('ui', 'ui-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistenceCtx.persistCanonicalSections({
          ui: snapshot,
        });
        persistenceCtx.recordRouteWriteOutcome('ui', 'ui-settings-route', true);
      } catch {
        persistenceCtx.recordRouteWriteOutcome('ui', 'ui-settings-route', false, 'ui_settings_persist_failed');
        return jsonRes(res, 500, { error: 'ui_settings_persist_failed' });
      }
      const persistedUiSnapshot = snapshotUiSettings(persistedArtifacts?.sections?.ui || {});
      const appliedSnapshot = {};
      for (const key of appliedKeys) {
        if (!Object.prototype.hasOwnProperty.call(persistedUiSnapshot, key)) continue;
        appliedSnapshot[key] = persistedUiSnapshot[key];
      }
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'ui',
          applied: appliedSnapshot,
        },
      });
      return jsonRes(res, 200, { ok: true, applied: appliedSnapshot, snapshot: persistedUiSnapshot, rejected });
    }

    return false;
  };
}
