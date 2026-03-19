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

export function createCatalogBuilder({
  config,
  storage,
  getSpecDb,
  loadQueueState,
  loadProductCatalog,
  cleanVariant,
  catalogKey,
  path,
} = {}) {
  assertObject('config', config);
  assertObject('storage', storage);
  assertFunction('getSpecDb', getSpecDb);
  assertFunction('loadQueueState', loadQueueState);
  assertFunction('loadProductCatalog', loadProductCatalog);
  assertFunction('cleanVariant', cleanVariant);
  assertFunction('catalogKey', catalogKey);
  assertObject('path', path);

  return async function buildCatalog(category) {
    const catalog = await loadProductCatalog(config, category);
    const inputKeys = await storage.listInputKeys(category);
    const specDb = getSpecDb(category);
    const queue = await loadQueueState({ storage, category, specDb }).catch(() => ({ state: { products: {} } }));
    const queueProducts = queue.state?.products || {};

    const seen = new Map();

    for (const [pid, entry] of Object.entries(catalog.products || {})) {
      const brand = String(entry.brand || '').trim();
      const model = String(entry.model || '').trim();
      const variant = cleanVariant(entry.variant);
      if (!brand || !model) continue;
      const key = catalogKey(brand, model, variant);
      if (seen.has(key)) continue;
      seen.set(key, {
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

    for (const inputKey of inputKeys) {
      const input = await storage.readJsonOrNull(inputKey);
      if (!input) continue;
      const existingProductId = input.productId || path.basename(inputKey, '.json').replace(`${category}-`, '');
      const il = input.identityLock || {};
      const brand = String(il.brand || input.brand || '').trim();
      const model = String(il.model || input.model || '').trim();
      const variant = cleanVariant(il.variant || input.variant);
      if (!brand || !model) continue;

      const latestBase = storage.resolveOutputKey(category, existingProductId, 'latest');
      const [summary, normalized, hasFinal] = await Promise.all([
        storage.readJsonOrNull(`${latestBase}/summary.json`),
        storage.readJsonOrNull(`${latestBase}/normalized.json`),
        storage.objectExists(`final/${category}/${existingProductId}/normalized.json`).catch(() => false),
      ]);
      const identity = normalized?.identity || {};
      const qp = queueProducts[existingProductId] || {};

      const resolvedBrand = identity.brand || brand;
      const resolvedModel = identity.model || model;
      let resolvedVariant = cleanVariant(identity.variant || variant);

      let key = catalogKey(resolvedBrand, resolvedModel, resolvedVariant);
      if (!seen.has(key) && resolvedVariant) {
        const keyNoVariant = catalogKey(resolvedBrand, resolvedModel, '');
        if (seen.has(keyNoVariant)) {
          resolvedVariant = '';
          key = keyNoVariant;
        }
      }

      if (!seen.has(key)) continue;

      const existing = seen.get(key);
      Object.assign(existing, {
        productId: existingProductId,
        status: qp.status || (summary ? 'complete' : 'pending'),
        hasFinal,
        validated: !!(summary?.validated),
        confidence: summary?.confidence || 0,
        coverage: (summary?.coverage_overall_percent || 0) / 100,
        fieldsFilled: summary?.fields_filled || 0,
        fieldsTotal: summary?.fields_total || 0,
        lastRun: summary?.lastRun || summary?.generated_at || '',
        inActive: existing.inActive || !!input.active || !!(input.targets && Object.keys(input.targets).length),
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
