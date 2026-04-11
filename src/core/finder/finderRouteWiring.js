/**
 * Finder Route Auto-Wiring.
 *
 * Generates routeCtx entries and routeDefinitions for all registered
 * finder modules. guiServerRuntime calls this once at boot to auto-wire
 * finder routes without per-module static imports.
 */

import { FINDER_MODULES } from './finderModuleRegistry.js';

/**
 * Dynamically import and wire all registered finder modules.
 *
 * @param {object} deps
 * @param {Function} deps.jsonRes
 * @param {Function} deps.readJsonBody
 * @param {object} deps.config
 * @param {object} deps.appDb
 * @param {Function} deps.getSpecDb
 * @param {Function} deps.broadcastWs
 * @param {Function} deps.createLogger — (routePrefix) => logger
 * @returns {Promise<{ routeCtx: object, routeDefinitions: Array<{key, registrar}> }>}
 */
export async function wireFinderRoutes(deps) {
  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, createLogger } = deps;
  const routeCtx = {};
  const routeDefinitions = [];

  for (const mod of FINDER_MODULES) {
    const featureBase = `../../features/${mod.featurePath}`;

    // WHY: Dynamic import — no static per-module imports in guiServerRuntime.
    const [routeMod, ctxMod] = await Promise.all([
      import(`${featureBase}/api/${mod.routeFile}.js`),
      import(`${featureBase}/api/${mod.contextFile}.js`),
    ]);

    const registrar = routeMod[mod.registrarExport];
    const ctxFactory = ctxMod[mod.contextExport];

    if (typeof registrar !== 'function') {
      throw new Error(`Finder "${mod.id}": missing export "${mod.registrarExport}" from ${mod.routeFile}.js`);
    }
    if (typeof ctxFactory !== 'function') {
      throw new Error(`Finder "${mod.id}": missing export "${mod.contextExport}" from ${mod.contextFile}.js`);
    }

    const ctx = ctxFactory({
      jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
      logger: createLogger ? createLogger(mod.routePrefix) : null,
    });

    routeCtx[`${mod.id}RouteContext`] = ctx;
    routeDefinitions.push({ key: mod.id, registrar });
  }

  return { routeCtx, routeDefinitions };
}
