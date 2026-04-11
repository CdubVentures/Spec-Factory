/**
 * Module Settings — per-category per-module settings routes.
 *
 * Each finder module stores its own settings in its own _settings table
 * in SpecDb (already per-category). Dual-writes to category_authority
 * JSON for reseed durability.
 *
 * Endpoints:
 *   GET  /api/v1/module-settings/:category/:moduleId
 *   PUT  /api/v1/module-settings/:category/:moduleId
 */

import fs from 'node:fs';
import path from 'node:path';
import { FINDER_MODULE_MAP } from '../../../core/finder/finderModuleRegistry.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';

function settingsJsonPath(helperRoot, category, mod) {
  return path.join(helperRoot, category, `${mod.filePrefix}_settings.json`);
}

function writeSettingsJson(filePath, settings) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function registerModuleSettingsRoutes(ctx) {
  const { jsonRes, readJsonBody, getSpecDb, broadcastWs, helperRoot } = ctx;

  return async function handleModuleSettingsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'module-settings') return false;

    const category = parts[1] || '';
    const moduleId = parts[2] || '';

    if (!category || !moduleId) {
      return jsonRes(res, 400, { error: 'category and moduleId required' });
    }

    const mod = FINDER_MODULE_MAP[moduleId];
    if (!mod) {
      return jsonRes(res, 404, { error: `unknown module: ${moduleId}` });
    }

    const specDb = getSpecDb(category);
    if (!specDb) {
      return jsonRes(res, 503, { error: 'specDb not ready' });
    }

    const store = specDb.getFinderStore(moduleId);
    if (!store) {
      return jsonRes(res, 404, { error: `no finder store for module: ${moduleId}` });
    }

    // ── GET — return all settings with defaults ──────────────────
    if (method === 'GET') {
      const settings = store.getAllSettings();
      return jsonRes(res, 200, { category, module: moduleId, settings });
    }

    // ── PUT — patch settings (merge) ─────────────────────────────
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') {
        return jsonRes(res, 400, { error: 'body must be a JSON object' });
      }

      const settings = body.settings || body;
      for (const [key, value] of Object.entries(settings)) {
        if (typeof key === 'string' && key.length > 0) {
          store.setSetting(key, value);
        }
      }

      // Dual-write to category_authority JSON for reseed
      const allSettings = store.getAllSettings();
      if (helperRoot) {
        const jsonPath = settingsJsonPath(helperRoot, category, mod);
        writeSettingsJson(jsonPath, allSettings);
      }

      emitDataChange({
        broadcastWs,
        event: 'module-settings-updated',
        category,
        domains: ['module-settings'],
        meta: { moduleId, keys: Object.keys(settings) },
      });

      return jsonRes(res, 200, { ok: true, category, module: moduleId, settings: allSettings });
    }

    return false;
  };
}
