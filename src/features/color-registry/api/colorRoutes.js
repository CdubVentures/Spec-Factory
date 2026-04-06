import { emitDataChange } from '../../../core/events/dataChangeContract.js';

const VALID_NAME = /^[a-z][a-z0-9-]*$/;
const VALID_HEX = /^#[0-9a-fA-F]{6}$/;

export function registerColorRoutes(ctx) {
  const { jsonRes, readJsonBody, appDb, broadcastWs, colorRegistryPath, writeBackColorRegistry, syncColorEnums } = ctx;

  function afterMutation() {
    writeBackColorRegistry(appDb, colorRegistryPath).catch((err) => {
      console.warn('[mirror-write] color_registry.json write-back failed:', err?.message || err);
    });
    // WHY: Sync list_values in all active category specDbs so the
    // closed color enum stays current without requiring recompile.
    try { syncColorEnums(); } catch { /* best-effort */ }
  }

  return async function handleColorRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'colors') return false;

    // GET /api/v1/colors
    if (method === 'GET' && !parts[1]) {
      const all = appDb.listColors().map((row) => ({
        name: row.name,
        hex: row.hex,
        css_var: row.css_var,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      return jsonRes(res, 200, all);
    }

    // POST /api/v1/colors  { name, hex }
    if (method === 'POST' && !parts[1]) {
      const body = await readJsonBody(req);
      const name = String(body.name ?? '').trim().toLowerCase();
      const hex = String(body.hex ?? '').trim();

      if (!name || !VALID_NAME.test(name)) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_name', message: 'Name must be lowercase letters, digits, and hyphens (start with letter)' });
      }
      if (name.length > 50) {
        return jsonRes(res, 400, { ok: false, error: 'name_too_long', message: 'Name must be 50 characters or fewer' });
      }
      if (!VALID_HEX.test(hex)) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_hex', message: 'Hex must be #RRGGBB format' });
      }

      const cssVar = `--color-${name}`;
      appDb.upsertColor({ name, hex, css_var: cssVar });
      const color = appDb.getColor(name);

      emitDataChange({ broadcastWs, event: 'color-add', category: '', meta: { name } });
      afterMutation();

      return jsonRes(res, 201, { ok: true, color });
    }

    // PUT /api/v1/colors/:name  { hex }
    if (method === 'PUT' && parts[1]) {
      const name = parts[1];
      const existing = appDb.getColor(name);
      if (!existing) {
        return jsonRes(res, 404, { ok: false, error: 'not_found', name });
      }

      const body = await readJsonBody(req);
      const hex = String(body.hex ?? '').trim();

      if (!VALID_HEX.test(hex)) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_hex', message: 'Hex must be #RRGGBB format' });
      }

      appDb.upsertColor({ name, hex, css_var: existing.css_var });
      const color = appDb.getColor(name);

      emitDataChange({ broadcastWs, event: 'color-update', category: '', meta: { name } });
      afterMutation();

      return jsonRes(res, 200, { ok: true, color });
    }

    // DELETE /api/v1/colors/:name
    if (method === 'DELETE' && parts[1]) {
      const name = parts[1];
      const changes = appDb.deleteColor(name);
      if (changes === 0) {
        return jsonRes(res, 404, { ok: false, error: 'not_found', name });
      }

      emitDataChange({ broadcastWs, event: 'color-delete', category: '', meta: { name } });
      afterMutation();

      return jsonRes(res, 200, { ok: true, deleted: name });
    }

    return false;
  };
}
