function assertFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

// WHY: SQL-first catalog builder. When loadProductCatalog/loadQueueState are omitted,
// reads directly from specDb (products + product_queue tables). This eliminates the
// dependency on product_catalog.json and fixture input files for the GUI dropdown.
// Legacy path (JSON + fixtures) is kept for backward compat when those deps are provided.

function buildQueueLookup(queueRows) {
  const map = new Map();
  for (const row of queueRows) {
    if (row.product_id) map.set(row.product_id, row);
  }
  return map;
}

async function buildCatalogFromSql({ specDb, storage, cleanVariant, category }) {
  if (!specDb) return [];

  const allProducts = specDb.getAllProducts() || [];
  const queueRows = specDb.getAllQueueProducts?.() || [];
  const queueLookup = buildQueueLookup(queueRows);

  const seen = new Map();

  for (const row of allProducts) {
    const pid = row.product_id;
    const brand = String(row.brand || '').trim();
    const model = String(row.model || '').trim();
    const variant = cleanVariant(row.variant);
    if (!brand || !model) continue;
    if (seen.has(pid)) continue;

    const summary = specDb.getSummaryForProduct?.(pid) || null;
    const qp = queueLookup.get(pid) || {};
    const hasFinal = await storage.objectExists(`final/${category}/${pid}/normalized.json`).catch(() => false);

    seen.set(pid, {
      productId: pid,
      id: row.id || 0,
      identifier: String(row.identifier || '').trim(),
      brand,
      brand_identifier: String(row.brand_identifier || '').trim(),
      model,
      base_model: '',
      variant,
      status: qp.status || (summary ? 'complete' : 'pending'),
      hasFinal,
      validated: !!(summary?.validated),
      confidence: summary?.confidence || 0,
      coverage: (summary?.coverage_overall_percent || 0) / 100,
      fieldsFilled: summary?.fields_filled || 0,
      fieldsTotal: summary?.fields_total || 0,
      lastRun: summary?.lastRun || summary?.generated_at || '',
      inActive: true,
    });
  }

  const rows = [...seen.values()];
  rows.sort((a, b) =>
    a.brand.localeCompare(b.brand) ||
    a.model.localeCompare(b.model) ||
    a.variant.localeCompare(b.variant)
  );
  return rows;
}

export function createCatalogBuilder({
  config,
  storage,
  getSpecDb,
  loadQueueState,
  loadProductCatalog,
  cleanVariant,
  path,
} = {}) {
  assertObject('config', config);
  assertObject('storage', storage);
  assertFunction('getSpecDb', getSpecDb);
  assertFunction('cleanVariant', cleanVariant);

  // WHY: SQL-first path — when loadProductCatalog/loadQueueState are not provided,
  // read entirely from specDb. This is the new default for the GUI catalog.
  const useSqlPath = typeof loadProductCatalog !== 'function' || typeof loadQueueState !== 'function';

  if (!useSqlPath) {
    assertObject('path', path);
  }

  return async function buildCatalog(category) {
    const specDb = getSpecDb(category);

    if (useSqlPath) {
      return buildCatalogFromSql({ specDb, storage, cleanVariant, category });
    }

    // Legacy path — reads from catalog JSON
    const catalog = await loadProductCatalog(config, category);
    const queue = await loadQueueState({ storage, category, specDb }).catch(() => ({ state: { products: {} } }));
    const queueProducts = queue.state?.products || {};

    const seen = new Map();

    for (const [pid, entry] of Object.entries(catalog.products || {})) {
      const brand = String(entry.brand || '').trim();
      const model = String(entry.model || '').trim();
      const variant = cleanVariant(entry.variant);
      if (!brand || !model) continue;
      if (seen.has(pid)) continue;
      seen.set(pid, {
        productId: pid,
        id: entry.id || 0,
        identifier: entry.identifier || '',
        brand,
        model,
        base_model: String(entry.base_model || '').trim(),
        variant,
        status: 'pending',
        hasFinal: false,
        validated: false,
        confidence: 0,
        coverage: 0,
        fieldsFilled: 0,
        fieldsTotal: 0,
        lastRun: '',
        inActive: true,
      });
    }

    // WHY: Enrich each product from catalog with summary/queue data — no fixture scan.
    for (const [existingProductId, existing] of seen) {
      const latestBase = storage.resolveOutputKey(category, existingProductId, 'latest');
      const [summary, hasFinal] = await Promise.all([
        specDb
          ? Promise.resolve(specDb.getSummaryForProduct(existingProductId))
          : storage.readJsonOrNull(`${latestBase}/summary.json`),
        storage.objectExists(`final/${category}/${existingProductId}/normalized.json`).catch(() => false),
      ]);
      const qp = queueProducts[existingProductId] || {};

      Object.assign(existing, {
        status: qp.status || (summary ? 'complete' : 'pending'),
        hasFinal,
        validated: !!(summary?.validated),
        confidence: summary?.confidence || 0,
        coverage: (summary?.coverage_overall_percent || 0) / 100,
        fieldsFilled: summary?.fields_filled || 0,
        fieldsTotal: summary?.fields_total || 0,
        lastRun: summary?.lastRun || summary?.generated_at || '',
      });
    }

    const rows = [...seen.values()];
    rows.sort((a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      a.variant.localeCompare(b.variant)
    );
    return rows;
  };
}

export function createCompiledComponentDbPatcher({
  helperRoot,
  listFiles,
  safeReadJson,
  fs,
  path,
} = {}) {
  if (!String(helperRoot || '').trim()) {
    throw new TypeError('helperRoot must be a non-empty string');
  }
  assertFunction('listFiles', listFiles);
  assertFunction('safeReadJson', safeReadJson);
  assertObject('fs', fs);
  assertObject('path', path);
  assertFunction('fs.writeFile', fs.writeFile?.bind(fs));

  return async function patchCompiledComponentDb(category, componentType, entityName, propertyPatch, identityPatch) {
    const dbDir = path.join(helperRoot, category, '_generated', 'component_db');
    const files = await listFiles(dbDir, '.json');
    for (const f of files) {
      const fp = path.join(dbDir, f);
      const data = await safeReadJson(fp);
      if (data?.component_type !== componentType || !Array.isArray(data.items)) continue;
      const item = data.items.find((it) => it.name === entityName);
      if (!item) return;
      if (propertyPatch && typeof propertyPatch === 'object') {
        if (!item.properties) item.properties = {};
        Object.assign(item.properties, propertyPatch);
      }
      if (identityPatch && typeof identityPatch === 'object') {
        if (identityPatch.name !== undefined) item.name = identityPatch.name;
        if (identityPatch.maker !== undefined) item.maker = identityPatch.maker;
        if (identityPatch.links !== undefined) item.links = identityPatch.links;
        if (identityPatch.aliases !== undefined) item.aliases = identityPatch.aliases;
      }
      await fs.writeFile(fp, JSON.stringify(data, null, 2));
      return;
    }
  };
}
