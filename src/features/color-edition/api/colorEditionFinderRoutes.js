import fs from 'node:fs';
import path from 'node:path';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

function cleanProductJsonCandidates(productId, fieldKeys) {
  const productPath = path.join(defaultProductRoot(), productId, 'product.json');
  try {
    const data = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    if (!data.candidates) return;
    for (const key of fieldKeys) delete data.candidates[key];
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify(data, null, 2));
  } catch { /* product.json may not exist */ }
}

export function registerColorEditionFinderRoutes(ctx) {
  const {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    logger, runColorEditionFinder,
    deleteColorEditionFinderRun, deleteColorEditionFinderAll,
  } = ctx;

  return async function handleColorEditionFinderRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'color-edition-finder') return false;

    const category = parts[1] || '';
    const productId = parts[2] || '';

    // GET /color-edition-finder/:category — list all for category
    if (method === 'GET' && category && !productId) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const rows = specDb.listColorEditionFinderByCategory(category);
      return jsonRes(res, 200, rows);
    }

    // GET /color-edition-finder/:category/:productId — single product results
    if (method === 'GET' && category && productId) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const row = specDb.getColorEditionFinder(productId);
      if (!row) return jsonRes(res, 404, { error: 'not found' });

      const now = new Date().toISOString();
      const onCooldown = Boolean(row.cooldown_until && row.cooldown_until > now);

      // Runs from SQL projection (frontend never reads JSON)
      const runs = specDb.listColorEditionFinderRuns(productId);
      const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
      const selected = latestRun?.selected || { colors: row.colors, editions: {}, default_color: row.default_color };

      return jsonRes(res, 200, {
        product_id: row.product_id,
        category: row.category,
        colors: row.colors,
        editions: row.editions,
        default_color: row.default_color,
        cooldown_until: row.cooldown_until,
        on_cooldown: onCooldown,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        selected,
        runs,
        color_details: {},
        edition_details: {},
      });
    }

    // POST /color-edition-finder/:category/:productId — trigger finder
    if (method === 'POST' && category && productId && !parts[3]) {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

        const result = await runColorEditionFinder({
          product: {
            product_id: productId,
            category,
            brand: productRow.brand || '',
            model: productRow.model || '',
            variant: productRow.variant || '',
          },
          appDb,
          specDb,
          config,
          logger: logger || null,
        });

        emitDataChange({
          broadcastWs,
          event: 'color-edition-finder-run',
          category,
          entities: { productIds: [productId] },
          meta: { productId, colorsFound: result.colors.length, editionsFound: Object.keys(result.editions).length },
        });

        return jsonRes(res, 200, {
          ok: true,
          colors: result.colors,
          editions: result.editions,
          default_color: result.default_color,
          fallbackUsed: result.fallbackUsed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[color-edition-finder] POST failed:', message);
        return jsonRes(res, 500, { error: 'finder failed', message });
      }
    }

    // DELETE /color-edition-finder/:category/:productId/runs/:runNumber
    if (method === 'DELETE' && category && productId && parts[3] === 'runs' && parts[4]) {
      const runNumber = Number(parts[4]);
      if (!Number.isFinite(runNumber) || runNumber < 1) {
        return jsonRes(res, 400, { error: 'invalid run number' });
      }

      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      specDb.deleteColorEditionFinderRunByNumber(productId, runNumber);
      const updated = deleteColorEditionFinderRun({ productId, runNumber });

      // Clean up candidates for CEF fields
      specDb.deleteFieldCandidatesByProductAndField(productId, 'colors');
      specDb.deleteFieldCandidatesByProductAndField(productId, 'editions');
      cleanProductJsonCandidates(productId, ['colors', 'editions']);

      if (updated) {
        // Sync SQL summary from recalculated state
        specDb.upsertColorEditionFinder({
          category,
          product_id: productId,
          colors: updated.selected?.colors || [],
          editions: Object.keys(updated.selected?.editions || {}),
          default_color: updated.selected?.default_color || '',
          cooldown_until: updated.cooldown_until || '',
          latest_ran_at: updated.last_ran_at || '',
          run_count: updated.run_count || 0,
        });
      } else {
        // No runs left — delete SQL rows
        specDb.deleteAllColorEditionFinderRuns(productId);
        specDb.deleteColorEditionFinder(productId);
      }

      emitDataChange({
        broadcastWs,
        event: 'color-edition-finder-run-deleted',
        category,
        entities: { productIds: [productId] },
        meta: { productId, deletedRun: runNumber, remainingRuns: updated?.run_count || 0 },
      });

      return jsonRes(res, 200, {
        ok: true,
        remaining_runs: updated?.run_count || 0,
      });
    }

    // DELETE /color-edition-finder/:category/:productId — delete all
    if (method === 'DELETE' && category && productId && !parts[3]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      deleteColorEditionFinderAll({ productId });
      specDb.deleteAllColorEditionFinderRuns(productId);
      specDb.deleteColorEditionFinder(productId);

      // Clean up candidates for CEF fields
      specDb.deleteFieldCandidatesByProductAndField(productId, 'colors');
      specDb.deleteFieldCandidatesByProductAndField(productId, 'editions');
      cleanProductJsonCandidates(productId, ['colors', 'editions']);

      emitDataChange({
        broadcastWs,
        event: 'color-edition-finder-deleted',
        category,
        entities: { productIds: [productId] },
        meta: { productId },
      });

      return jsonRes(res, 200, { ok: true });
    }

    return false;
  };
}
