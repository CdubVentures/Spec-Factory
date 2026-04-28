import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
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

// Joins pif_variant_progress rows with variants metadata for the Overview cell.
// Every active variant produces a row — if no progress is recorded yet, the
// row carries zero filled counts with targets from the PIF settings, so empty
// rings still render (user confirmed 2026-04-23: "show empty rings if
// variant exists").
function buildPifVariants(specDb, productId, pifTargets) {
  const variants = specDb.variants?.listByProduct?.(productId) || [];
  if (variants.length === 0) return [];
  const progressRows = specDb.listPifVariantProgressByProduct?.(productId) || [];
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
function buildScalarVariants(specDb, productId, fieldKey) {
  const variants = specDb.variants?.listByProduct?.(productId) || [];
  if (variants.length === 0) return [];

  return variants.map((v) => {
    const candidates = specDb.getFieldCandidatesByProductAndField?.(productId, fieldKey, v.variant_id) || [];
    // Pick highest-confidence candidate for this variant. Tie-break: resolved
    // status wins (it's the authoritative value the publisher picked).
    let top = null;
    for (const c of candidates) {
      if (!top) { top = c; continue; }
      const topConf = Number(top.confidence) || 0;
      const cConf = Number(c.confidence) || 0;
      if (cConf > topConf) { top = c; continue; }
      if (cConf === topConf && String(c.status) === 'resolved' && String(top.status) !== 'resolved') {
        top = c;
      }
    }
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

function buildKeyTierProgress(specDb, productId, gateKnobs) {
  const compiled = specDb?.getCompiledRules?.() || null;
  const fields = compiled?.fields || {};
  const tiers = {
    easy:      { tier: 'easy',      total: 0, resolved: 0, perfect: 0 },
    medium:    { tier: 'medium',    total: 0, resolved: 0, perfect: 0 },
    hard:      { tier: 'hard',      total: 0, resolved: 0, perfect: 0 },
    very_hard: { tier: 'very_hard', total: 0, resolved: 0, perfect: 0 },
    mandatory: { tier: 'mandatory', total: 0, resolved: 0, perfect: 0 },
  };
  const hasResolved = typeof specDb?.getResolvedFieldCandidate === 'function';
  const gateActive = gateKnobs.excludeConf > 0 && gateKnobs.excludeEvd > 0;

  for (const [fk, rule] of Object.entries(fields)) {
    if (!rule || isReservedFieldKey(fk)) continue;
    const difficulty = String(rule.difficulty || 'medium');
    const bucket = tiers[difficulty];
    if (!bucket) continue;
    const isMandatory = String(rule.required_level || '') === 'mandatory';

    const resolved = hasResolved
      ? Boolean(specDb.getResolvedFieldCandidate(productId, fk))
      : false;
    const perfect = gateActive
      ? isConcreteEvidence({
        specDb, productId, fieldKey: fk, fieldRule: rule,
        excludeConf: gateKnobs.excludeConf, excludeEvd: gateKnobs.excludeEvd,
      })
      : false;

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

function buildPifDependencyStatus(specDb, category, productRow) {
  const status = resolveProductImageDependencyStatus({
    specDb,
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

function buildLastRunMaps(specDb, category) {
  return {
    cef: buildLastRunMap(specDb, 'colorEditionFinder', category),
    pif: buildLastRunMap(specDb, 'productImageFinder', category),
    rdf: buildLastRunMap(specDb, 'releaseDateFinder', category),
    sku: buildLastRunMap(specDb, 'skuFinder', category),
    kf:  buildLastRunMap(specDb, 'keyFinder', category),
  };
}

function buildCatalogProjectionContext(specDb, category) {
  return {
    totalFieldCount: readFieldKeyOrderCount(specDb, category),
    pifTargets: readPifTargets(specDb, category),
    keyGateKnobs: readKeyFinderGateKnobs(specDb),
    lastRunMaps: buildLastRunMaps(specDb, category),
  };
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

  const candidates = specDb.getAllFieldCandidatesByProduct?.(pid) || [];
  const resolvedCandidates = candidates.filter(c => String(c.status || '').trim() === 'resolved');
  const fieldKeysWithData = new Set(resolvedCandidates.map(c => String(c.field_key || '').trim()).filter(Boolean));
  const avgConfidence = resolvedCandidates.length > 0
    ? resolvedCandidates.reduce((s, c) => s + normalizeConfidence(Number(c.confidence)), 0) / resolvedCandidates.length
    : 0;

  const cefRuns = specDb.listColorEditionFinderRuns?.(pid) || [];
  const pifVariants = buildPifVariants(specDb, pid, context.pifTargets);
  const skuVariants = buildScalarVariants(specDb, pid, 'sku');
  const rdfVariants = buildScalarVariants(specDb, pid, 'release_date');
  const keyTierProgress = buildKeyTierProgress(specDb, pid, context.keyGateKnobs);
  const pifDependencyStatus = buildPifDependencyStatus(specDb, category, row);

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
    cefRunCount: cefRuns.length,
    ...pifDependencyStatus,
    pifVariants,
    skuVariants,
    rdfVariants,
    keyTierProgress,
    cefLastRunAt: context.lastRunMaps.cef.get(pid) || '',
    pifLastRunAt: context.lastRunMaps.pif.get(pid) || '',
    rdfLastRunAt: context.lastRunMaps.rdf.get(pid) || '',
    skuLastRunAt: context.lastRunMaps.sku.get(pid) || '',
    kfLastRunAt:  context.lastRunMaps.kf.get(pid)  || '',
  };
}

function buildCatalogFromSql({ specDb, cleanVariant, category }) {
  if (!specDb) return [];

  const allProducts = specDb.getAllProducts() || [];
  const context = buildCatalogProjectionContext(specDb, category);
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

    const context = buildCatalogProjectionContext(specDb, category);
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
