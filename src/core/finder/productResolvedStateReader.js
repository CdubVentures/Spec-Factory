/**
 * productResolvedStateReader — finder-domain reader for resolved product state.
 *
 * Pure functions (specDb injected as dep — no hidden imports). Shared helpers
 * used by keyFinder's orchestrator and preview compiler to build:
 *   - an always-on grouped component inventory for the product
 *   - a per-key component relation pointer
 *   - a deduped product-scoped facts dump
 *   - a variant inventory table joined by variant_id
 *   - a field-specific identity usage block
 *
 * Dual-State mandate: reads only from SQL projections (item_component_links,
 * field_candidates). No JSON reads.
 */

import { isReservedFieldKey } from './finderExclusions.js';
import { readFieldRuleAiAssistToggleEnabled } from '../../field-rules/fieldRuleSchema.js';


// Phase 2: parent identity derives entirely from `enum.source`. A field key
// IS a component parent iff its `enum.source` is exactly `component_db.<self>`.
function isParentRule(rule, selfKey) {
  if (!selfKey) return false;
  return String(rule?.enum?.source || '') === `component_db.${selfKey}`;
}

/**
 * Build a Map<componentType, { propertyKeys, propertyVariancePolicies }>
 * from field_studio_map.component_sources — the SSOT for component property
 * lists (Phase 1: replaced the duplicate `component.match.property_keys`
 * compile-output read).
 *
 * @param {Array<object>} componentSources
 * @returns {Map<string, { propertyKeys: string[], variancePolicies: Record<string, string> }>}
 */
function buildComponentSourcesIndex(componentSources = []) {
  const out = new Map();
  for (const source of (Array.isArray(componentSources) ? componentSources : [])) {
    if (!source || typeof source !== 'object') continue;
    const type = String(source.component_type || source.type || '').trim();
    if (!type) continue;
    const properties = Array.isArray(source?.roles?.properties) ? source.roles.properties : [];
    const propertyKeys = [];
    const variancePolicies = {};
    for (const entry of properties) {
      const fk = String(entry?.field_key || entry?.key || entry?.property_key || '').trim();
      if (!fk) continue;
      propertyKeys.push(fk);
      const vp = String(entry?.variance_policy || '').trim();
      if (vp) variancePolicies[fk] = vp;
    }
    out.set(type, { propertyKeys, variancePolicies });
  }
  return out;
}

/**
 * Build a one-pass reverse index so resolveKeyComponentRelation + callers can
 * answer parent/subfield questions in O(1) without re-scanning the ruleset.
 *
 * @param {Record<string, object>} compiledRulesFields
 * @param {Array<object>} [componentSources] — field_studio_map.component_sources
 *   entries; SSOT for property_keys after Phase 1.
 * @returns {{ parentKeys: Set<string>, subfieldToParent: Map<string, string>, componentSourcesIndex: Map<string, {propertyKeys: string[], variancePolicies: Record<string, string>}> }}
 */
export function buildComponentRelationIndex(compiledRulesFields = {}, componentSources = []) {
  const parentKeys = new Set();
  const subfieldToParent = new Map();
  const componentSourcesIndex = buildComponentSourcesIndex(componentSources);
  for (const [fk, rule] of Object.entries(compiledRulesFields)) {
    if (!isParentRule(rule, fk)) continue;
    parentKeys.add(fk);
    // Phase 2: parent identity = selfKey by lock-contract construction
    // (enum.source === "component_db." + fk). The component_type is fk.
    const propertyKeys = componentSourcesIndex.get(fk)?.propertyKeys || [];
    for (const sub of propertyKeys) {
      if (typeof sub === 'string' && sub) subfieldToParent.set(sub, fk);
    }
  }
  return { parentKeys, subfieldToParent, componentSourcesIndex };
}

// Numeric-only variance policies. For non-numeric subfield contracts these
// collapse to `authoritative` so the rendered label can never claim a band
// that the field's contract can't actually represent.
const NUMERIC_ONLY_VARIANCE_POLICIES = new Set(['upper_bound', 'lower_bound', 'range']);

function resolveSubfieldVariance(rawPolicy, subKey, compiledRulesFields) {
  const policy = String(rawPolicy || 'authoritative');
  if (!NUMERIC_ONLY_VARIANCE_POLICIES.has(policy)) return policy;
  const subRule = compiledRulesFields?.[subKey];
  const contractType = String(subRule?.contract?.type || '').trim().toLowerCase();
  if (contractType === 'number' || contractType === 'integer') return policy;
  return 'authoritative';
}

/**
 * Emit one entry per parent component in the ruleset, with its product-resolved
 * identity (from item_component_links) and its product-resolved subfield values
 * (from field_candidates). Entries are sorted by parentFieldKey so the rendered
 * prompt stays byte-stable across runs.
 *
 * @returns {Array<{parentFieldKey: string, componentType: string, resolvedValue: string, subfields: Array<{field_key: string, value: unknown, variancePolicy: string}>}>}
 */
export function resolveProductComponentInventory({
  specDb,
  productId,
  compiledRulesFields,
  componentRelationIndex,
} = {}) {
  if (!specDb || !productId || !compiledRulesFields || !componentRelationIndex) return [];

  const links = typeof specDb.getItemComponentLinks === 'function'
    ? (specDb.getItemComponentLinks(productId) || [])
    : [];
  const linkByFieldKey = new Map();
  for (const row of links) {
    if (row && typeof row.field_key === 'string') linkByFieldKey.set(row.field_key, row);
  }

  const sourcesIndex = componentRelationIndex.componentSourcesIndex || new Map();
  const out = [];
  const parentKeys = [...componentRelationIndex.parentKeys].sort();
  for (const parentKey of parentKeys) {
    const rule = compiledRulesFields[parentKey];
    if (!rule) continue;
    const link = linkByFieldKey.get(parentKey) || null;
    const resolvedValue = String(link?.component_name || '').trim();
    // Phase 2: componentType === parentKey by the enum.source lock contract.
    const componentType = parentKey;
    const sourcesEntry = sourcesIndex.get(componentType) || { propertyKeys: [], variancePolicies: {} };
    const propertyKeys = sourcesEntry.propertyKeys || [];
    const subfields = [];
    for (const subKey of propertyKeys) {
      const row = typeof specDb.getResolvedFieldCandidate === 'function'
        ? specDb.getResolvedFieldCandidate(productId, subKey)
        : null;
      if (row && row.value !== undefined && row.value !== null) {
        const variancePolicy = resolveSubfieldVariance(
          sourcesEntry.variancePolicies?.[subKey],
          subKey,
          compiledRulesFields,
        );
        subfields.push({ field_key: subKey, value: row.value, variancePolicy });
      }
    }
    out.push({
      parentFieldKey: parentKey,
      componentType,
      resolvedValue,
      subfields,
    });
  }
  return out;
}

/**
 * Pure — derives the relation pointer for one key. Drives the shrunk
 * per-key component slot in the adapter (relation pointer only, no data).
 *
 * @returns {{type: string, relation: 'parent'|'subfield_of', parentFieldKey: string} | null}
 */
export function resolveKeyComponentRelation({
  fieldKey,
  fieldRule,
  componentRelationIndex,
} = {}) {
  if (!fieldKey || !componentRelationIndex) return null;
  if (isParentRule(fieldRule, fieldKey)) {
    return {
      type: fieldKey,
      relation: 'parent',
      parentFieldKey: fieldKey,
    };
  }
  const parentKey = componentRelationIndex.subfieldToParent.get(fieldKey);
  if (!parentKey) return null;
  // WHY: we can't assume the parent's rule is in scope here — callers pass
  // compiledRulesFields into the inventory resolver but not here. Use parent
  // field_key as the type fallback when parent rule isn't readily available
  // (the subfieldToParent map already encodes the parent_key → type 1:1).
  return {
    type: parentKey,
    relation: 'subfield_of',
    parentFieldKey: parentKey,
  };
}

/**
 * Dump of product-resolved field values, minus anything the caller has already
 * emitted elsewhere (primary + passengers + the component inventory).
 *
 * @returns {Record<string, unknown>}
 */
export function readKnownFieldsByProduct({
  specDb,
  productId,
  compiledRulesFields,
  excludeFieldKeys,
} = {}) {
  const out = {};
  if (!specDb || !productId || !compiledRulesFields) return out;
  const exclude = excludeFieldKeys instanceof Set ? excludeFieldKeys : new Set();
  if (typeof specDb.getResolvedFieldCandidate !== 'function') return out;

  for (const fk of Object.keys(compiledRulesFields)) {
    if (exclude.has(fk)) continue;
    const row = specDb.getResolvedFieldCandidate(productId, fk);
    if (row && row.value !== undefined && row.value !== null) out[fk] = row.value;
  }
  return out;
}

function deriveUsageProfile(fieldKey, fieldRule = {}) {
  const key = String(fieldKey || fieldRule?.field_key || '').toLowerCase();
  if (/design|shape|shell|grip|finish|texture|material/.test(key)) return 'visual_design';
  if (/weight|dimension|height|width|length|depth|size/.test(key)) return 'physical_measurement';
  if (/compat|connection|connectivity|software|firmware|platform|os/.test(key)) return 'compatibility';
  if (/package|box|bundle|included|contents|accessor/.test(key)) return 'package_contents';
  if (fieldRule?.variant_dependent === true) return 'variant_specific';
  return 'spec_invariant';
}

function pickTopResolved(rows = []) {
  return rows
    .filter((row) => row && String(row.status || '') === 'resolved')
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0] || null;
}

function readProductScopedResolvedRow(specDb, productId, fieldKey) {
  if (typeof specDb?.getFieldCandidatesByProductAndField === 'function') {
    return pickTopResolved(specDb.getFieldCandidatesByProductAndField(productId, fieldKey, null) || []);
  }
  if (typeof specDb?.getResolvedFieldCandidate === 'function') {
    const row = specDb.getResolvedFieldCandidate(productId, fieldKey);
    return row && String(row.status || 'resolved') === 'resolved' ? row : null;
  }
  return null;
}

function isVariantDependentRule(rule) {
  return Boolean(rule?.variant_dependent === true);
}

/**
 * Product-scoped facts safe to render as product context. This intentionally
 * excludes CEF/SKU/RDF-owned keys and any variant-dependent field, then reads
 * only NULL-variant resolved candidates when the scoped SQL API is available.
 *
 * @returns {Record<string, unknown>}
 */
export function readProductScopedFactsByProduct({
  specDb,
  productId,
  compiledRulesFields,
  excludeFieldKeys,
} = {}) {
  const out = {};
  if (!specDb || !productId || !compiledRulesFields) return out;
  const exclude = excludeFieldKeys instanceof Set ? excludeFieldKeys : new Set();

  for (const [fk, rule] of Object.entries(compiledRulesFields)) {
    if (exclude.has(fk)) continue;
    if (isReservedFieldKey(fk)) continue;
    if (isVariantDependentRule(rule)) continue;
    const row = readProductScopedResolvedRow(specDb, productId, fk);
    if (row && row.value !== undefined && row.value !== null) out[fk] = row.value;
  }
  return out;
}

function readVariantScopedResolvedValue(specDb, productId, fieldKey, variantId) {
  if (typeof specDb?.getFieldCandidatesByProductAndField !== 'function') return '';
  const row = pickTopResolved(specDb.getFieldCandidatesByProductAndField(productId, fieldKey, variantId) || []);
  return row && row.value !== undefined && row.value !== null ? String(row.value) : '';
}

function buildImageStatus(progress) {
  if (!progress) return '';
  const parts = [];
  const heroTarget = Number(progress.hero_target) || 0;
  const priorityTotal = Number(progress.priority_total) || 0;
  if (heroTarget > 0) parts.push(`hero ${Number(progress.hero_filled) || 0}/${heroTarget}`);
  if (priorityTotal > 0) parts.push(`priority ${Number(progress.priority_filled) || 0}/${priorityTotal}`);
  return parts.join('; ');
}

function isDiscriminatingVariant(row = {}) {
  const type = String(row.variant_type || '').toLowerCase();
  const key = String(row.variant_key || '').toLowerCase();
  return type === 'color' || type === 'edition' || key.startsWith('color:') || key.startsWith('edition:');
}

function hasJoinedVariantFact(row = {}) {
  return Boolean(row.sku || row.release_date || row.image_status);
}

/**
 * Active variant identity table for Key Finder prompts. The variants table is
 * the spine; SKU/RDF/PIF are joined by variant_id only.
 *
 * @returns {Array<{variant_id: string, variant_key: string, label: string, type: string, color_atoms: string[], sku: string, release_date: string, image_status: string}>}
 */
export function resolveVariantInventory({ specDb, productId, fieldRule } = {}) {
  if (!specDb || !productId) return [];
  if (!readFieldRuleAiAssistToggleEnabled('color_edition_context', fieldRule, true)) return [];
  const variants = typeof specDb.variants?.listActive === 'function'
    ? specDb.variants.listActive(productId)
    : [];
  if (!Array.isArray(variants) || variants.length === 0) return [];

  const pifRows = typeof specDb.listPifVariantProgressByProduct === 'function'
    ? specDb.listPifVariantProgressByProduct(productId) || []
    : [];
  const pifByVariantId = new Map(pifRows.map((row) => [row.variant_id, row]));

  const rows = variants.map((variant) => {
    const variantId = String(variant.variant_id || '');
    return {
      variant_id: variantId,
      variant_key: String(variant.variant_key || ''),
      label: String(variant.variant_label || variant.variant_key || variantId),
      type: String(variant.variant_type || ''),
      color_atoms: Array.isArray(variant.color_atoms) ? variant.color_atoms.map((v) => String(v)) : [],
      sku: readVariantScopedResolvedValue(specDb, productId, 'sku', variantId),
      release_date: readVariantScopedResolvedValue(specDb, productId, 'release_date', variantId),
      image_status: buildImageStatus(pifByVariantId.get(variantId)),
    };
  }).filter((row) => row.variant_id);

  const useful = rows.some(isDiscriminatingVariant) || rows.some(hasJoinedVariantFact);
  return useful ? rows : [];
}

function defaultIdentityUsageLines({ fieldKey, fieldRule } = {}) {
  const profile = deriveUsageProfile(fieldKey, fieldRule);
  const key = String(fieldKey || fieldRule?.field_key || 'this key');
  const common = [
    `When researching \`${key}\`:`,
    '- Use VARIANT_INVENTORY as a source-identity filter, not as values to output.',
  ];
  if (String(fieldRule?.ai_assist?.reasoning_note || '').trim()) {
    return [
      ...common,
      '- Follow the authored field guidance for allowed values and interpretation.',
      '- Use VARIANT_INVENTORY only to confirm exact product/variant identity and exclude sibling or special-variant evidence that is not the requested target.',
      '- Do not copy VARIANT_INVENTORY columns directly into results.',
    ];
  }
  if (profile === 'visual_design') {
    return [
      ...common,
      '- Extract the shared physical/industrial design: shape, shell style, handedness, button layout, grip geometry, surface treatment, lighting zones, and visible structural features.',
      '- Do not treat edition artwork, colorway, franchise branding, or SKU-only pages as base design unless the source explicitly says the physical design differs.',
      '- Edition-specific evidence may support shared design only when the source clearly refers to the same base product family/model.',
      '- Never output colors, editions, sku, or release_date as Key Finder results.',
    ];
  }
  if (profile === 'physical_measurement') {
    return [
      ...common,
      '- Accept edition/color pages only when the measurement is explicitly tied to the same base product or stated as shared across variants.',
      '- If a measurement differs by variant and no shared product-level value is proven, return "unk" instead of averaging or choosing one row.',
      '- Never output colors, editions, sku, or release_date as Key Finder results.',
    ];
  }
  if (profile === 'compatibility') {
    return [
      ...common,
      '- Use edition/SKU pages to verify you are on the same product, then extract only compatibility claims that apply to this exact product or all listed variants.',
      '- Reject sibling-model compatibility evidence unless the source explicitly states the same support applies to this product.',
      '- Never output colors, editions, sku, or release_date as Key Finder results.',
    ];
  }
  if (profile === 'package_contents') {
    return [
      ...common,
      '- Treat edition bundles and retailer kits as variant-specific unless the source states the package contents are standard for the base product.',
      '- Do not merge accessories from multiple variants into one product-level answer.',
      '- Never output colors, editions, sku, or release_date as Key Finder results.',
    ];
  }
  if (profile === 'variant_specific') {
    return [
      ...common,
      '- This field can vary by variant. Return a product-level value only when the source proves the value is shared across variants.',
      '- If evidence is variant-specific and conflicting, return "unk" with a reason instead of collapsing variant values.',
      '- Never output colors, editions, sku, or release_date as Key Finder results.',
    ];
  }
  return [
    ...common,
    '- Accept edition/color-specific pages only when they clearly state the field value is shared by the same base product or identify this exact product.',
    '- Reject sibling-model evidence unless the source explicitly states the value also applies to this product.',
    '- Never output colors, editions, sku, or release_date as Key Finder results.',
  ];
}

export function buildFieldIdentityUsage({ fieldKey, fieldRule } = {}) {
  if (!readFieldRuleAiAssistToggleEnabled('color_edition_context', fieldRule, true)) return '';
  return defaultIdentityUsageLines({ fieldKey, fieldRule }).join('\n');
}

export function resolveKeyFinderRuntimeContext({
  specDb,
  productId,
  compiledRulesFields,
  excludeFieldKeys,
  primaryFieldKey,
  primaryFieldRule,
  knownFieldsInjectionEnabled = true,
} = {}) {
  const productScopedFacts = knownFieldsInjectionEnabled
    ? readProductScopedFactsByProduct({ specDb, productId, compiledRulesFields, excludeFieldKeys })
    : {};
  const variantInventory = resolveVariantInventory({
    specDb,
    productId,
    fieldRule: primaryFieldRule,
  });
  return {
    productScopedFacts,
    variantInventory,
    fieldIdentityUsage: variantInventory.length > 0
      ? buildFieldIdentityUsage({ fieldKey: primaryFieldKey, fieldRule: primaryFieldRule })
      : '',
  };
}
