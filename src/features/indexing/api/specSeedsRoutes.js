// WHY: GET/PUT endpoints for per-category spec seed templates.
// Pattern follows sourceStrategyRoutes.js (same ctx shape, same jsonRes/broadcastWs).

import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import {
  readSpecSeedsFile,
  writeSpecSeedsFile,
  validateSpecSeeds,
  defaultSpecSeeds,
} from '../sources/specSeedsFileService.js';

export function registerSpecSeedsRoutes(ctx) {
  const { jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs } = ctx;

  function resolveScopedCategory(params) {
    return resolveCategoryAlias(params.get('category') || '') || '';
  }

  function getRoot() {
    return config?.categoryAuthorityRoot || 'category_authority';
  }

  return async function handleSpecSeedsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'spec-seeds') return;

    const category = resolveScopedCategory(params);
    if (!category) return jsonRes(res, 400, { error: 'category_required' });
    const root = getRoot();

    if (method === 'GET') {
      const seeds = await readSpecSeedsFile(root, category);
      return jsonRes(res, 200, { category, seeds });
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => null);
      const seeds = Array.isArray(body?.seeds) ? body.seeds : body;
      const check = validateSpecSeeds(seeds);
      if (!check.valid) {
        return jsonRes(res, 400, { error: 'invalid_spec_seeds', reason: check.reason });
      }
      await writeSpecSeedsFile(root, category, seeds);
      emitDataChange('spec-seeds', { category });
      broadcastWs?.({ type: 'spec-seeds-updated', category });
      return jsonRes(res, 200, { category, seeds });
    }
  };
}
