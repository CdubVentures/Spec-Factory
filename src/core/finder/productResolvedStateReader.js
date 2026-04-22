/**
 * productResolvedStateReader — finder-domain reader for resolved product state.
 *
 * Pure functions (specDb injected as dep — no hidden imports). Shared helpers
 * used by keyFinder's orchestrator and preview compiler to build:
 *   - an always-on grouped component inventory for the product
 *   - a per-key component relation pointer
 *   - a deduped known-fields dump
 *
 * Dual-State mandate: reads only from SQL projections (item_component_links,
 * field_candidates). No JSON reads.
 */

function isParentRule(rule) {
  return Boolean(rule && rule.component && typeof rule.component === 'object');
}

/**
 * Build a one-pass reverse index so resolveKeyComponentRelation + callers can
 * answer parent/subfield questions in O(1) without re-scanning the ruleset.
 *
 * @param {Record<string, object>} compiledRulesFields
 * @returns {{ parentKeys: Set<string>, subfieldToParent: Map<string, string> }}
 */
export function buildComponentRelationIndex(compiledRulesFields = {}) {
  const parentKeys = new Set();
  const subfieldToParent = new Map();
  for (const [fk, rule] of Object.entries(compiledRulesFields)) {
    if (!isParentRule(rule)) continue;
    parentKeys.add(fk);
    const propertyKeys = Array.isArray(rule.component.match?.property_keys)
      ? rule.component.match.property_keys
      : [];
    for (const sub of propertyKeys) {
      if (typeof sub === 'string' && sub) subfieldToParent.set(sub, fk);
    }
  }
  return { parentKeys, subfieldToParent };
}

/**
 * Emit one entry per parent component in the ruleset, with its product-resolved
 * identity (from item_component_links) and its product-resolved subfield values
 * (from field_candidates). Entries are sorted by parentFieldKey so the rendered
 * prompt stays byte-stable across runs.
 *
 * @returns {Array<{parentFieldKey: string, componentType: string, resolvedValue: string, subfields: Array<{field_key: string, value: unknown}>}>}
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

  const out = [];
  const parentKeys = [...componentRelationIndex.parentKeys].sort();
  for (const parentKey of parentKeys) {
    const rule = compiledRulesFields[parentKey];
    if (!rule) continue;
    const link = linkByFieldKey.get(parentKey) || null;
    const resolvedValue = String(link?.component_name || '').trim();
    const propertyKeys = Array.isArray(rule.component?.match?.property_keys)
      ? rule.component.match.property_keys
      : [];
    const subfields = [];
    for (const subKey of propertyKeys) {
      const row = typeof specDb.getResolvedFieldCandidate === 'function'
        ? specDb.getResolvedFieldCandidate(productId, subKey)
        : null;
      if (row && row.value !== undefined && row.value !== null) {
        subfields.push({ field_key: subKey, value: row.value });
      }
    }
    out.push({
      parentFieldKey: parentKey,
      componentType: String(rule.component?.type || parentKey),
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
  if (isParentRule(fieldRule)) {
    return {
      type: String(fieldRule.component?.type || fieldKey),
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
