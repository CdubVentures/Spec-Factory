function cleanText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  const text = String(value).trim();
  const lowered = text.toLowerCase();
  if (!text || lowered === 'unk' || lowered === 'unknown' || lowered === 'n/a') return '';
  return text;
}

function parseStoredScalar(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return '';
  if (!text.startsWith('"')) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function normalizeScore(confidence) {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function cleanAliasList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = cleanText(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeComponentType(value) {
  return String(value || '').trim().toLowerCase();
}

function selfLockedComponentType(fieldKey, fieldRule) {
  const key = normalizeComponentType(fieldKey);
  const source = String(fieldRule?.enum?.source || fieldRule?.enum_source || '').trim();
  return key && source === `component_db.${key}` ? key : '';
}

function projectedComponentField(fieldRule) {
  const projection = fieldRule?.component_identity_projection;
  if (!projection || typeof projection !== 'object') return null;
  const componentType = normalizeComponentType(projection.component_type);
  const facet = normalizeComponentType(projection.facet);
  if (!componentType || !facet) return null;
  return { componentType, facet };
}

function resolveComponentPublishTarget({ fieldKey, fieldRule }) {
  const selfType = selfLockedComponentType(fieldKey, fieldRule);
  if (selfType) return { kind: 'component', componentType: selfType };

  const projection = projectedComponentField(fieldRule);
  if (projection?.facet === 'brand') {
    return { kind: 'brand', componentType: projection.componentType };
  }

  return null;
}

function readResolvedText({ specDb, productId, fieldKey }) {
  const row = specDb?.getResolvedFieldCandidate?.(productId, fieldKey);
  return cleanText(parseStoredScalar(row?.value));
}

function readResolvedMetadata({ specDb, productId, fieldKey }) {
  const row = specDb?.getResolvedFieldCandidate?.(productId, fieldKey);
  return row?.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
}

function resolvePublishedPair({ specDb, productId, target, publishedValue }) {
  const componentKey = target.componentType;
  const brandKey = `${target.componentType}_brand`;
  const publishedText = cleanText(publishedValue);
  const componentName = target.kind === 'component'
    ? publishedText
    : readResolvedText({ specDb, productId, fieldKey: componentKey });
  const componentMaker = target.kind === 'brand'
    ? publishedText
    : readResolvedText({ specDb, productId, fieldKey: brandKey });

  return { componentName, componentMaker };
}

function missingPairParts({ componentName, componentMaker }) {
  const missing = [];
  if (!componentName) missing.push('component');
  if (!componentMaker) missing.push('brand');
  return missing;
}

function normalizeAliasMetadata(metadata) {
  const raw = metadata?.component_identity_aliases;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      hasComponent: false,
      hasBrand: false,
      component: [],
      brand: [],
    };
  }
  const hasComponent = Object.prototype.hasOwnProperty.call(raw, 'component');
  const hasBrand = Object.prototype.hasOwnProperty.call(raw, 'brand');
  return {
    hasComponent,
    hasBrand,
    component: cleanAliasList(raw.component),
    brand: cleanAliasList(raw.brand),
  };
}

function mergeAliasMetadata(entries) {
  const component = [];
  const brand = [];
  let hasComponent = false;
  let hasBrand = false;
  for (const entry of entries) {
    hasComponent = hasComponent || entry.hasComponent;
    hasBrand = hasBrand || entry.hasBrand;
    component.push(...entry.component);
    brand.push(...entry.brand);
  }
  return {
    hasComponent,
    hasBrand,
    component: cleanAliasList(component),
    brand: cleanAliasList(brand),
  };
}

function resolvePairAliasMetadata({ specDb, productId, target, metadata }) {
  const current = normalizeAliasMetadata(metadata);
  const otherFieldKey = target.kind === 'component'
    ? `${target.componentType}_brand`
    : target.componentType;
  const other = normalizeAliasMetadata(readResolvedMetadata({ specDb, productId, fieldKey: otherFieldKey }));
  return mergeAliasMetadata([current, other]);
}

function insertAliasGroup({ specDb, componentIdentityId, aliases, source, canonicalName, maker }) {
  if (!componentIdentityId || !source) return;
  specDb.deleteComponentAliasesBySource?.(componentIdentityId, source);
  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    if (lower === canonicalName.toLowerCase() || lower === maker.toLowerCase()) continue;
    specDb.insertAlias?.(componentIdentityId, alias, source);
  }
}

function persistAliases({ specDb, componentIdentityId, aliasMetadata, componentName, componentMaker }) {
  if (!aliasMetadata || !componentIdentityId) return;
  if (aliasMetadata.hasComponent) {
    insertAliasGroup({
      specDb,
      componentIdentityId,
      aliases: aliasMetadata.component,
      source: 'key_finder_component_alias',
      canonicalName: componentName,
      maker: componentMaker,
    });
  }
  if (aliasMetadata.hasBrand) {
    insertAliasGroup({
      specDb,
      componentIdentityId,
      aliases: aliasMetadata.brand,
      source: 'key_finder_brand_alias',
      canonicalName: componentName,
      maker: componentMaker,
    });
  }
}

export function syncPublishedComponentIdentity({
  specDb,
  productId,
  fieldKey,
  fieldRule,
  publishedValue,
  confidence,
  variantId,
  metadata,
}) {
  const target = resolveComponentPublishTarget({ fieldKey, fieldRule });
  if (!target) return null;
  if (variantId) return { status: 'skipped_variant_scope', componentType: target.componentType };

  const { componentName, componentMaker } = resolvePublishedPair({
    specDb,
    productId,
    target,
    publishedValue,
  });
  const missing = missingPairParts({ componentName, componentMaker });
  if (missing.length > 0) {
    return { status: 'waiting_for_pair', componentType: target.componentType, missing };
  }

  const aliasMetadata = resolvePairAliasMetadata({ specDb, productId, target, metadata });
  const identity = specDb.upsertComponentIdentity({
    componentType: target.componentType,
    canonicalName: componentName,
    maker: componentMaker,
    links: null,
    source: 'component_publisher',
  });
  persistAliases({
    specDb,
    componentIdentityId: identity?.id,
    aliasMetadata,
    componentName,
    componentMaker,
  });
  specDb.upsertItemComponentLink({
    productId,
    fieldKey: target.componentType,
    componentType: target.componentType,
    componentName,
    componentMaker,
    matchType: 'published_identity',
    matchScore: normalizeScore(confidence),
  });

  return {
    status: 'linked',
    componentType: target.componentType,
    componentName,
    componentMaker,
  };
}
