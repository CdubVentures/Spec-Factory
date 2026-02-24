import { resolveProductIdentity } from '../../catalog/productIdentityAuthority.js';
import { emitDataChange } from '../events/dataChangeContract.js';
import { recordQueueCleanupOutcome } from '../../observability/dataPropagationCounters.js';

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
    catalogSeedFromWorkbook,
    upsertQueueProduct,
    loadProductCatalog,
    readJsonlEvents,
    fs,
    path,
    OUTPUT_ROOT,
    sessionCache,
    resolveCategoryAlias,
    listDirs,
    HELPER_ROOT,
    broadcastWs,
    loadQueueState,
    saveQueueState,
    getSpecDb,
  } = ctx;

  function resolveSpecDb(category) {
    if (!getSpecDb) return null;
    const cat = String(category || '').trim().toLowerCase();
    if (!cat) return null;
    return getSpecDb(cat);
  }

  function deleteQueueProductRow(specDb, category, productId) {
    if (!specDb || !productId) return 0;
    if (typeof specDb.deleteQueueProduct === 'function') {
      const result = specDb.deleteQueueProduct(productId);
      return Number(result?.changes || 0);
    }
    if (specDb.db?.prepare) {
      const result = specDb.db
        .prepare('DELETE FROM product_queue WHERE category = ? AND product_id = ?')
        .run(specDb.category || category, productId);
      return Number(result?.changes || 0);
    }
    return 0;
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

  function upsertCatalogProductRow(specDb, category, productId, product) {
    if (!specDb?.upsertProduct || !productId || !product || typeof product !== 'object') return false;
    specDb.upsertProduct({
      category: specDb.category || String(category || '').trim().toLowerCase(),
      product_id: productId,
      brand: String(product.brand || '').trim(),
      model: String(product.model || '').trim(),
      variant: String(product.variant || '').trim(),
      status: String(product.status || '').trim() || 'active',
      seed_urls: Array.isArray(product.seed_urls) ? product.seed_urls : [],
      identifier: String(product.identifier || '').trim() || null,
    });
    return true;
  }

  async function syncCategoryCatalogToSpecDb(category) {
    const cat = String(category || '').trim().toLowerCase();
    if (!cat) return 0;
    const specDb = resolveSpecDb(cat);
    if (!specDb?.upsertProduct) return 0;
    const catalog = await loadProductCatalog(config, cat);
    let synced = 0;
    for (const [pid, product] of Object.entries(catalog.products || {})) {
      if (upsertCatalogProductRow(specDb, cat, pid, product)) synced += 1;
    }
    return synced;
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

  async function removeQueueEntry(category, productId) {
    const cat = String(category || '').trim().toLowerCase();
    const pid = String(productId || '').trim();
    if (!cat || !pid) return false;

    let removed = false;
    let cleanupError = null;
    const specDb = resolveSpecDb(cat);
    if (specDb) {
      try {
        const changes = deleteQueueProductRow(specDb, cat, pid);
        if (changes > 0) removed = true;
      } catch (error) {
        cleanupError = cleanupError || error;
      }
    }

    if (loadQueueState && saveQueueState) {
      try {
        const loaded = await loadQueueState({ storage, category: cat, specDb });
        if (loaded.state?.products?.[pid]) {
          delete loaded.state.products[pid];
          await saveQueueState({ storage, category: cat, state: loaded.state, specDb });
          removed = true;
        }
      } catch (error) {
        cleanupError = cleanupError || error;
      }
    }

    if (cleanupError) {
      recordQueueCleanupOutcome({
        category: cat,
        success: false,
        reason: cleanupError?.message || 'queue_cleanup_failed',
      });
      throw cleanupError;
    }
    recordQueueCleanupOutcome({ category: cat, success: true });
    return removed;
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
        const body = await readJsonBody(req).catch(() => ({}));
        const mode = body.mode === 'full' ? 'full' : 'identity';
        const result = await catalogSeedFromWorkbook({
          config,
          category,
          mode,
          storage,
          upsertQueue: makeQueueUpsert(category),
        });
        if (result?.ok) {
          await syncCategoryCatalogToSpecDb(category);
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
          upsertQueue: makeQueueUpsert(category)
        });
        if (result?.ok) {
          if (Number(result?.created || 0) > 0) {
            await syncCategoryCatalogToSpecDb(category);
          }
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
        const products = await listProducts(config, category);
        return jsonRes(res, 200, products);
      }

      // POST /api/v1/catalog/{cat}/products  { brand, model, variant?, seedUrls? }
      if (!parts[3] && method === 'POST') {
        const body = await readJsonBody(req);
        const result = await catalogAddProduct({
          config, category,
          brand: body.brand,
          model: body.model,
          variant: body.variant || '',
          seedUrls: body.seedUrls || [],
          storage,
          upsertQueue: makeQueueUpsert(category)
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

      // PUT /api/v1/catalog/{cat}/products/{pid}  { brand?, model?, variant?, seedUrls?, status? }
      if (parts[3] && method === 'PUT') {
        const body = await readJsonBody(req);
        const result = await catalogUpdateProduct({
          config, category,
          productId: parts[3],
          patch: body,
          storage,
          upsertQueue: makeQueueUpsert(category),
          specDb: resolveSpecDb(category),
        });
        if (result?.ok) {
          const syncedSpecDb = resolveSpecDb(category);
          const previousProductId = String(result.previousProductId || '').trim();
          if (syncedSpecDb && previousProductId && previousProductId !== String(result.productId || '').trim()) {
            deleteCatalogProductRow(syncedSpecDb, category, previousProductId);
          }
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
              productIds: [result.productId || parts[3], result.previousProductId || null],
            },
            meta: {
              previousProductId: result.previousProductId || null,
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
        storage.readJsonOrNull(`${latestBase}/summary.json`),
        storage.readJsonOrNull(`${latestBase}/normalized.json`),
        storage.readJsonOrNull(`${latestBase}/provenance.json`),
      ]);
      const trafficLight = await storage.readJsonOrNull(`${latestBase}/traffic_light.json`);
      if (normalized && typeof normalized === 'object') {
        normalized.identity = await resolveProductIdentity({
          productId,
          category,
          config,
          loadProductCatalog,
          specDb,
          normalizedIdentity: normalized.identity,
        });
      }
      const sessionProduct = await sessionCache.getSessionRules(category);
      return jsonRes(res, 200, { summary, normalized, provenance, trafficLight, fieldOrder: sessionProduct.cleanFieldOrder });
    }

    // Events
    if (parts[0] === 'events' && parts[1] && method === 'GET') {
      const category = parts[1];
      const productId = params.get('productId') || '';
      const limit = toInt(params.get('limit'), 500);
      const eventsPath = path.join(OUTPUT_ROOT, '_runtime', 'events.jsonl');
      let lines = [];
      try {
        const text = await fs.readFile(eventsPath, 'utf8');
        lines = text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      } catch { /* no events file */ }
      const normalizedCategory = String(category || '').trim().toLowerCase();
      if (normalizedCategory && normalizedCategory !== 'all') {
        lines = lines.filter((e) => {
          const eventCategory = String(e.category || e.cat || '').trim().toLowerCase();
          if (eventCategory) return eventCategory === normalizedCategory;
          const pid = String(e.productId || e.product_id || '').trim().toLowerCase();
          return pid.startsWith(`${normalizedCategory}-`);
        });
      }
      if (productId) {
        const normalizedProductId = String(productId).trim();
        lines = lines.filter((e) => String(e.productId || e.product_id || '').trim() === normalizedProductId);
      }
      return jsonRes(res, 200, lines.slice(-limit));
    }

    return false;
  };
}
