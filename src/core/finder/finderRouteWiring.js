/**
 * Finder Route Auto-Wiring.
 *
 * Generates routeCtx entries and routeDefinitions for all registered
 * finder modules. guiServerRuntime calls this once at boot to auto-wire
 * finder routes without per-module static imports.
 *
 * The shared context is the same for every finder (HTTP / DB / broadcast
 * plumbing). Per-finder orchestrator functions are imported locally by
 * each thin route wrapper, not bundled into the context.
 */

import { FINDER_MODULES } from './finderModuleRegistry.js';
import { createFinderRouteContext } from './finderRouteContext.js';

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
    const routeMod = await import(`../../features/${mod.featurePath}/api/${mod.routeFile}.js`);
    const registrar = routeMod[mod.registrarExport];

    if (typeof registrar !== 'function') {
      throw new Error(`Finder "${mod.id}": missing export "${mod.registrarExport}" from ${mod.routeFile}.js`);
    }

    const ctx = createFinderRouteContext({
      jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
      logger: createLogger ? createLogger(mod.routePrefix) : null,
    });

    routeCtx[`${mod.id}RouteContext`] = ctx;
    routeDefinitions.push({ key: mod.id, registrar });
  }

  return { routeCtx, routeDefinitions };
}
