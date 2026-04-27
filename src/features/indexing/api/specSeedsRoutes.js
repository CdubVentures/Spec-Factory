// WHY: GET/PUT endpoints for per-category spec seed templates.
// Pattern follows sourceStrategyRoutes.js (same ctx shape, same jsonRes/broadcastWs).

import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import {
  readSpecSeeds,
  writeSpecSeeds,
  validateSpecSeeds,
} from '../sources/specSeedsFileService.js';

export function registerSpecSeedsRoutes(ctx) {
  const { jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs, getSpecDb } = ctx;

  function resolveScopedCategory(params) {
    return resolveCategoryAlias(params.get('category') || '') || '';
  }

  function getRoot() {
    return config?.categoryAuthorityRoot || 'category_authority';
  }

  function getSqlStore(category) {
    try {
      return typeof getSpecDb === 'function' ? getSpecDb(category) : null;
    } catch {
      return null;
    }
  }

  return async function handleSpecSeedsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'spec-seeds') return false;

    const category = resolveScopedCategory(params);
    if (!category) return jsonRes(res, 400, { error: 'category_required' });
    const root = getRoot();
    const specDb = getSqlStore(category);

    if (method === 'GET') {
      const seeds = await readSpecSeeds({ root, category, specDb });
      return jsonRes(res, 200, { category, seeds });
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => null);
      const seeds = Array.isArray(body?.seeds) ? body.seeds : body;
      const check = validateSpecSeeds(seeds);
      if (!check.valid) {
        return jsonRes(res, 400, { error: 'invalid_spec_seeds', reason: check.reason });
      }
      await writeSpecSeeds({ root, category, seeds, specDb });
      emitDataChange({
        broadcastWs,
        event: 'spec-seeds-updated',
        category,
        domains: ['spec-seeds'],
        meta: { seed_count: seeds.length },
      });
      return jsonRes(res, 200, { category, seeds });
    }
  };
}
