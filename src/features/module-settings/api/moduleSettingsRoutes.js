/**
 * Module Settings — per-module settings routes.
 *
 * Two scopes, routed by URL:
 *   GET|PUT /api/v1/module-settings/global/:moduleId
 *     → settingsScope='global' modules. Reads/writes finder_global_settings
 *       in app.sqlite; dual-writes JSON to category_authority/_global/.
 *
 *   GET|PUT /api/v1/module-settings/:category/:moduleId
 *     → settingsScope='category' modules. Reads/writes the per-category
 *       `<tableName>_settings` table in that category's specDb; dual-writes
 *       JSON to category_authority/<category>/.
 *
 * Dual-writes preserve the Rebuild Contract: if SQL is deleted, the JSON
 * mirror is the authoritative source for reseed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { FINDER_MODULE_MAP } from '../../../core/finder/finderModuleRegistry.js';
import {
  deriveFinderSettingsDefaults,
  filterFinderSettingsForScope,
  hasFinderSettingsScope,
  mergeFinderScopedSettings,
} from '../../../core/finder/finderSettingsSchema.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { rebuildPifVariantProgressFromJson } from '../../product-image/pifVariantProgressRebuild.js';

const PIF_PROGRESS_SETTING_KEYS = new Set([
  'viewBudget',
  'carouselScoredViews',
  'carouselOptionalViews',
  'carouselExtraTarget',
  'heroEnabled',
  'heroCount',
]);

function writeSettingsJson(filePath, settings) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function globalSettingsJsonPath(helperRoot, mod) {
  return path.join(helperRoot, '_global', `${mod.filePrefix}_settings.json`);
}

function categorySettingsJsonPath(helperRoot, category, mod) {
  return path.join(helperRoot, category, `${mod.filePrefix}_settings.json`);
}

function readGlobalScopedSettings(mod, appDb) {
  return mergeFinderScopedSettings({
    mod,
    scope: 'global',
    stored: appDb?.listFinderGlobalSettings?.(mod.id) || {},
  });
}

function readCategoryScopedSettings(mod, store) {
  return mergeFinderScopedSettings({
    mod,
    scope: 'category',
    stored: store?.getAllSettings?.() || {},
  });
}

function readEffectiveSettings(mod, { appDb, store }) {
  return {
    ...deriveFinderSettingsDefaults(mod.settingsSchema || []),
    ...readCategoryScopedSettings(mod, store),
    ...readGlobalScopedSettings(mod, appDb),
  };
}

export function registerModuleSettingsRoutes(ctx) {
  const { jsonRes, readJsonBody, getSpecDb, broadcastWs, helperRoot, productRoot, appDb } = ctx;

  return async function handleModuleSettingsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'module-settings') return false;

    const scopeOrCategory = parts[1] || '';
    const moduleId = parts[2] || '';

    if (!scopeOrCategory || !moduleId) {
      return jsonRes(res, 400, { error: 'category/scope and moduleId required' });
    }

    const mod = FINDER_MODULE_MAP[moduleId];
    if (!mod) {
      return jsonRes(res, 404, { error: `unknown module: ${moduleId}` });
    }

    // ── Global scope ──────────────────────────────────────────────
    if (scopeOrCategory === 'global') {
      if (!hasFinderSettingsScope(mod, 'global')) {
        return jsonRes(res, 404, { error: `module ${moduleId} has no global-scope settings` });
      }
      if (!appDb) {
        return jsonRes(res, 503, { error: 'appDb not ready' });
      }

      if (method === 'GET') {
        return jsonRes(res, 200, {
          scope: 'global',
          module: moduleId,
          settings: readGlobalScopedSettings(mod, appDb),
        });
      }

      if (method === 'PUT') {
        const body = await readJsonBody(req);
        if (!body || typeof body !== 'object') {
          return jsonRes(res, 400, { error: 'body must be a JSON object' });
        }
        const patch = body.settings || body;
        const globalPatch = filterFinderSettingsForScope(mod, patch, 'global');
        for (const [key, value] of Object.entries(globalPatch)) {
          if (typeof key === 'string' && key.length > 0) {
            appDb.upsertFinderGlobalSetting(moduleId, key, value);
          }
        }

        const allSettings = readGlobalScopedSettings(mod, appDb);
        if (helperRoot) {
          writeSettingsJson(globalSettingsJsonPath(helperRoot, mod), allSettings);
        }

        emitDataChange({
          broadcastWs,
          event: 'module-settings-updated',
          domains: ['module-settings'],
          meta: { scope: 'global', moduleId, keys: Object.keys(globalPatch) },
        });

        return jsonRes(res, 200, { ok: true, scope: 'global', module: moduleId, settings: allSettings });
      }

      return false;
    }

    // ── Per-category scope ────────────────────────────────────────
    const category = scopeOrCategory;
    if (!hasFinderSettingsScope(mod, 'category')) {
      return jsonRes(res, 404, { error: `module ${moduleId} is global-scope; use /module-settings/global/${moduleId}` });
    }
    if (hasFinderSettingsScope(mod, 'global') && !appDb) {
      return jsonRes(res, 503, { error: 'appDb not ready' });
    }

    const specDb = getSpecDb(category);
    if (!specDb) {
      return jsonRes(res, 503, { error: 'specDb not ready' });
    }

    const store = specDb.getFinderStore(moduleId);
    if (!store) {
      return jsonRes(res, 404, { error: `no finder store for module: ${moduleId}` });
    }

    if (method === 'GET') {
      const settings = readEffectiveSettings(mod, { appDb, store });
      return jsonRes(res, 200, { category, module: moduleId, settings });
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') {
        return jsonRes(res, 400, { error: 'body must be a JSON object' });
      }

      const settings = body.settings || body;
      const categoryPatch = filterFinderSettingsForScope(mod, settings, 'category');
      const globalPatch = filterFinderSettingsForScope(mod, settings, 'global');
      const settingKeys = [...Object.keys(categoryPatch), ...Object.keys(globalPatch)];
      for (const [key, value] of Object.entries(categoryPatch)) {
        if (typeof key === 'string' && key.length > 0) {
          store.setSetting(key, value);
        }
      }
      for (const [key, value] of Object.entries(globalPatch)) {
        if (typeof key === 'string' && key.length > 0) {
          appDb.upsertFinderGlobalSetting(moduleId, key, value);
        }
      }

      const categorySettings = readCategoryScopedSettings(mod, store);
      if (helperRoot) {
        writeSettingsJson(categorySettingsJsonPath(helperRoot, category, mod), categorySettings);
        if (Object.keys(globalPatch).length > 0) {
          writeSettingsJson(globalSettingsJsonPath(helperRoot, mod), readGlobalScopedSettings(mod, appDb));
        }
      }

      const pifProgressChanged = moduleId === 'productImageFinder'
        && settingKeys.some((key) => PIF_PROGRESS_SETTING_KEYS.has(key));
      const pifProgressRebuild = pifProgressChanged
        ? rebuildPifVariantProgressFromJson({ specDb, productRoot })
        : null;
      const domains = pifProgressChanged
        ? ['module-settings', 'product-image-finder', 'catalog']
        : ['module-settings'];

      emitDataChange({
        broadcastWs,
        event: 'module-settings-updated',
        category,
        domains,
        meta: {
          moduleId,
          keys: settingKeys,
          ...(pifProgressRebuild ? { pifProgressRebuild } : {}),
        },
      });

      const allSettings = readEffectiveSettings(mod, { appDb, store });
      return jsonRes(res, 200, { ok: true, category, module: moduleId, settings: allSettings });
    }

    return false;
  };
}
