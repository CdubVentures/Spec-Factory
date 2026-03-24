import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { upsertCatalogProductRow } from '../products/upsertCatalogProductRow.js';

export function registerBrandRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    storage,
    loadBrandRegistry,
    saveBrandRegistry,
    addBrand,
    addBrandsBulk,
    updateBrand,
    removeBrand,
    getBrandsForCategory,
    seedBrandsFromActiveFiltering,
    renameBrand,
    getBrandImpactAnalysis,
    resolveCategoryAlias,
    upsertQueueProduct,
    broadcastWs,
    getSpecDb,
    loadProductCatalog,
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

  async function syncRenameCascadeProducts(cascadeResults = []) {
    const rows = Array.isArray(cascadeResults) ? cascadeResults : [];
    for (const row of rows) {
      if (!row?.ok) continue;
      const category = String(row?.category || '').trim().toLowerCase();
      const oldPid = String(row?.old_pid || '').trim();
      const newPid = String(row?.new_pid || '').trim();
      if (!category || !newPid) continue;
      const specDb = resolveSpecDb(category);
      if (!specDb) continue;
      if (oldPid && oldPid !== newPid) {
        deleteCatalogProductRow(specDb, category, oldPid);
      }
      if (loadProductCatalog) {
        const catalog = await loadProductCatalog(config, category);
        const product = catalog.products?.[newPid] || null;
        upsertCatalogProductRow(specDb, category, newPid, product);
      }
    }
  }

  return async function handleBrandRoutes(parts, params, method, req, res) {
    // GET /api/v1/brands?category=mouse  (optional filter)
    if (parts[0] === 'brands' && method === 'GET' && !parts[1]) {
      const registry = await loadBrandRegistry(config);
      const category = resolveCategoryAlias(params.get('category'));
      if (category) {
        return jsonRes(res, 200, getBrandsForCategory(registry, category));
      }
      const all = Object.entries(registry.brands || {})
        .map(([slug, brand]) => ({ slug, ...brand }))
        .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
      return jsonRes(res, 200, all);
    }

    // POST /api/v1/brands/seed - auto-seed from activeFiltering
    if (parts[0] === 'brands' && parts[1] === 'seed' && method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const result = await seedBrandsFromActiveFiltering({ config, category: body.category || 'all' });
      if (result?.ok) {
        const eventCategory = String(body.category || 'all').trim() || 'all';
        emitDataChange({
          broadcastWs,
          event: 'brand-seed',
          category: eventCategory,
          meta: {
            seeded: Number(result?.seeded || 0),
          },
        });
      }
      return jsonRes(res, 200, result);
    }

    // POST /api/v1/brands/bulk  { category, names:[string] }
    if (parts[0] === 'brands' && parts[1] === 'bulk' && method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const names = Array.isArray(body.names) ? body.names : [];
      if (names.length > 5000) {
        return jsonRes(res, 400, { ok: false, error: 'too_many_rows', max_rows: 5000 });
      }
      const result = await addBrandsBulk({
        config,
        category: body.category || '',
        names
      });
      if (result?.ok) {
        const targetCategory = String(body.category || '').trim() || 'all';
        emitDataChange({
          broadcastWs,
          event: 'brand-bulk-add',
          category: targetCategory,
          categories: targetCategory === 'all' ? [] : [targetCategory],
          meta: {
            count: Number(result?.created || 0),
          },
        });
      }
      return jsonRes(res, result.ok ? 200 : 400, result);
    }

    // GET /api/v1/brands/{slug}/impact - impact analysis for rename/delete
    if (parts[0] === 'brands' && parts[1] && parts[2] === 'impact' && method === 'GET') {
      const result = await getBrandImpactAnalysis({ config, slug: parts[1] });
      return jsonRes(res, result.ok ? 200 : 404, result);
    }

    // POST /api/v1/brands  { name, aliases, categories, website }
    if (parts[0] === 'brands' && method === 'POST' && !parts[1]) {
      const body = await readJsonBody(req);
      const result = await addBrand({
        config,
        name: body.name,
        aliases: body.aliases,
        categories: body.categories,
        website: body.website
      });
      if (result?.ok) {
        const categories = Array.isArray(result?.brand?.categories)
          ? result.brand.categories.filter(Boolean)
          : [];
        emitDataChange({
          broadcastWs,
          event: 'brand-add',
          category: categories.length > 0 ? 'all' : '',
          categories,
          meta: {
            slug: result.slug || '',
          },
        });
      }
      return jsonRes(res, result.ok ? 201 : 400, result);
    }

    // PUT /api/v1/brands/{slug}  { name?, aliases?, categories?, website? }
    if (parts[0] === 'brands' && parts[1] && method === 'PUT') {
      const body = await readJsonBody(req);
      const brandSlug = parts[1];

      // Detect rename: if body.name is provided and differs from current canonical_name
      if (body.name !== undefined) {
        const registry = await loadBrandRegistry(config);
        const existing = registry.brands[brandSlug];
        if (!existing) return jsonRes(res, 404, { ok: false, error: 'brand_not_found', slug: brandSlug });

        if (String(body.name).trim() !== existing.canonical_name) {
          // Name changed - cascade rename first
          const renameResult = await renameBrand({
            config,
            slug: brandSlug,
            newName: body.name,
            storage,
            upsertQueue: async (args = {}) => {
              const queueCategory = String(args.category || '').trim().toLowerCase();
              return upsertQueueProduct({
                ...args,
                category: queueCategory,
                specDb: resolveSpecDb(queueCategory),
              });
            },
            getSpecDb: resolveSpecDb,
          });
          if (!renameResult.ok && renameResult.error) {
            return jsonRes(res, 400, renameResult);
          }

          // Apply remaining non-name patches (aliases, categories, website) to the new slug
          const remainingPatch = {};
          if (body.aliases !== undefined) remainingPatch.aliases = body.aliases;
          if (body.categories !== undefined) remainingPatch.categories = body.categories;
          if (body.website !== undefined) remainingPatch.website = body.website;

          if (Object.keys(remainingPatch).length > 0) {
            await updateBrand({ config, slug: renameResult.newSlug, patch: remainingPatch });
          }
          await syncRenameCascadeProducts(renameResult.cascade_results);

          const affectedCategories = Array.isArray(renameResult.cascade_results)
            ? [...new Set(
              renameResult.cascade_results
                .map((entry) => String(entry?.category || '').trim())
                .filter(Boolean)
            )]
            : [];
          emitDataChange({
            broadcastWs,
            event: 'brand-rename',
            category: 'all',
            categories: affectedCategories,
            meta: {
              oldSlug: renameResult.oldSlug || '',
              newSlug: renameResult.newSlug || '',
              cascaded_products: Number(renameResult.cascaded_products || 0),
            },
          });

          return jsonRes(res, 200, renameResult);
        }
      }

      // No rename - standard update
      const result = await updateBrand({ config, slug: brandSlug, patch: body });
      if (result?.ok) {
        const categories = Array.isArray(result?.brand?.categories)
          ? result.brand.categories.filter(Boolean)
          : [];
        emitDataChange({
          broadcastWs,
          event: 'brand-update',
          category: categories.length > 0 ? 'all' : '',
          categories,
          meta: {
            slug: result.slug || brandSlug,
          },
        });
      }
      return jsonRes(res, result.ok ? 200 : 404, result);
    }

    // DELETE /api/v1/brands/{slug}
    if (parts[0] === 'brands' && parts[1] && method === 'DELETE') {
      const force = params.get('force') === 'true';
      const result = await removeBrand({ config, slug: parts[1], force });
      if (result?.ok) {
        const categories = Object.keys(result?.products_by_category || {}).filter(Boolean);
        emitDataChange({
          broadcastWs,
          event: 'brand-delete',
          category: categories.length > 0 ? 'all' : '',
          categories,
          meta: {
            slug: parts[1],
          },
        });
      }
      let status = 404;
      if (result.ok) status = 200;
      else if (result.error === 'brand_in_use') status = 409;
      return jsonRes(res, status, result);
    }

    return false;
  };
}
