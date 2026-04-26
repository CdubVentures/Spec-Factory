import { resolveProductIdentity } from '../index.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { recordQueueCleanupOutcome } from '../../../core/events/dataPropagationCounters.js';
import { upsertCatalogProductRow } from '../products/upsertCatalogProductRow.js';
import { deleteProductCascade } from '../products/deleteProductCascade.js';
import { createDeletionStore } from '../../../db/stores/deletionStore.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

export function registerCatalogRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    config,
    storage,
    reconcileOrphans,
    buildCatalog,
    buildCatalogRow,
    listProducts,
    catalogAddProduct,
    catalogAddProductsBulk,
    catalogUpdateProduct,
    catalogRemoveProduct,
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

  function buildCatalogProductFallback(productId, product) {
    if (!productId || !product || typeof product !== 'object') return null;
    return {
      productId,
      id: Number(product.id || 0),
      identifier: String(product.identifier || '').trim(),
      brand: String(product.brand || '').trim(),
      brand_identifier: String(product.brand_identifier || '').trim(),
      model: String(product.model || product.base_model || '').trim(),
      base_model: String(product.base_model || product.model || '').trim(),
      variant: String(product.variant || '').trim(),
      status: String(product.status || '').trim() || 'active',
      added_at: String(product.added_at || product.created_at || '').trim(),
      added_by: String(product.added_by || '').trim(),
      ...(product.updated_at ? { updated_at: String(product.updated_at).trim() } : {}),
    };
  }

  async function findCatalogProduct(specDb, productId, fallbackProduct = null) {
    if (!specDb || !productId) return null;
    const products = await listProducts({ specDb });
    if (Array.isArray(products)) {
      const product = products.find((row) => row.productId === productId);
      if (product) return product;
    }
    return buildCatalogProductFallback(productId, fallbackProduct);
  }

  const productRoot = config?.productRoot || defaultProductRoot();

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

      // POST /api/v1/catalog/{cat}/products/bulk  { brand, rows:[{ model, variant? }] }
      if (parts[3] === 'bulk' && method === 'POST') {
        const body = await readJsonBody(req).catch(() => ({}));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (rows.length > 5000) {
          return jsonRes(res, 400, { ok: false, error: 'too_many_rows', max_rows: 5000 });
        }
        const specDb = resolveSpecDb(category);
        const result = await catalogAddProductsBulk({
          config,
          category,
          brand: body.brand || '',
          rows,
          storage,
          specDb,
          appDb,
          productRoot,
        });
        if (result?.ok) {
          const bulkSpecDb = resolveSpecDb(category);
          for (const row of result.results || []) {
            if (row.status === 'created' && row.productId) {
              upsertCatalogProductRow(bulkSpecDb, category, row.productId, row);
            }
          }
          const createdProductIds = (result.results || [])
            .filter((row) => row.status === 'created' && row.productId)
            .map((row) => row.productId);
          result.products = (await Promise.all(
            createdProductIds.map((productId) => {
              const sourceRow = (result.results || []).find((row) => row.productId === productId);
              return findCatalogProduct(bulkSpecDb, productId, sourceRow);
            }),
          )).filter(Boolean);
          emitDataChange({
            broadcastWs,
            event: 'catalog-bulk-add',
            category,
            entities: {
              productIds: createdProductIds,
            },
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
        const specDb = resolveSpecDb(category);
        const result = await catalogAddProduct({
          config, category,
          brand: body.brand,
          base_model: body.base_model || '',
          variant: body.variant || '',
          storage,
          specDb,
          appDb,
          productRoot,
        });
        if (result?.ok) {
          const syncedSpecDb = resolveSpecDb(category);
          upsertCatalogProductRow(syncedSpecDb, category, result.productId, result.product);
          const product = await findCatalogProduct(syncedSpecDb, result.productId, result.product);
          if (product) {
            result.product = product;
          }
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
          specDb: resolveSpecDb(category),
        });
        if (result?.ok) {
          const specDb = resolveSpecDb(category);
          // WHY: Cascade-delete all dependent data before removing the anchor row.
          // Finder data, variants, candidates, pipeline history, and product folder.
          deleteProductCascade({ specDb, productId, category, createDeletionStore });
          deleteCatalogProductRow(specDb, category, productId);
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

    // Catalog overview row - /api/v1/catalog/{cat}/rows/{pid}
    if (parts[0] === 'catalog' && parts[1] && parts[2] === 'rows' && parts[3] && !parts[4] && method === 'GET') {
      const category = parts[1];
      const productId = parts[3];
      const row = typeof buildCatalogRow === 'function'
        ? await buildCatalogRow(category, productId)
        : (await buildCatalog(category)).find((catalogRow) => catalogRow.productId === productId) || null;
      if (!row) {
        return jsonRes(res, 404, {
          error: 'catalog_row_not_found',
          productId,
        });
      }
      return jsonRes(res, 200, row);
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

    return false;
  };
}
