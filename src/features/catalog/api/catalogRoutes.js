import { resolveProductIdentity } from '../index.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { recordQueueCleanupOutcome } from '../../../core/events/dataPropagationCounters.js';
import { upsertCatalogProductRow } from '../products/upsertCatalogProductRow.js';

export function registerCatalogRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    config,
    storage,
    reconcileOrphans,
    buildCatalog,
    listProducts,
    catalogAddProduct,
    catalogAddProductsBulk,
    catalogUpdateProduct,
    catalogRemoveProduct,
    catalogSeedFromCatalog,
    upsertQueueProduct,
    readJsonlEvents,
    fs,
    path,
    OUTPUT_ROOT,
    sessionCache,
    resolveCategoryAlias,
    listDirs,
    HELPER_ROOT,
    broadcastWs,
    getSpecDb,
    appDb,
  } = ctx;
  function resolveSpecDb(category) {
    if (!getSpecDb) return null;
    const cat = String(category || '').trim().toLowerCase();
    if (!cat) return null;
    return getSpecDb(cat);
  }

  function deleteCatalogProductRow(specDb, category, productId) {
    if (!specDb || !productId) return 0;
    if (typeof specDb.deleteProduct === 'function') {
      const result = specDb.deleteProduct(productId);
      return Number(result?.changes || 0);
    }
    if (specDb.db?.prepare) {
      const result = specDb.db
        .prepare('DELETE FROM products WHERE category = ? AND product_id = ?')
        .run(specDb.category || category, productId);
      return Number(result?.changes || 0);
    }
    return 0;
  }


  function makeQueueUpsert(category) {
    const defaultCategory = String(category || '').trim().toLowerCase();
    return async (args = {}) => {
      if (!upsertQueueProduct) return null;
      const queueCategory = String(args.category || defaultCategory || '').trim().toLowerCase();
      return upsertQueueProduct({
        ...args,
        category: queueCategory,
        specDb: resolveSpecDb(queueCategory),
      });
    };
  }

  async function removeQueueEntry() {
    return false;
  }

  return async function handleCatalogRoutes(parts, params, method, req, res) {
    // POST /api/v1/catalog/{cat}/reconcile  { dryRun?: boolean }
    if (parts[0] === 'catalog' && parts[1] && parts[2] === 'reconcile' && method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const result = await reconcileOrphans({
        storage,
        category: parts[1],
        config,
        dryRun: body.dryRun !== false
      });
      return jsonRes(res, 200, result);
    }

    // Product Catalog CRUD - /api/v1/catalog/{cat}/products[/{pid}]
    if (parts[0] === 'catalog' && parts[1] && parts[2] === 'products') {
      const category = parts[1];

      // POST /api/v1/catalog/{cat}/products/seed
      if (parts[3] === 'seed' && method === 'POST') {
        if (typeof catalogSeedFromCatalog !== 'function') {
          return jsonRes(res, 500, { ok: false, error: 'catalog_seed_handler_missing' });
        }
        const body = await readJsonBody(req).catch(() => ({}));
        const mode = body.mode === 'full' ? 'full' : 'identity';
        const result = await catalogSeedFromCatalog({
          config,
          category,
          mode,
          storage,
          upsertQueue: makeQueueUpsert(category),
          appDb,
        });
        if (result?.ok) {
          emitDataChange({
            broadcastWs,
            event: 'catalog-seed',
            category,
            meta: {
              mode,
              seeded: Number(result?.seeded || 0),
            },
          });
        }
        return jsonRes(res, 200, result);
      }

      // POST /api/v1/catalog/{cat}/products/bulk  { brand, rows:[{ model, variant? }] }
      if (parts[3] === 'bulk' && method === 'POST') {
        const body = await readJsonBody(req).catch(() => ({}));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (rows.length > 5000) {
          return jsonRes(res, 400, { ok: false, error: 'too_many_rows', max_rows: 5000 });
        }
        const result = await catalogAddProductsBulk({
          config,
          category,
          brand: body.brand || '',
          rows,
          storage,
          upsertQueue: makeQueueUpsert(category),
          appDb,
        });
        if (result?.ok) {
          emitDataChange({
            broadcastWs,
            event: 'catalog-bulk-add',
            category,
            meta: {
              count: Number(result?.created || 0),
            },
          });
        }
        return jsonRes(res, result.ok ? 200 : 400, result);
      }

      // GET /api/v1/catalog/{cat}/products
      if (!parts[3] && method === 'GET') {
        const products = listProducts({ specDb: resolveSpecDb(category) });
        return jsonRes(res, 200, products);
      }

      // POST /api/v1/catalog/{cat}/products  { brand, base_model, variant? }
      if (!parts[3] && method === 'POST') {
        const body = await readJsonBody(req);
        const result = await catalogAddProduct({
          config, category,
          brand: body.brand,
          base_model: body.base_model || '',
          variant: body.variant || '',
          storage,
          upsertQueue: makeQueueUpsert(category),
          appDb,
        });
        if (result?.ok) {
          upsertCatalogProductRow(resolveSpecDb(category), category, result.productId, result.product);
          emitDataChange({
            broadcastWs,
            event: 'catalog-product-add',
            category,
            entities: {
              productIds: [result.productId],
            },
          });
        }
        const status = result.ok ? 201 : (result.error === 'product_already_exists' ? 409 : 400);
        return jsonRes(res, status, result);
      }

      // PUT /api/v1/catalog/{cat}/products/{pid}  { brand?, model?, variant?, status? }
      if (parts[3] && method === 'PUT') {
        const body = await readJsonBody(req);
        const result = await catalogUpdateProduct({
          config, category,
          productId: parts[3],
          patch: body,
          storage,
          upsertQueue: makeQueueUpsert(category),
          specDb: resolveSpecDb(category),
          appDb,
        });
        if (result?.ok) {
          const syncedSpecDb = resolveSpecDb(category);
          if (syncedSpecDb) {
            upsertCatalogProductRow(
              syncedSpecDb,
              category,
              result.productId || parts[3],
              result.product || null,
            );
          }
          emitDataChange({
            broadcastWs,
            event: 'catalog-product-update',
            category,
            entities: {
              productIds: [result.productId || parts[3]],
            },
          });
        }
        const status = result.ok ? 200 : (result.error === 'product_not_found' ? 404 : 409);
        return jsonRes(res, status, result);
      }

      // DELETE /api/v1/catalog/{cat}/products/{pid}
      if (parts[3] && method === 'DELETE') {
        const productId = parts[3];
        const result = await catalogRemoveProduct({
          config,
          category,
          productId,
          storage,
          removeQueue: async ({ category: queueCategory, productId: queueProductId }) => {
            await removeQueueEntry(queueCategory, queueProductId);
          },
        });
        if (result?.ok) {
          deleteCatalogProductRow(resolveSpecDb(category), category, productId);
          emitDataChange({
            broadcastWs,
            event: 'catalog-product-delete',
            category,
            entities: {
              productIds: [productId],
            },
          });
        }
        const status = result.ok ? 200 : 404;
        return jsonRes(res, status, result);
      }
    }

    // Catalog overview - /api/v1/catalog/{cat}  ("all" merges every category)
    if (parts[0] === 'catalog' && parts[1] && !parts[2] && method === 'GET') {
      if (parts[1] === 'all') {
        const cats = (await listDirs(HELPER_ROOT)).filter(c => !c.startsWith('_'));
        const all = [];
        for (const cat of cats) {
          try {
            const rows = await buildCatalog(cat);
            all.push(...rows);
          } catch (err) {
            console.error(`[gui-server] buildCatalog failed for ${cat}:`, err.message);
          }
        }
        all.sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
        return jsonRes(res, 200, all);
      }
      const rows = await buildCatalog(parts[1]);
      return jsonRes(res, 200, rows);
    }

    // Product detail
    if (parts[0] === 'product' && parts[1] && parts[2] && method === 'GET') {
      const [, category, productId] = parts;
      const latestBase = storage.resolveOutputKey(category, productId, 'latest');
      const specDb = resolveSpecDb(category);
      const [summary, normalized, provenance] = await Promise.all([
        specDb
          ? Promise.resolve(specDb.getSummaryForProduct(productId))
          : storage.readJsonOrNull(`${latestBase}/summary.json`),
        specDb
          ? Promise.resolve(specDb.getNormalizedForProduct(productId))
          : storage.readJsonOrNull(`${latestBase}/normalized.json`),
        specDb
          ? Promise.resolve(specDb.getProvenanceForProduct(category, productId) ?? {})
          : storage.readJsonOrNull(`${latestBase}/provenance.json`),
      ]);
      const trafficLight = specDb
        ? specDb.getTrafficLightForProduct(productId)
        : (await storage.readJsonOrNull(`${latestBase}/traffic_light.json`));
      if (normalized && typeof normalized === 'object') {
        normalized.identity = await resolveProductIdentity({
          productId,
          category,
          config,
          specDb,
          normalizedIdentity: normalized.identity,
        });
      }
      const sessionProduct = await sessionCache.getSessionRules(category);
      return jsonRes(res, 200, { summary, normalized, provenance, trafficLight, fieldOrder: sessionProduct.cleanFieldOrder });
    }

    return false;
  };
}
