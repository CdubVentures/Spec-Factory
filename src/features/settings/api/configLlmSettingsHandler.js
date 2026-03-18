import { emitDataChange } from '../../../api/events/dataChangeContract.js';

export function createLlmSettingsHandler({
  jsonRes,
  readJsonBody,
  getSpecDb,
  broadcastWs,
}) {
  return async function handleLlmSettings(parts, params, method, req, res) {
    if (parts[0] !== 'llm-settings' || !parts[1] || parts[2] !== 'routes') return false;

    if (method === 'GET') {
      const category = parts[1];
      const scope = (params.get('scope') || '').trim().toLowerCase();
      const specDb = getSpecDb(category);
      // WHY: Missing specDb means no saved overrides yet — return empty rows, not 500.
      // A 500 here blocks settings hydration and keeps the "still hydrating" banner forever.
      if (!specDb) return jsonRes(res, 200, { category, scope: scope || null, rows: [] });
      const rows = specDb.getLlmRouteMatrix(scope || undefined);
      return jsonRes(res, 200, { category, scope: scope || null, rows });
    }

    if (method === 'PUT') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const rejected = {};
      if (body && typeof body === 'object') {
        for (const key of Object.keys(body)) {
          if (key !== 'rows') rejected[key] = 'unknown_key';
        }
      }
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const saved = specDb.saveLlmRouteMatrix(rows);
      emitDataChange({
        broadcastWs,
        event: 'llm-settings-updated',
        category,
      });
      const snapshot = { category, rows: saved };
      return jsonRes(res, 200, { ok: true, applied: { rows: saved }, snapshot, rejected, category, rows: saved });
    }

    if (parts[3] === 'reset' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const rows = specDb.resetLlmRouteMatrixToDefaults();
      emitDataChange({
        broadcastWs,
        event: 'llm-settings-reset',
        category,
      });
      return jsonRes(res, 200, { ok: true, category, rows });
    }

    return false;
  };
}
