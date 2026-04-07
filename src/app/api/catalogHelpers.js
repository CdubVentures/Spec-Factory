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

// WHY: SQL-first catalog builder. Reads directly from specDb (products + product_queue
// tables) for the GUI dropdown.

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
    const base_model = String(row.base_model || '').trim();
    const variant = cleanVariant(row.variant);
    const model = String(row.model || '').trim() || [base_model, variant].filter(Boolean).join(' ').trim();
    if (!brand || !base_model) continue;
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
      base_model,
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
    a.base_model.localeCompare(b.base_model) ||
    a.variant.localeCompare(b.variant)
  );
  return rows;
}

export function createCatalogBuilder({
  config,
  storage,
  getSpecDb,
  cleanVariant,
} = {}) {
  assertObject('config', config);
  assertObject('storage', storage);
  assertFunction('getSpecDb', getSpecDb);
  assertFunction('cleanVariant', cleanVariant);

  return async function buildCatalog(category) {
    const specDb = getSpecDb(category);
    return buildCatalogFromSql({ specDb, storage, cleanVariant, category });
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
