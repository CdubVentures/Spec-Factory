import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import path from 'node:path';
import fsPromises from 'node:fs/promises';

export function createLlmSettingsHandler({
  jsonRes,
  readJsonBody,
  getSpecDb,
  broadcastWs,
  HELPER_ROOT = '',
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
      // WHY: Mirror SQL to durable JSON so custom route edits survive spec.sqlite rebuild.
      if (HELPER_ROOT) {
        const fkoPath = path.join(HELPER_ROOT, category, '_control_plane', 'llm_route_matrix.json');
        fsPromises.writeFile(fkoPath, JSON.stringify({ rows: saved }, null, 2)).catch((err) => {
          console.warn('[mirror-write] llm_route_matrix.json write-back failed:', err?.message || err);
        });
      }
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
      // WHY: Clear the JSON mirror so reseed generates defaults, not stale custom state.
      if (HELPER_ROOT) {
        const fkoPath = path.join(HELPER_ROOT, category, '_control_plane', 'llm_route_matrix.json');
        fsPromises.writeFile(fkoPath, JSON.stringify({ rows: [] }, null, 2)).catch((err) => {
          console.warn('[mirror-write] llm_route_matrix.json reset write-back failed:', err?.message || err);
        });
      }
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
