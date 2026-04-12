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

// WHY: SQL-first catalog builder. Reads directly from specDb (products table) for the GUI dropdown.

async function buildCatalogFromSql({ specDb, storage, cleanVariant, category }) {
  if (!specDb) return [];

  const allProducts = specDb.getAllProducts() || [];
  const fieldOrder = specDb.getFieldKeyOrder?.(category) || [];
  const totalFieldCount = Array.isArray(fieldOrder) ? fieldOrder.length : 0;

  const seen = new Map();

  for (const row of allProducts) {
    const pid = row.product_id;
    const brand = String(row.brand || '').trim();
    const base_model = String(row.base_model || '').trim();
    const variant = cleanVariant(row.variant);
    const model = String(row.model || '').trim() || [base_model, variant].filter(Boolean).join(' ').trim();
    if (!brand || !base_model) continue;
    if (seen.has(pid)) continue;

    const hasFinal = await storage.objectExists(`final/${category}/${pid}/normalized.json`).catch(() => false);

    // WHY: Enrich from field_candidates to show real confidence/coverage in the overview.
    const candidates = specDb.getAllFieldCandidatesByProduct?.(pid) || [];
    const resolvedCandidates = candidates.filter(c => String(c.status || '').trim() === 'resolved');
    const fieldKeysWithData = new Set(resolvedCandidates.map(c => String(c.field_key || '').trim()).filter(Boolean));
    const totalConfidence = resolvedCandidates.length > 0
      ? resolvedCandidates.reduce((s, c) => s + (Number(c.confidence) || 0), 0) / resolvedCandidates.length / 100
      : 0;
    const lastUpdated = candidates.reduce((latest, c) => {
      const ts = c.updated_at || '';
      return ts > latest ? ts : latest;
    }, '');

    seen.set(pid, {
      productId: pid,
      id: row.id || 0,
      identifier: String(row.identifier || '').trim(),
      brand,
      brand_identifier: String(row.brand_identifier || '').trim(),
      model,
      base_model,
      variant,
      status: row.status || 'active',
      hasFinal,
      validated: resolvedCandidates.length > 0,
      confidence: totalConfidence,
      coverage: totalFieldCount > 0 ? fieldKeysWithData.size / totalFieldCount : 0,
      fieldsFilled: fieldKeysWithData.size,
      fieldsTotal: totalFieldCount,
      lastRun: lastUpdated,
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
