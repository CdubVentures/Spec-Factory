import { emitDataChange } from '../../../core/events/dataChangeContract.js';


export function registerBrandRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    storage,
    appDb,
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

  // WHY: Phase F — renameBrand now applies the SQL UPDATE directly via brand_identifier.
  // The old per-product cascade is gone, so this sync is no longer needed.
  // Kept as a no-op for API compatibility (callers still pass cascade_results).
  async function syncRenameCascadeProducts() {}

  return async function handleBrandRoutes(parts, params, method, req, res) {
    // GET /api/v1/brands?category=mouse  (optional filter)
    if (parts[0] === 'brands' && method === 'GET' && !parts[1]) {
      const category = resolveCategoryAlias(params.get('category'));
      if (category) {
        return jsonRes(res, 200, getBrandsForCategory(appDb, category));
      }
      const all = appDb.listBrands().map((row) => {
        const categories = appDb.getCategoriesForBrand(row.identifier);
        return {
          slug: row.slug,
          canonical_name: row.canonical_name,
          identifier: row.identifier,
          aliases: JSON.parse(row.aliases || '[]'),
          categories,
          website: row.website || '',
          added_at: row.created_at,
          added_by: row.added_by,
          ...(row.updated_at && row.updated_at !== row.created_at ? { updated_at: row.updated_at } : {}),
        };
      });
      return jsonRes(res, 200, all);
    }

    // POST /api/v1/brands/seed - auto-seed from activeFiltering
    if (parts[0] === 'brands' && parts[1] === 'seed' && method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const result = await seedBrandsFromActiveFiltering({ config, appDb, category: body.category || 'all' });
      if (result?.ok) {
        const eventCategory = String(body.category || 'all').trim() || 'all';
        emitDataChange({
          broadcastWs,
          event: 'brand-seed',
          category: eventCategory,
          meta: { seeded: Number(result?.seeded || 0) },
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
      const result = await addBrandsBulk({ config, appDb, category: body.category || '', names });
      if (result?.ok) {
        const targetCategory = String(body.category || '').trim() || 'all';
        emitDataChange({
          broadcastWs,
          event: 'brand-bulk-add',
          category: targetCategory,
          categories: targetCategory === 'all' ? [] : [targetCategory],
          meta: { count: Number(result?.created || 0) },
        });
      }
      return jsonRes(res, result.ok ? 200 : 400, result);
    }

    // GET /api/v1/brands/{slug}/impact - impact analysis for rename/delete
    if (parts[0] === 'brands' && parts[1] && parts[2] === 'impact' && method === 'GET') {
      const result = await getBrandImpactAnalysis({ config, appDb, slug: parts[1], getSpecDb: resolveSpecDb });
      return jsonRes(res, result.ok ? 200 : 404, result);
    }

    // POST /api/v1/brands  { name, aliases, categories, website }
    if (parts[0] === 'brands' && method === 'POST' && !parts[1]) {
      const body = await readJsonBody(req);
      const result = await addBrand({
        config, appDb,
        name: body.name,
        aliases: body.aliases,
        categories: body.categories,
        website: body.website,
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
          meta: { slug: result.slug || '' },
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
        const existing = appDb.getBrandBySlug(brandSlug);
        if (!existing) return jsonRes(res, 404, { ok: false, error: 'brand_not_found', slug: brandSlug });

        if (String(body.name).trim() !== existing.canonical_name) {
          const renameResult = await renameBrand({
            config, appDb,
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

          const remainingPatch = {};
          if (body.aliases !== undefined) remainingPatch.aliases = body.aliases;
          if (body.categories !== undefined) remainingPatch.categories = body.categories;
          if (body.website !== undefined) remainingPatch.website = body.website;

          if (Object.keys(remainingPatch).length > 0) {
            await updateBrand({ config, appDb, slug: renameResult.newSlug, patch: remainingPatch });
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
      const result = await updateBrand({ config, appDb, slug: brandSlug, patch: body });
      if (result?.ok) {
        const categories = Array.isArray(result?.brand?.categories)
          ? result.brand.categories.filter(Boolean)
          : [];
        emitDataChange({
          broadcastWs,
          event: 'brand-update',
          category: categories.length > 0 ? 'all' : '',
          categories,
          meta: { slug: result.slug || brandSlug },
        });
      }
      return jsonRes(res, result.ok ? 200 : 404, result);
    }

    // DELETE /api/v1/brands/{slug}
    if (parts[0] === 'brands' && parts[1] && method === 'DELETE') {
      const force = params.get('force') === 'true';
      const result = await removeBrand({ config, appDb, slug: parts[1], force, getSpecDb: resolveSpecDb });
      if (result?.ok) {
        const categories = Object.keys(result?.products_by_category || {}).filter(Boolean);
        emitDataChange({
          broadcastWs,
          event: 'brand-delete',
          category: categories.length > 0 ? 'all' : '',
          categories,
          meta: { slug: parts[1] },
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
