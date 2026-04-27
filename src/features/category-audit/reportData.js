/**
 * Pure extractors: compiled field rules + ancillary data → normalized ReportData.
 *
 * The renderer consumes ReportData and does not look at raw artifacts. This
 * module is the single point where per-category artifact shapes are read.
 *
 * Single export:
 *   - extractReportData({ category, loadedRules, globalFragments, tierBundles, now }) → ReportData
 */

import { analyzeEnum, resolveFilterUi } from './patternDetector.js';

const CONSTRAINT_OPS = [
  { re: /^(.+?)\s*<=\s*(.+)$/, op: 'lte' },
  { re: /^(.+?)\s*>=\s*(.+)$/, op: 'gte' },
  { re: /^(.+?)\s*<\s*(.+)$/, op: 'lt' },
  { re: /^(.+?)\s*>\s*(.+)$/, op: 'gt' },
  { re: /^(.+?)\s*==\s*(.+)$/, op: 'eq' },
  { re: /^(.+?)\s*=\s*(.+)$/, op: 'eq' },
];
const LEGACY_VARIANT_INVENTORY_ACTIVE_MODES = new Set(['default', 'append', 'override']);

/** "<field> <= <other_field>" -> { op: 'lte', left, right, raw } */
export function parseConstraintExpression(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  for (const { re, op } of CONSTRAINT_OPS) {
    const m = s.match(re);
    if (m) return { op, left: m[1].trim(), right: m[2].trim(), raw: s };
  }
  return { op: 'unknown', left: '', right: '', raw: s };
}

function normalizePriority(rule) {
  const p = rule?.priority || {};
  return {
    required_level: String(p.required_level || rule?.required_level || 'non_mandatory'),
    availability: String(p.availability || rule?.availability || 'always'),
    difficulty: String(p.difficulty || rule?.difficulty || 'medium'),
  };
}

function normalizeContract(rule) {
  const c = rule?.contract || {};
  return {
    type: String(c.type || rule?.data_type || 'string').toLowerCase(),
    shape: String(c.shape || rule?.output_shape || 'scalar').toLowerCase(),
    unit: String(c.unit || ''),
    rounding: c.rounding && Number.isFinite(c.rounding.decimals)
      ? { decimals: c.rounding.decimals, mode: String(c.rounding.mode || 'nearest') }
      : null,
    list_rules: c.list_rules || null,
    range: c.range || null,
  };
}

function normalizeEnum(rule, enumsIndex) {
  const e = rule?.enum || {};
  const source = e.source ? String(e.source) : '';
  const inlineValues = Array.isArray(e.values) ? e.values : [];
  // data_lists.X → look up in known_values.enums.X if no inline values
  let resolvedValues = inlineValues;
  if (inlineValues.length === 0 && source.startsWith('data_lists.')) {
    const key = source.slice('data_lists.'.length);
    const entry = enumsIndex[key];
    if (entry && Array.isArray(entry.values)) resolvedValues = entry.values;
  }
  return {
    policy: String(e.policy || ''),
    source,
    values: resolvedValues,
    new_value_policy: e.new_value_policy || null,
  };
}

function normalizeSearchHints(rule) {
  const h = rule?.search_hints || {};
  return {
    domain_hints: Array.isArray(h.domain_hints) ? h.domain_hints : [],
    query_terms: Array.isArray(h.query_terms) ? h.query_terms : [],
    content_types: Array.isArray(h.content_types) ? h.content_types : [],
    preferred_tiers: Array.isArray(h.preferred_tiers) ? h.preferred_tiers : [],
  };
}

function normalizeConstraints(rule) {
  const raw = rule?.constraints;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === 'string' ? parseConstraintExpression(c) : { ...c, raw: '' }))
    .filter(Boolean);
}

function normalizeComponent(rule, componentRelations) {
  const c = rule?.component;
  if (c && c.type) {
    return { type: String(c.type), relation: 'parent', source: String(c.source || '') };
  }
  // Subfield detection: look up in componentRelations index built from component_db
  const subfieldOf = componentRelations.subfieldOf[rule?.field_key];
  if (subfieldOf) return { type: subfieldOf, relation: 'subfield_of', source: `component_db.${subfieldOf}` };
  return null;
}

/** Build a reverse index: which component_db[type] lists this field_key as a property */
function buildComponentRelations(componentDBs) {
  const subfieldOf = {};
  const identityOf = {};
  for (const [type, db] of Object.entries(componentDBs || {})) {
    const items = db?.items || db?.entries || [];
    const sample = Array.isArray(items) ? items : Object.values(items || {});
    for (const item of sample) {
      const props = item?.properties || {};
      for (const propKey of Object.keys(props)) {
        subfieldOf[propKey] = type;
      }
    }
  }
  return { subfieldOf, identityOf };
}

function normalizeEvidence(rule) {
  const e = rule?.evidence || {};
  return {
    min_evidence_refs: Number.isFinite(e.min_evidence_refs) ? e.min_evidence_refs : 1,
    tier_preference: Array.isArray(e.tier_preference) ? e.tier_preference : [],
  };
}

function normalizeVariantInventoryUsage(rule) {
  const raw = rule?.ai_assist?.variant_inventory_usage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.enabled === 'boolean') return { enabled: raw.enabled };
  const legacyMode = String(raw.mode || '').trim();
  if (legacyMode === 'off') return { enabled: false };
  if (LEGACY_VARIANT_INVENTORY_ACTIVE_MODES.has(legacyMode)) return { enabled: true };
  return null;
}

function normalizeSimpleEnabledToggle(value) {
  if (typeof value === 'boolean') return { enabled: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return typeof value.enabled === 'boolean' ? { enabled: value.enabled } : null;
}

function normalizeAiAssist(rule) {
  const out = { reasoning_note: String(rule?.ai_assist?.reasoning_note || '') };
  const variantInventoryUsage = normalizeVariantInventoryUsage(rule);
  if (variantInventoryUsage) out.variant_inventory_usage = variantInventoryUsage;
  const pifPriorityImages = normalizeSimpleEnabledToggle(rule?.ai_assist?.pif_priority_images);
  if (pifPriorityImages) out.pif_priority_images = pifPriorityImages;
  return out;
}

function buildKeyRecord(fieldKey, rule, enumsIndex, componentRelations) {
  const priority = normalizePriority(rule);
  const contract = normalizeContract(rule);
  const enumBlock = normalizeEnum(rule, enumsIndex);
  const analysis = enumBlock.values.length > 0
    ? analyzeEnum(enumBlock.values, { contractType: contract.type })
    : null;
  return {
    fieldKey,
    displayName: String(rule?.ui?.label || rule?.display_name || fieldKey),
    group: String(rule?.group || rule?.ui?.group || 'ungrouped'),
    priority,
    contract,
    enum: { ...enumBlock, analysis, filterUi: resolveFilterUi(contract.type) },
    aliases: Array.isArray(rule?.aliases) ? rule.aliases.filter(Boolean) : [],
    search_hints: normalizeSearchHints(rule),
    constraints: normalizeConstraints(rule),
    component: normalizeComponent(rule, componentRelations),
    ai_assist: normalizeAiAssist(rule),
    evidence: normalizeEvidence(rule),
    variant_dependent: rule?.variant_dependent === true,
    product_image_dependent: rule?.product_image_dependent === true,
    variance_policy: String(rule?.variance_policy || ''),
    rawRule: rule,
  };
}

function buildGroups(fieldGroupsIndex, keysByField) {
  const groups = [];
  for (const [groupKey, fieldKeyList] of Object.entries(fieldGroupsIndex || {})) {
    if (!Array.isArray(fieldKeyList)) continue;
    const resolvedKeys = fieldKeyList.filter((fk) => keysByField[fk]);
    if (resolvedKeys.length === 0) continue;
    groups.push({
      groupKey,
      displayName: deriveGroupDisplayName(groupKey, keysByField, resolvedKeys),
      fieldKeys: resolvedKeys,
    });
  }
  return groups;
}

function deriveGroupDisplayName(groupKey, keysByField, fieldKeys) {
  for (const fk of fieldKeys) {
    const uiGroup = keysByField[fk]?.rawUiGroup;
    if (uiGroup && uiGroup !== groupKey) return uiGroup;
  }
  return groupKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildEnumInventory(enumsIndex, keysByField) {
  const usage = {};
  for (const [fk, key] of Object.entries(keysByField)) {
    const source = key.enum.source;
    if (!source) continue;
    const enumName = source.startsWith('data_lists.') ? source.slice('data_lists.'.length) : source;
    if (!usage[enumName]) usage[enumName] = [];
    usage[enumName].push(fk);
  }
  const entries = [];
  for (const [name, block] of Object.entries(enumsIndex || {})) {
    const values = Array.isArray(block?.values) ? block.values : [];
    // Presume string for enum-inventory analysis; per-key records carry their own typed analysis
    entries.push({
      name,
      policy: String(block?.policy || ''),
      values,
      analysis: analyzeEnum(values, { contractType: 'string' }),
      usedBy: usage[name] || [],
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function buildComponentInventory(componentDBs, keysByField) {
  const list = [];
  for (const [type, db] of Object.entries(componentDBs || {})) {
    const items = db?.items || Object.values(db?.entries || {});
    const identityFields = [];
    const subfields = [];
    for (const [fk, k] of Object.entries(keysByField)) {
      if (k.component?.type === type && k.component.relation === 'parent') identityFields.push(fk);
      if (k.component?.type === type && k.component.relation === 'subfield_of') subfields.push(fk);
    }
    list.push({
      type,
      entityCount: Array.isArray(items) ? items.length : 0,
      entities: Array.isArray(items) ? items.map((it) => ({
        name: String(it?.name || ''),
        maker: String(it?.maker || ''),
        aliases: Array.isArray(it?.aliases) ? it.aliases : [],
        properties: it?.properties || {},
        constraints: it?.__constraints || {},
        variance_policies: it?.__variance_policies || {},
      })) : [],
      identityFields,
      subfields,
    });
  }
  return list.sort((a, b) => a.type.localeCompare(b.type));
}

function buildStats(keyRecords, groups) {
  const stats = {
    totalKeys: keyRecords.length,
    mandatoryCount: 0,
    tierDistribution: { easy: 0, medium: 0, hard: 0, very_hard: 0, other: 0 },
    emptyGuidanceCount: 0,
    emptyAliasesCount: 0,
    emptyHintsCount: 0,
    emptySearchDomainsCount: 0,
    patternlessOpenEnumsCount: 0,
    groupCount: groups.length,
    productImageDependentCount: 0,
    variantDependentCount: 0,
  };
  for (const k of keyRecords) {
    if (k.priority.required_level === 'mandatory') stats.mandatoryCount++;
    const d = k.priority.difficulty;
    if (stats.tierDistribution[d] !== undefined) stats.tierDistribution[d]++;
    else stats.tierDistribution.other++;
    if (!k.ai_assist.reasoning_note.trim()) stats.emptyGuidanceCount++;
    if (k.aliases.length === 0) stats.emptyAliasesCount++;
    if (k.search_hints.query_terms.length === 0) stats.emptyHintsCount++;
    if (k.search_hints.domain_hints.length === 0) stats.emptySearchDomainsCount++;
    if (k.product_image_dependent) stats.productImageDependentCount++;
    if (k.variant_dependent) stats.variantDependentCount++;
    if (k.enum.policy === 'open_prefer_known' && k.enum.values.length >= 4) {
      const top = k.enum.analysis?.topSignature;
      if (!top || top.coveragePct < 70) stats.patternlessOpenEnumsCount++;
    }
  }
  return stats;
}

/**
 * @param {object} opts
 * @param {string} opts.category
 * @param {{ rules: object, knownValues: object, componentDBs: object, uiFieldCatalog?: object }} opts.loadedRules
 * @param {{ groupIndex: object }} opts.fieldGroups
 * @param {object} opts.globalFragments  // pre-resolved strings keyed by fragment name
 * @param {object} opts.tierBundles      // parsed keyFinderTierSettingsJson
 * @param {object} [opts.compileSummary] // optional _compile_report.json subset
 * @param {Date}   [opts.now]
 * @returns {object} ReportData
 */
export function extractReportData({
  category,
  loadedRules,
  fieldGroups,
  globalFragments,
  tierBundles,
  compileSummary = null,
  now = new Date(),
}) {
  const rules = loadedRules?.rules?.fields || loadedRules?.fields || {};
  const knownValuesEnums = loadedRules?.knownValues?.enums || loadedRules?.knownValues || {};
  const componentDBs = loadedRules?.componentDBs || {};

  const componentRelations = buildComponentRelations(componentDBs);

  const keyRecords = [];
  const keysByField = {};
  for (const [fieldKey, rule] of Object.entries(rules)) {
    const rec = buildKeyRecord(fieldKey, rule, knownValuesEnums, componentRelations);
    keyRecords.push(rec);
    keysByField[fieldKey] = { ...rec, rawUiGroup: rule?.ui?.group || '' };
  }
  keyRecords.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  const groupIndex = fieldGroups?.groupIndex || fieldGroups?.group_index || {};
  const groups = buildGroups(groupIndex, keysByField);
  const enums = buildEnumInventory(knownValuesEnums, keysByField);
  const components = buildComponentInventory(componentDBs, keysByField);
  const stats = buildStats(keyRecords, groups);

  return {
    category: String(category || ''),
    generatedAt: (now instanceof Date ? now : new Date(now || Date.now())).toISOString(),
    stats,
    groups,
    keys: keyRecords,
    enums,
    components,
    knownValues: loadedRules?.knownValues || { enums: knownValuesEnums },
    globalFragments: globalFragments || {},
    tierBundles: tierBundles || {},
    compileSummary,
  };
}
