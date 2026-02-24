import { emitDataChange } from '../events/dataChangeContract.js';

export function registerSourceStrategyRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    getSpecDb,
    resolveCategoryAlias,
    broadcastWs,
  } = ctx;

  function resolveScopedCategory(params) {
    const category = resolveCategoryAlias(params.get('category') || '');
    if (!category) return '';
    return category;
  }

  return async function handleSourceStrategyRoutes(parts, params, method, req, res) {
    // GET /api/v1/source-strategy
    if (parts[0] === 'source-strategy' && method === 'GET' && !parts[1]) {
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const db = getSpecDb(category);
      if (!db) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      return jsonRes(res, 200, db.listSourceStrategies());
    }

    // POST /api/v1/source-strategy
    if (parts[0] === 'source-strategy' && method === 'POST' && !parts[1]) {
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const body = await readJsonBody(req).catch(() => ({}));
      if (!body.host) return jsonRes(res, 400, { error: 'host_required' });
      const db = getSpecDb(category);
      if (!db) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const result = db.insertSourceStrategy(body);
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-created',
        category,
        domains: ['source-strategy'],
        meta: {
          id: Number(result?.id || 0),
          host: String(body.host || '').trim(),
        },
      });
      return jsonRes(res, 201, { ok: true, id: result.id });
    }

    // PUT /api/v1/source-strategy/:id
    if (parts[0] === 'source-strategy' && parts[1] && method === 'PUT') {
      const id = Number.parseInt(parts[1], 10);
      if (!Number.isFinite(id)) return jsonRes(res, 400, { error: 'invalid_id' });
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const body = await readJsonBody(req).catch(() => ({}));
      const db = getSpecDb(category);
      if (!db) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const updated = db.updateSourceStrategy(id, body);
      if (!updated) return jsonRes(res, 404, { error: 'not_found' });
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-updated',
        category,
        domains: ['source-strategy'],
        meta: {
          id,
        },
      });
      return jsonRes(res, 200, updated);
    }

    // DELETE /api/v1/source-strategy/:id
    if (parts[0] === 'source-strategy' && parts[1] && method === 'DELETE') {
      const id = Number.parseInt(parts[1], 10);
      if (!Number.isFinite(id)) return jsonRes(res, 400, { error: 'invalid_id' });
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const db = getSpecDb(category);
      if (!db) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      db.deleteSourceStrategy(id);
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-deleted',
        category,
        domains: ['source-strategy'],
        meta: {
          id,
        },
      });
      return jsonRes(res, 200, { ok: true });
    }

    return false;
  };
}
