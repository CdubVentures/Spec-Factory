import { emitDataChange } from '../../../core/events/dataChangeContract.js';

export function registerColorEditionFinderRoutes(ctx) {
  const {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    colorRegistryPath, runColorEditionFinder, readColorEdition,
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
        color_details: jsonData.colors || {},
        edition_details: jsonData.editions || {},
      });
    }

    // POST /color-edition-finder/:category/:productId — trigger finder
    if (method === 'POST' && category && productId) {
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
          logger: null,
          colorRegistryPath,
        });

        emitDataChange({
          broadcastWs,
          event: 'color-edition-finder-run',
          category,
          entities: { productIds: [productId] },
          meta: { productId, colorsFound: result.colors.length, editionsFound: result.editions.length },
        });

        return jsonRes(res, 200, {
          ok: true,
          colors: result.colors,
          editions: result.editions,
          newColorsRegistered: result.newColorsRegistered,
          fallbackUsed: result.fallbackUsed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[color-edition-finder] POST failed:', message);
        return jsonRes(res, 500, { error: 'finder failed', message });
      }
    }

    return false;
  };
}
