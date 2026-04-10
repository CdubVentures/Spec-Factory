import fsSync from 'node:fs';
import path from 'node:path';
import { invalidateUnitRegistryCache } from '../../../field-rules/unitRegistry.js';

// WHY: CRUD API for the managed unit registry.
// JSON at _global/unit_registry.json is durable SSOT.
// app.sqlite unit_registry table is the runtime projection.
// Mutations write to both SQL (immediate) and JSON (durable sync).
// Cache invalidation ensures the resolver picks up changes immediately.

export function registerUnitRegistryRoutes(ctx) {
  const { jsonRes, readJsonBody, appDb, unitRegistryPath } = ctx;

  function syncToJson() {
    const units = appDb.listUnits();
    const doc = {
      schema_version: 1,
      units: units.map(u => ({
        canonical: u.canonical,
        label: u.label,
        synonyms: u.synonyms,
        conversions: u.conversions,
      })),
    };
    fsSync.mkdirSync(path.dirname(unitRegistryPath), { recursive: true });
    fsSync.writeFileSync(unitRegistryPath, JSON.stringify(doc, null, 2));
  }

  return async function handleUnitRegistryRoutes(parts, _params, method, req, res) {
    if (parts[0] !== 'unit-registry') return false;

    // GET /api/v1/unit-registry — list all units
    if (method === 'GET' && !parts[1]) {
      const units = appDb.listUnits();
      return jsonRes(res, 200, { units });
    }

    // GET /api/v1/unit-registry/canonicals — lightweight list for dropdowns
    if (method === 'GET' && parts[1] === 'canonicals') {
      const units = appDb.listUnits();
      return jsonRes(res, 200, { canonicals: units.map(u => u.canonical) });
    }

    // GET /api/v1/unit-registry/:canonical — single unit
    if (method === 'GET' && parts[1]) {
      const unit = appDb.getUnit(decodeURIComponent(parts[1]));
      if (!unit) return jsonRes(res, 404, { error: 'Unit not found' });
      return jsonRes(res, 200, { unit });
    }

    // POST /api/v1/unit-registry/sync — force sync DB → JSON
    if (method === 'POST' && parts[1] === 'sync') {
      syncToJson();
      return jsonRes(res, 200, { synced: true });
    }

    // POST /api/v1/unit-registry — create or update a unit
    if (method === 'POST' && !parts[1]) {
      const body = await readJsonBody(req);
      const canonical = String(body.canonical ?? '').trim();
      if (!canonical) return jsonRes(res, 400, { error: 'canonical is required' });

      appDb.upsertUnit({
        canonical,
        label: body.label || '',
        synonyms: Array.isArray(body.synonyms) ? body.synonyms : [],
        conversions: Array.isArray(body.conversions) ? body.conversions : [],
      });
      invalidateUnitRegistryCache();
      syncToJson();
      const unit = appDb.getUnit(canonical);
      return jsonRes(res, 200, { unit });
    }

    // DELETE /api/v1/unit-registry/:canonical — delete a unit
    if (method === 'DELETE' && parts[1]) {
      const canonical = decodeURIComponent(parts[1]);
      const changes = appDb.deleteUnit(canonical);
      if (changes === 0) return jsonRes(res, 404, { error: 'Unit not found' });
      invalidateUnitRegistryCache();
      syncToJson();
      return jsonRes(res, 200, { deleted: true, canonical });
    }

    return false;
  };
}
