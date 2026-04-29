import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { FINDER_MODULES } from '../../core/finder/finderModuleRegistry.js';
import { isConcreteEvidence } from '../../features/key/index.js';
import { normalizeConfidence } from '../../features/publisher/index.js';
import { resolveProductImageDependencyStatus } from '../../features/product-image/productImageIdentityDependencies.js';
import { resolveCarouselViewSettings } from '../../features/product-image/carouselSlotSettings.js';

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

function readFieldKeyOrderCount(specDb, category) {
  const row = specDb.getFieldKeyOrder?.(category);
  if (!row) return 0;
  try {
    const parsed = JSON.parse(row.order_json || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function productIdOf(row) {
  return String(row?.product_id || '').trim();
}

function shouldUseCategoryProjection(productRows) {
  return Array.isArray(productRows) && productRows.length > 1;
}

function productIdSet(productRows) {
  return new Set((productRows || []).map(productIdOf).filter(Boolean));
}

function groupRowsByProduct(rows, allowedProductIds = null) {
  const map = new Map();
  for (const row of rows || []) {
    const productId = productIdOf(row);
    if (!productId) continue;
    if (allowedProductIds && !allowedProductIds.has(productId)) continue;
    if (!map.has(productId)) map.set(productId, []);
    map.get(productId).push(row);
  }
  return map;
}

function buildCandidatesByProduct(specDb, productRows) {
  if (
    !shouldUseCategoryProjection(productRows)
    || typeof specDb?.getAllFieldCandidatesByCategory !== 'function'
  ) {
    return null;
  }
  return groupRowsByProduct(
    specDb.getAllFieldCandidatesByCategory() || [],
    productIdSet(productRows),
  );
}

function buildVariantsByProduct(specDb, productRows) {
  if (
    !shouldUseCategoryProjection(productRows)
    || typeof specDb?.variants?.listByCategory !== 'function'
  ) {
    return null;
  }
  return groupRowsByProduct(
    specDb.variants.listByCategory() || [],
    productIdSet(productRows),
  );
}

function buildPifProgressByProduct(specDb, productRows) {
  if (
    !shouldUseCategoryProjection(productRows)
    || typeof specDb?.listPifVariantProgressByCategory !== 'function'
  ) {
    return null;
  }
  return groupRowsByProduct(
    specDb.listPifVariantProgressByCategory() || [],
    productIdSet(productRows),
  );
}

function buildCefRunCountsByProduct(specDb, category, productRows) {
  if (
    !shouldUseCategoryProjection(productRows)
    || typeof specDb?.listColorEditionFinderRunsByCategory !== 'function'
  ) {
    return null;
  }
  const counts = new Map();
  const allowedProductIds = productIdSet(productRows);
  for (const row of specDb.listColorEditionFinderRunsByCategory(category) || []) {
    const productId = productIdOf(row);
    if (!productId || !allowedProductIds.has(productId)) continue;
    counts.set(productId, (counts.get(productId) || 0) + 1);
  }
  return counts;
}

function buildResolvedFieldKeysByProduct(candidatesByProduct) {
  if (!candidatesByProduct) return null;
  const map = new Map();
  for (const [productId, candidates] of candidatesByProduct.entries()) {
    const fieldKeys = new Set(
      candidates
        .filter((candidate) => String(candidate.status || '').trim() === 'resolved')
        .map((candidate) => String(candidate.field_key || '').trim())
        .filter(Boolean),
    );
    map.set(productId, fieldKeys);
  }
  return map;
}

function buildCandidatesByProductField(candidatesByProduct) {
  if (!candidatesByProduct) return null;
  const map = new Map();
  for (const [productId, candidates] of candidatesByProduct.entries()) {
    const byField = new Map();
    for (const candidate of candidates || []) {
      const fieldKey = String(candidate.field_key || '').trim();
      if (!fieldKey) continue;
      if (!byField.has(fieldKey)) byField.set(fieldKey, []);
      byField.get(fieldKey).push(candidate);
    }
    map.set(productId, byField);
  }
  return map;
}

function evidenceBucketKey(row) {
  return [
    String(row?.product_id || ''),
    String(row?.field_key || ''),
    String(row?.variant_id_key ?? ''),
    String(row?.value_fingerprint ?? ''),
  ].join('\u0000');
}

function normalizedConfidencePasses(value, threshold) {
  const raw = Number(value || 0);
  const normalized = raw > 1 ? raw / 100 : raw;
  return normalized >= Number(threshold || 0);
}

function buildConcreteFieldKeysByProduct(specDb, gateKnobs, productRows) {
  const gateActive = gateKnobs.excludeConf > 0 && gateKnobs.excludeEvd > 0;
  if (
    !gateActive
    || !shouldUseCategoryProjection(productRows)
    || typeof specDb?.listFieldBucketsByCategory !== 'function'
    || typeof specDb?.listPooledQualifyingEvidenceCountsByCategory !== 'function'
  ) {
    return null;
  }

  const threshold = Number(gateKnobs.excludeConf) / 100;
  const required = Math.floor(Number(gateKnobs.excludeEvd) || 0);
  const allowedProductIds = productIdSet(productRows);
  const countsByBucket = new Map();
  for (const row of specDb.listPooledQualifyingEvidenceCountsByCategory({ minConfidence: threshold }) || []) {
    countsByBucket.set(evidenceBucketKey(row), Number(row.total || 0));
  }

  const map = new Map();
  for (const bucket of specDb.listFieldBucketsByCategory() || []) {
    const productId = productIdOf(bucket);
    const fieldKey = String(bucket.field_key || '').trim();
    if (!productId || !fieldKey || !allowedProductIds.has(productId)) continue;
    if (!normalizedConfidencePasses(bucket.top_confidence, threshold)) continue;
    if ((countsByBucket.get(evidenceBucketKey(bucket)) || 0) < required) continue;
    if (!map.has(productId)) map.set(productId, new Set());
    map.get(productId).add(fieldKey);
  }
  return map;
}

function readCompiledFields(specDb) {
  const compiled = specDb?.getCompiledRules?.() || null;
  return compiled?.fields || {};
}

function getCandidatesForProduct(specDb, productId, context) {
  if (context.candidatesByProduct) return context.candidatesByProduct.get(productId) || [];
  return specDb.getAllFieldCandidatesByProduct?.(productId) || [];
}

function variantMatches(row, variantId) {
  return (row?.variant_id ?? null) === (variantId ?? null);
}

function getFieldCandidatesForProduct(specDb, productId, fieldKey, variantId, context) {
  if (!context.candidatesByProduct) {
    return specDb.getFieldCandidatesByProductAndField?.(productId, fieldKey, variantId) || [];
  }
  if (context.candidatesByProductField) {
    return (context.candidatesByProductField.get(productId)?.get(String(fieldKey || '')) || [])
      .filter((candidate) => variantId === undefined || variantMatches(candidate, variantId));
  }
  return (context.candidatesByProduct.get(productId) || [])
    .filter((candidate) => String(candidate.field_key || '') === String(fieldKey || ''))
    .filter((candidate) => variantId === undefined || variantMatches(candidate, variantId));
}

function getVariantsForProduct(specDb, productId, context) {
  if (context.variantsByProduct) return context.variantsByProduct.get(productId) || [];
  return specDb.variants?.listByProduct?.(productId) || [];
}

function getPifProgressForProduct(specDb, productId, context) {
  if (context.pifProgressByProduct) return context.pifProgressByProduct.get(productId) || [];
  return specDb.listPifVariantProgressByProduct?.(productId) || [];
}

function getCefRunCountForProduct(specDb, productId, context) {
  if (context.cefRunCountsByProduct) return context.cefRunCountsByProduct.get(productId) || 0;
  return (specDb.listColorEditionFinderRuns?.(productId) || []).length;
}

function pickTopCandidate(candidates) {
  let top = null;
  for (const candidate of candidates || []) {
    if (!top) {
      top = candidate;
      continue;
    }
    const topConf = Number(top.confidence) || 0;
    const candidateConf = Number(candidate.confidence) || 0;
    if (candidateConf > topConf) {
      top = candidate;
      continue;
    }
    if (
      candidateConf === topConf
      && String(candidate.status) === 'resolved'
      && String(top.status) !== 'resolved'
    ) {
      top = candidate;
    }
  }
  return top;
}

function pickTopResolvedCandidate(candidates) {
  return pickTopCandidate(
    (candidates || []).filter((candidate) => String(candidate.status || '') === 'resolved'),
  );
}

function buildProductImageDependencyFields(compiledFields) {
  return Object.fromEntries(
    Object.entries(compiledFields || {})
      .filter(([, rule]) => rule?.product_image_dependent === true),
  );
}

function createProjectionSpecDb(specDb, context) {
  if (!context.candidatesByProduct) return specDb;
  return {
    getCompiledRules: () => ({ fields: context.productImageDependencyFields }),
    getFieldCandidatesByProductAndField: (productId, fieldKey, variantId) =>
      getFieldCandidatesForProduct(specDb, productId, fieldKey, variantId, context),
    getResolvedFieldCandidate: (productId, fieldKey) =>
      pickTopResolvedCandidate(
        getFieldCandidatesForProduct(specDb, productId, fieldKey, undefined, context),
      ),
  };
}

// Joins pif_variant_progress rows with variants metadata for the Overview cell.
// Every active variant produces a row — if no progress is recorded yet, the
// row carries zero filled counts with targets from the PIF settings, so empty
// rings still render (user confirmed 2026-04-23: "show empty rings if
// variant exists").
function buildPifVariants(specDb, productId, pifTargets, context) {
  const variants = getVariantsForProduct(specDb, productId, context);
  if (variants.length === 0) return [];
  const progressRows = getPifProgressForProduct(specDb, productId, context);
  const progressById = new Map();
  for (const p of progressRows) progressById.set(p.variant_id, p);

  return variants.map((v) => {
    const p = progressById.get(v.variant_id);
    return {
      variant_id: v.variant_id,
      variant_key: v.variant_key || '',
      variant_label: String(v.variant_label || ''),
      color_atoms: Array.isArray(v.color_atoms) ? v.color_atoms : [],
      priority_filled: Number(p?.priority_filled) || 0,
      priority_total: Number(p?.priority_total) || pifTargets.priorityTotal,
      loop_filled: Number(p?.loop_filled) || 0,
      loop_total: Number(p?.loop_total) || pifTargets.loopTotal,
      hero_filled: Number(p?.hero_filled) || 0,
      hero_target: Number(p?.hero_target) || pifTargets.heroTarget,
      image_count: Number(p?.image_count) || 0,
    };
  });
}

// Per-variant snapshot of a scalar field's top candidate. SKU + RDF share
// this shape — they're both variant-scoped scalars. Returns one row per
// active variant, with empty value + 0 confidence when no candidate exists
// (so empty-diamond cells render for every known variant).
function buildScalarVariants(specDb, productId, fieldKey, context) {
  const variants = getVariantsForProduct(specDb, productId, context);
  if (variants.length === 0) return [];

  return variants.map((v) => {
    const candidates = getFieldCandidatesForProduct(specDb, productId, fieldKey, v.variant_id, context);
    // Pick highest-confidence candidate for this variant. Tie-break: resolved
    // status wins (it's the authoritative value the publisher picked).
    const top = pickTopCandidate(candidates);
    return {
      variant_id: v.variant_id,
      variant_key: v.variant_key || '',
      variant_label: String(v.variant_label || ''),
      color_atoms: Array.isArray(v.color_atoms) ? v.color_atoms : [],
      value: String(top?.value ?? ''),
      confidence: Number(top?.confidence) || 0,
    };
  });
}

// Live read of the PIF settings that drive ring totals. Called once per
// catalog refresh, shared across all products (category-scoped).
function readPifTargets(specDb, category) {
  const finderStore = specDb.getFinderStore?.('productImageFinder');
  if (!finderStore?.getSetting) {
    return { priorityTotal: 0, loopTotal: 0, heroTarget: 0 };
  }
  const heroEnabledRaw = finderStore.getSetting('heroEnabled');
  const heroEnabled = String(heroEnabledRaw ?? 'true') !== 'false';
  const heroCount = parseInt(finderStore.getSetting('heroCount') || '3', 10) || 3;
  const { carouselScoredViews, carouselExtraTarget } = resolveCarouselViewSettings({ finderStore, category });

  return {
    priorityTotal: carouselScoredViews.length,
    loopTotal: carouselExtraTarget,
    heroTarget: heroEnabled ? heroCount : 0,
  };
}

// KeyFinder tier progress — 5-bucket rollup per product for the Overview "Keys"
// cell. Buckets: easy/medium/hard/very_hard (from fieldRule.difficulty) +
// mandatory (overlapping bucket — any key with required_level='mandatory' also
// counts here, regardless of difficulty). Per bucket we emit:
//   - total     → capacity (keys assigned to this tier for the category)
//   - resolved  → outer ring (candidate cascade resolved — has a picked value)
//   - perfect   → inner ring (concrete-evidence gate passed — "not improvable")
// Reserved keys (CEF/PIF/RDF/SKF-owned) are excluded: keyFinder never touches
// them, so they shouldn't count toward keyFinder progress.
const KEY_TIER_ORDER = Object.freeze(['easy', 'medium', 'hard', 'very_hard', 'mandatory']);

function emptyKeyTierBuckets() {
  return {
    easy:      { tier: 'easy',      total: 0, resolved: 0, perfect: 0 },
    medium:    { tier: 'medium',    total: 0, resolved: 0, perfect: 0 },
    hard:      { tier: 'hard',      total: 0, resolved: 0, perfect: 0 },
    very_hard: { tier: 'very_hard', total: 0, resolved: 0, perfect: 0 },
    mandatory: { tier: 'mandatory', total: 0, resolved: 0, perfect: 0 },
  };
}

function cloneKeyTierBuckets(baseTiers) {
  return Object.fromEntries(
    KEY_TIER_ORDER.map((tier) => [
      tier,
      {
        tier,
        total: Number(baseTiers?.[tier]?.total || 0),
        resolved: 0,
        perfect: 0,
      },
    ]),
  );
}

function buildKeyTierFieldIndex(compiledFields) {
  const baseTiers = emptyKeyTierBuckets();
  const byFieldKey = new Map();

  for (const [fk, rule] of Object.entries(compiledFields || {})) {
    if (!rule || isReservedFieldKey(fk)) continue;
    const difficulty = String(rule.difficulty || 'medium');
    const bucket = baseTiers[difficulty];
    if (!bucket) continue;
    const isMandatory = String(rule.required_level || '') === 'mandatory';

    bucket.total += 1;
    if (isMandatory) baseTiers.mandatory.total += 1;
    byFieldKey.set(fk, { tier: difficulty, mandatory: isMandatory });
  }

  return { baseTiers, byFieldKey };
}

function incrementKeyTierMetric(tiers, fieldIndex, fieldKey, metric) {
  const entry = fieldIndex.get(fieldKey);
  if (!entry) return;
  tiers[entry.tier][metric] += 1;
  if (entry.mandatory) tiers.mandatory[metric] += 1;
}

function hasResolvedField(specDb, productId, fieldKey, context) {
  if (context.resolvedFieldKeysByProduct) {
    return context.resolvedFieldKeysByProduct.get(productId)?.has(fieldKey) || false;
  }
  return typeof specDb?.getResolvedFieldCandidate === 'function'
    ? Boolean(specDb.getResolvedFieldCandidate(productId, fieldKey))
    : false;
}

function hasConcreteField(specDb, productId, fieldKey, fieldRule, context) {
  const gateKnobs = context.keyGateKnobs;
  const gateActive = gateKnobs.excludeConf > 0 && gateKnobs.excludeEvd > 0;
  if (!gateActive) return false;
  if (context.concreteFieldKeysByProduct) {
    return context.concreteFieldKeysByProduct.get(productId)?.has(fieldKey) || false;
  }
  return isConcreteEvidence({
    specDb, productId, fieldKey, fieldRule,
    excludeConf: gateKnobs.excludeConf,
    excludeEvd: gateKnobs.excludeEvd,
  });
}

function buildKeyTierProgress(specDb, productId, context) {
  const gateKnobs = context.keyGateKnobs;
  const gateActive = gateKnobs.excludeConf > 0 && gateKnobs.excludeEvd > 0;
  if (
    context.keyTierFieldIndex
    && context.resolvedFieldKeysByProduct
    && (!gateActive || context.concreteFieldKeysByProduct)
  ) {
    const tiers = cloneKeyTierBuckets(context.keyTierFieldIndex.baseTiers);
    const resolvedFields = context.resolvedFieldKeysByProduct.get(productId) || new Set();
    for (const fieldKey of resolvedFields) {
      incrementKeyTierMetric(tiers, context.keyTierFieldIndex.byFieldKey, fieldKey, 'resolved');
    }
    if (gateActive) {
      const concreteFields = context.concreteFieldKeysByProduct.get(productId) || new Set();
      for (const fieldKey of concreteFields) {
        incrementKeyTierMetric(tiers, context.keyTierFieldIndex.byFieldKey, fieldKey, 'perfect');
      }
    }
    return KEY_TIER_ORDER.map((t) => tiers[t]);
  }

  const fields = context.compiledFields || {};
  const tiers = emptyKeyTierBuckets();

  for (const [fk, rule] of Object.entries(fields)) {
    if (!rule || isReservedFieldKey(fk)) continue;
    const difficulty = String(rule.difficulty || 'medium');
    const bucket = tiers[difficulty];
    if (!bucket) continue;
    const isMandatory = String(rule.required_level || '') === 'mandatory';

    const resolved = hasResolvedField(specDb, productId, fk, context);
    const perfect = hasConcreteField(specDb, productId, fk, rule, context);

    bucket.total += 1;
    if (resolved) bucket.resolved += 1;
    if (perfect) bucket.perfect += 1;

    if (isMandatory) {
      tiers.mandatory.total += 1;
      if (resolved) tiers.mandatory.resolved += 1;
      if (perfect) tiers.mandatory.perfect += 1;
    }
  }
  return KEY_TIER_ORDER.map((t) => tiers[t]);
}

function buildPifDependencyStatus(specDb, category, productRow, context) {
  const status = resolveProductImageDependencyStatus({
    specDb: context.projectedSpecDb,
    product: {
      ...productRow,
      product_id: productRow.product_id,
      category,
    },
  });
  return {
    pifDependencyReady: status.ready,
    pifDependencyRequiredKeys: status.required_keys,
    pifDependencyResolvedKeys: status.resolved_keys,
    pifDependencyMissingKeys: status.missing_keys,
  };
}

// Concrete-gate knob pair — read once per catalog refresh (category-scoped),
// shared across all products. Mirrors readBundlingSettings in keyFinderRoutes.
function readKeyFinderGateKnobs(specDb) {
  const store = specDb?.getFinderStore?.('keyFinder') ?? null;
  const read = (k, d) => {
    const v = store?.getSetting?.(k);
    return (v === undefined || v === null || v === '') ? d : v;
  };
  const excludeConf = parseInt(read('passengerExcludeAtConfidence', '95'), 10) || 0;
  const excludeEvd = parseInt(read('passengerExcludeMinEvidence', '3'), 10) || 0;
  return { excludeConf, excludeEvd };
}

// Per-worker last-run lookup. One query per finder summary table, amortized
// across every product in the category — avoids 5×N point lookups inside the
// per-product loop. Each finder's summary row carries product_id +
// latest_ran_at (see specDbSchema.js + finderSqlStore.js::listByCategory).
function buildLastRunMap(specDb, moduleId, category) {
  const store = specDb.getFinderStore?.(moduleId);
  if (!store?.listByCategory) return new Map();
  const rows = store.listByCategory(category) || [];
  const map = new Map();
  for (const row of rows) {
    const pid = row?.product_id;
    const ts = String(row?.latest_ran_at || '');
    if (pid && ts) map.set(pid, ts);
  }
  return map;
}

function catalogLastRunPrefix(mod) {
  return String(mod.catalogKey || mod.moduleType || '').trim().toLowerCase();
}

function buildLastRunMaps(specDb, category) {
  return Object.fromEntries(
    FINDER_MODULES.map((mod) => [
      catalogLastRunPrefix(mod),
      buildLastRunMap(specDb, mod.id, category),
    ]),
  );
}

function buildCatalogProjectionContext(specDb, category, productRows = []) {
  const keyGateKnobs = readKeyFinderGateKnobs(specDb);
  const compiledFields = readCompiledFields(specDb);
  const candidatesByProduct = buildCandidatesByProduct(specDb, productRows);
  const context = {
    totalFieldCount: readFieldKeyOrderCount(specDb, category),
    pifTargets: readPifTargets(specDb, category),
    keyGateKnobs,
    compiledFields,
    productImageDependencyFields: buildProductImageDependencyFields(compiledFields),
    keyTierFieldIndex: buildKeyTierFieldIndex(compiledFields),
    lastRunMaps: buildLastRunMaps(specDb, category),
    candidatesByProduct,
    candidatesByProductField: buildCandidatesByProductField(candidatesByProduct),
    resolvedFieldKeysByProduct: buildResolvedFieldKeysByProduct(candidatesByProduct),
    concreteFieldKeysByProduct: buildConcreteFieldKeysByProduct(specDb, keyGateKnobs, productRows),
    variantsByProduct: buildVariantsByProduct(specDb, productRows),
    pifProgressByProduct: buildPifProgressByProduct(specDb, productRows),
    cefRunCountsByProduct: buildCefRunCountsByProduct(specDb, category, productRows),
  };
  context.projectedSpecDb = createProjectionSpecDb(specDb, context);
  return context;
}

function buildCatalogRowFromSql({ specDb, cleanVariant, category, row, context }) {
  if (!row || typeof row !== 'object') return null;
  const pid = String(row.product_id || '').trim();
  if (!pid) return null;

  const brand = String(row.brand || '').trim();
  const base_model = String(row.base_model || '').trim();
  const variant = cleanVariant(row.variant);
  const model = String(row.model || '').trim() || [base_model, variant].filter(Boolean).join(' ').trim();
  if (!brand || !base_model) return null;

  const candidates = getCandidatesForProduct(specDb, pid, context);
  const resolvedCandidates = candidates.filter(c => String(c.status || '').trim() === 'resolved');
  const fieldKeysWithData = new Set(resolvedCandidates.map(c => String(c.field_key || '').trim()).filter(Boolean));
  const avgConfidence = resolvedCandidates.length > 0
    ? resolvedCandidates.reduce((s, c) => s + normalizeConfidence(Number(c.confidence)), 0) / resolvedCandidates.length
    : 0;

  const cefRunCount = getCefRunCountForProduct(specDb, pid, context);
  const pifVariants = buildPifVariants(specDb, pid, context.pifTargets, context);
  const skuVariants = buildScalarVariants(specDb, pid, 'sku', context);
  const rdfVariants = buildScalarVariants(specDb, pid, 'release_date', context);
  const keyTierProgress = buildKeyTierProgress(specDb, pid, context);
  const pifDependencyStatus = buildPifDependencyStatus(specDb, category, row, context);
  const lastRunFields = Object.fromEntries(
    FINDER_MODULES.map((mod) => [
      `${catalogLastRunPrefix(mod)}LastRunAt`,
      context.lastRunMaps[catalogLastRunPrefix(mod)]?.get(pid) || '',
    ]),
  );

  return {
    productId: pid,
    id: row.id || 0,
    identifier: String(row.identifier || '').trim(),
    brand,
    brand_identifier: String(row.brand_identifier || '').trim(),
    model,
    base_model,
    variant,
    status: row.status || 'active',
    confidence: avgConfidence,
    coverage: context.totalFieldCount > 0 ? fieldKeysWithData.size / context.totalFieldCount : 0,
    fieldsFilled: fieldKeysWithData.size,
    fieldsTotal: context.totalFieldCount,
    cefRunCount,
    ...pifDependencyStatus,
    pifVariants,
    skuVariants,
    rdfVariants,
    keyTierProgress,
    ...lastRunFields,
  };
}

function buildCatalogFromSql({ specDb, cleanVariant, category }) {
  if (!specDb) return [];

  const allProducts = specDb.getAllProducts() || [];
  const context = buildCatalogProjectionContext(specDb, category, allProducts);
  const seen = new Map();

  for (const row of allProducts) {
    const pid = String(row?.product_id || '').trim();
    if (!pid) continue;
    if (seen.has(pid)) continue;
    const catalogRow = buildCatalogRowFromSql({ specDb, cleanVariant, category, row, context });
    if (!catalogRow) continue;
    seen.set(pid, catalogRow);
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
  getSpecDb,
  cleanVariant,
} = {}) {
  assertFunction('getSpecDb', getSpecDb);
  assertFunction('cleanVariant', cleanVariant);

  return async function buildCatalog(category) {
    const specDb = getSpecDb(category);
    return buildCatalogFromSql({ specDb, cleanVariant, category });
  };
}

export function createCatalogRowBuilder({
  getSpecDb,
  cleanVariant,
} = {}) {
  assertFunction('getSpecDb', getSpecDb);
  assertFunction('cleanVariant', cleanVariant);

  return async function buildCatalogRow(category, productId) {
    const specDb = getSpecDb(category);
    const normalizedProductId = String(productId || '').trim();
    if (!specDb || !normalizedProductId) return null;

    const row = typeof specDb.getProduct === 'function'
      ? specDb.getProduct(normalizedProductId)
      : (specDb.getAllProducts?.() || []).find((product) => product?.product_id === normalizedProductId) || null;
    if (!row) return null;

    const context = buildCatalogProjectionContext(specDb, category, [row]);
    return buildCatalogRowFromSql({ specDb, cleanVariant, category, row, context });
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
