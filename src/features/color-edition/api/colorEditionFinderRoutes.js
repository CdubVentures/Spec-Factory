import { emitDataChange } from '../../../core/events/dataChangeContract.js';

export function registerColorEditionFinderRoutes(ctx) {
  const {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    logger, runColorEditionFinder, readColorEdition,
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

      const jsonData = readColorEdition({ productId }) || {};
      const now = new Date().toISOString();
      const onCooldown = Boolean(row.cooldown_until && row.cooldown_until > now);

      // Support new format (selected) and legacy (colors/editions objects)
      const selected = jsonData.selected || null;
      const colorDetails = selected ? {} : (jsonData.colors || {});
      const editionDetails = selected ? {} : (jsonData.editions || {});

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
        selected: selected || { colors: row.colors, editions: {}, default_color: row.default_color },
        runs: Array.isArray(jsonData.runs) ? jsonData.runs : [],
        color_details: colorDetails,
        edition_details: editionDetails,
      });
    }

    // POST /color-edition-finder/:category/:productId — trigger finder
    if (method === 'POST' && category && productId && !parts[3]) {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

        const seedUrls = (() => {
          try { return JSON.parse(productRow.seed_urls || '[]'); }
          catch { return []; }
        })();

        const result = await runColorEditionFinder({
          product: {
            product_id: productId,
            category,
            brand: productRow.brand || '',
            model: productRow.model || '',
            variant: productRow.variant || '',
            seed_urls: seedUrls,
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

      const updated = deleteColorEditionFinderRun({ productId, runNumber });

      if (updated) {
        // Sync SQL from recalculated state
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
        // No runs left — delete SQL row
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
      specDb.deleteColorEditionFinder(productId);

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
