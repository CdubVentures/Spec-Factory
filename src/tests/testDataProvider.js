/**
 * testDataProvider.js â€" Contract-driven synthetic source data generator for test mode v2.
 *
 * Auto-generates ALL test scenarios from the actual imported field rules contract.
 * Covers every single use case the field rules studio contract can produce.
 * Builds 3 coverage matrices: field rules, components, lists & enums.
 *
 * UNIVERSAL: Works for any category â€" all test data is derived from the contract,
 * not hardcoded to mouse or any specific category.
 */

import { z } from 'zod';
import { zodToLlmSchema } from '../core/llm/zodToLlmSchema.js';
import { callLlmWithRouting } from '../core/llm/client/routing.js';
import { deriveFullModel } from '../features/catalog/identity/identityDedup.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function isObj(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function toArr(v) { return Array.isArray(v) ? v : []; }
function norm(v) { return String(v ?? '').trim(); }
function normLower(v) { return norm(v).toLowerCase(); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function slugify(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function singularize(word) {
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('sses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function stableTextHash(text) {
  const input = String(text || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableToken(text, length = 6) {
  const raw = stableTextHash(String(text || '')).toString(36).toUpperCase();
  if (raw.length >= length) return raw.slice(0, length);
  return raw.padStart(length, '0');
}

function uniqueCaseInsensitive(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of toArr(values)) {
    const cleaned = norm(value);
    if (!cleaned) continue;
    const token = cleaned.toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(cleaned);
  }
  return out;
}

function buildUnknownComponentIdentity(typeName, seed = 0) {
  const typeToken = singularize(normLower(typeName) || 'component') || 'component';
  const typeLabel = capitalize(typeToken);
  const nameToken = stableToken(`${typeToken}:unknown_name:${seed}`, 6);
  const makerToken = stableToken(`${typeToken}:unknown_maker:${seed}`, 5);
  return {
    name: `${typeLabel} Unknown ${nameToken}`,
    maker: `${typeLabel} Labs ${makerToken}`,
  };
}

function getComponentDbByType(raw, typeName) {
  const dbs = raw?.componentDBs || {};
  const singular = singularize(String(typeName || ''));
  return dbs[typeName] || dbs[singular] || dbs[`${singular}s`] || dbs[`${typeName}s`] || null;
}

function componentTypeSupportsMakerField(raw, typeName, fieldKeysHint = null) {
  const fieldKeys = Array.isArray(fieldKeysHint)
    ? fieldKeysHint
    : Object.keys(raw?.fields || {});
  const typeToken = String(typeName || '').trim();
  if (!typeToken) return false;
  const singular = singularize(typeToken);
  const makerFieldCandidates = [
    `${typeToken}_brand`,
    `${typeToken}_maker`,
    `${singular}_brand`,
    `${singular}_maker`,
  ];
  return makerFieldCandidates.some((fieldKey) => fieldKeys.includes(fieldKey));
}

function getSeedComponentItem(raw, typeName, index = 0) {
  const db = getComponentDbByType(raw, typeName);
  const items = toArr(db?.items || db?.entities).filter((entry) => norm(entry?.name));
  if (items.length === 0) return null;
  const safeIndex = ((Number(index) % items.length) + items.length) % items.length;
  return items[safeIndex] || null;
}

function getSeedComponentName(raw, typeName, index = 0) {
  return norm(getSeedComponentItem(raw, typeName, index)?.name);
}

function getIdentityPool(identityPoolsByType, typeName) {
  const typeToken = String(typeName || '').trim();
  const direct = isObj(identityPoolsByType?.[typeToken]) ? identityPoolsByType[typeToken] : null;
  const values = direct || {};
  const names = uniqueCaseInsensitive(values.names);
  const brands = uniqueCaseInsensitive(values.brands);
  const fallbackType = singularize(typeToken);
  if (!direct && isObj(identityPoolsByType?.[fallbackType])) {
    const fallback = identityPoolsByType[fallbackType];
    return {
      names: uniqueCaseInsensitive(fallback.names),
      brands: uniqueCaseInsensitive(fallback.brands),
    };
  }
  return { names, brands };
}

const IDENTITY_POOL_NAME_PARTS = [
  'Alpha',
  'Beta',
  'Gamma',
  'Delta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Nu',
  'Xi',
  'Omicron',
  'Pi'
];

function buildDeterministicIdentityPool(typeName) {
  const token = singularize(normLower(typeName) || 'component') || 'component';
  const label = capitalize(token);
  const names = [];
  const brands = [];
  const nameCount = 36;
  const brandCount = 10;

  for (let index = 0; index < nameCount; index += 1) {
    const part = IDENTITY_POOL_NAME_PARTS[index % IDENTITY_POOL_NAME_PARTS.length];
    const round = Math.floor(index / IDENTITY_POOL_NAME_PARTS.length) + 1;
    names.push(`${label} ${part} ${String(round).padStart(2, '0')}`);
  }
  for (let index = 0; index < brandCount; index += 1) {
    const code = String.fromCharCode(65 + (index % 26));
    brands.push(`${label} Labs ${code}`);
  }

  return {
    source: 'app_generated',
    names: uniqueCaseInsensitive(names),
    brands: uniqueCaseInsensitive(brands),
  };
}

export async function loadComponentIdentityPools({
  componentTypes = [],
  strict = false,
} = {}) {
  const normalizedTypes = [...new Set(
    toArr(componentTypes)
      .map((typeName) => String(typeName || '').trim())
      .filter(Boolean)
  )];
  if (normalizedTypes.length === 0) {
    if (strict) throw new Error('identity pool load failed: componentTypes is empty');
    return {};
  }

  const poolsByType = {};
  for (const typeName of normalizedTypes) {
    const pool = buildDeterministicIdentityPool(typeName);
    if (strict && pool.names.length === 0) {
      throw new Error(`identity pool load failed: no generated names for component type '${typeName}'`);
    }
    poolsByType[typeName] = pool;
  }

  return poolsByType;
}

function getComponentMakerFieldKeys(fieldKeys, typeName) {
  const typeToken = String(typeName || '').trim();
  if (!typeToken) return [];
  const singular = singularize(typeToken);
  const candidates = [
    `${typeToken}_brand`,
    `${typeToken}_maker`,
    `${singular}_brand`,
    `${singular}_maker`,
  ];
  return [...new Set(candidates.filter((fieldKey) => fieldKeys.includes(fieldKey)))];
}



function safeReadJson(filePath) {
  return fs.readFile(filePath, 'utf8').then(t => JSON.parse(t)).catch(() => null);
}

async function listJsonFiles(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    return files.filter(f => f.endsWith('.json'));
  } catch { return []; }
}

/**
 * Find a real item with aliases from a component DB, for alias-match testing.
 * Returns { name, loweredName, alias } or null.
 * loweredName is a near-match variant that differs from canonical (for fuzzy match testing).
 */
function findAliasableItem(db) {
  const items = toArr(db?.items || db?.entities);
  for (const item of items) {
    if (toArr(item.aliases).length > 0 && item.name) {
      const name = item.name;
      const nearMatch = createNearMatch(name);
      return { name, loweredName: nearMatch, alias: item.aliases[0] };
    }
  }
  // Fallback: just use first item
  if (items.length > 0 && items[0].name) {
    const name = items[0].name;
    return { name, loweredName: createNearMatch(name), alias: null };
  }
  return null;
}

/**
 * Create a near-match variant of a name for alias testing.
 * Tries multiple strategies to ensure the variant differs from the original.
 */
function createNearMatch(name) {
  // Strategy 1: Lowercase first char of each word (e.g., "Focus Pro 45K" -> "Focus pro 45k")
  const words = name.split(/\s+/);
  if (words.length > 1) {
    const variant = words.map((w, i) => i === 0 ? w : w.toLowerCase()).join(' ');
    if (variant !== name) return variant;
  }
  // Strategy 2: All lowercase
  const lower = name.toLowerCase();
  if (lower !== name) return lower;
  // Strategy 3: Remove hyphens/underscores
  const stripped = name.replace(/[-_]/g, ' ').trim();
  if (stripped !== name) return stripped;
  // Strategy 4: Add extra space
  return name + ' ';
}

/**
 * Find a real item with properties from a component DB, for constraint/variance testing.
 */
function findItemWithProperties(db) {
  const items = toArr(db?.items || db?.entities);
  for (const item of items) {
    if (item.name && isObj(item.properties) && Object.keys(item.properties).length > 0) return item;
  }
  return items[0] || null;
}

// â"€â"€ Contract Analysis (core function) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * Reads the full contract from compiled_rules (DB) or _generated dir (JSON fallback)
 * and builds all three matrices as structured data.
 */
export async function analyzeContract(helperRoot, category, { compiledRules: cr } = {}) {
  let fieldRules, knownValues, crossRules, parseTemplates, componentDBs;
  if (cr && cr.fields) {
    // WHY: DB-first -- compiled_rules has everything analyzeContract needs.
    fieldRules = { fields: cr.fields, component_db_sources: cr.component_db_sources || {} };
    knownValues = cr.known_values || {};
    crossRules = { rules: Array.isArray(cr.cross_validation_rules) ? cr.cross_validation_rules : [] };
    parseTemplates = cr.parse_templates || {};
    componentDBs = cr.component_dbs || {};
  } else {
    // JSON fallback -- CLI, pre-seeded test categories, tests without specDb
    const genDir = path.join(helperRoot, category, '_generated');
    fieldRules = await safeReadJson(path.join(genDir, 'field_rules.json')) || {};
    knownValues = await safeReadJson(path.join(genDir, 'known_values.json')) || {};
    crossRules = await safeReadJson(path.join(genDir, 'cross_validation_rules.json')) || {};
    parseTemplates = await safeReadJson(path.join(genDir, 'parse_templates.json')) || {};
    const compDbDir = path.join(genDir, 'component_db');
    const compFiles = await listJsonFiles(compDbDir);
    componentDBs = {};
    for (const f of compFiles) {
      const data = await safeReadJson(path.join(compDbDir, f));
      if (data) componentDBs[data.component_type || f.replace('.json', '')] = data;
    }
  }

  const fields = isObj(fieldRules.fields) ? fieldRules.fields : {};
  const fieldKeys = Object.keys(fields).sort();
  const kvFields = isObj(knownValues.enums)
    ? Object.fromEntries(Object.entries(knownValues.enums).map(([k, v]) => [k, Array.isArray(v?.values) ? v.values : []]))
    : isObj(knownValues.fields) ? knownValues.fields : {};
  const rules = toArr(crossRules.rules);

  // â"€â"€ Analyze fields â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const fieldsByType = {};
  const fieldsByShape = {};
  const enumPolicies = {};
  const parseTemplateCounts = {};
  const requiredFields = [];
  const criticalFields = [];
  const rangeConstraints = {};
  const listFields = [];
  const componentRefFields = [];
  const aiStrategies = {};
  const conflictPolicies = {};
  const evidenceRequirements = {};

  for (const key of fieldKeys) {
    const rule = fields[key];
    if (!isObj(rule)) continue;

    const contract = isObj(rule.contract) ? rule.contract : {};
    const parse = isObj(rule.parse) ? rule.parse : {};
    const enumBlock = isObj(rule.enum) ? rule.enum : {};
    const priority = isObj(rule.priority) ? rule.priority : {};
    const evidence = isObj(rule.evidence) ? rule.evidence : {};
    const aiAssist = isObj(rule.ai_assist) ? rule.ai_assist : {};

    const type = contract.type || rule.data_type || 'string';
    const shape = contract.shape || rule.output_shape || 'scalar';
    const template = parse.template || '';
    const policy = enumBlock.policy || 'open';
    const requiredLevel = priority.required_level || priority.availability || rule.required_level || rule.availability || 'optional';

    fieldsByType[type] = (fieldsByType[type] || 0) + 1;
    fieldsByShape[shape] = (fieldsByShape[shape] || 0) + 1;
    enumPolicies[policy] = (enumPolicies[policy] || 0) + 1;
    if (template) parseTemplateCounts[template] = (parseTemplateCounts[template] || 0) + 1;

    if (requiredLevel === 'required') requiredFields.push(key);
    if (requiredLevel === 'critical') { criticalFields.push(key); requiredFields.push(key); }

    // Range constraints from cross-validation
    for (const r of rules) {
      if (r.trigger_field === key && r.check?.type === 'range') {
        rangeConstraints[key] = { min: r.check.min, max: r.check.max };
      }
    }

    if (shape === 'list') listFields.push(key);

    // Component reference detection
    if (template === 'component_reference' || enumBlock.source?.startsWith?.('component_db.')) {
      componentRefFields.push({ key, source: enumBlock.source || '' });
    }

    // AI strategy
    const strategy = aiAssist.model_strategy || 'auto';
    aiStrategies[key] = strategy;

    // Evidence requirements
    const minEv = evidence.min_evidence_refs || 1;
    const conflictPolicy = evidence.conflict_policy || 'resolve_by_tier';
    evidenceRequirements[key] = { minEvidenceRefs: minEv, conflictPolicy };
    conflictPolicies[conflictPolicy] = (conflictPolicies[conflictPolicy] || 0) + 1;
  }

  // â"€â"€ Analyze component DBs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const componentTypes = [];
  for (const [type, db] of Object.entries(componentDBs)) {
    const items = toArr(db.items || db.entities);
    let aliasCount = 0;
    const allConstraints = {};
    const allVariancePolicies = {};
    for (const item of items) {
      aliasCount += toArr(item.aliases).length;
      // Collect constraints from items
      if (isObj(item.__constraints)) {
        for (const [field, constraintArr] of Object.entries(item.__constraints)) {
          if (!allConstraints[field]) allConstraints[field] = [];
          for (const c of toArr(constraintArr)) {
            if (!allConstraints[field].includes(c)) allConstraints[field].push(c);
          }
        }
      }
      // Collect variance policies from items
      if (isObj(item.__variance_policies)) {
        for (const [prop, policy] of Object.entries(item.__variance_policies)) {
          allVariancePolicies[prop] = policy;
        }
      }
    }

    // Also get property keys and variance policies from field_rules component_db_sources
    const dbSource = fieldRules.component_db_sources?.[type] || fieldRules.component_db_sources?.[singularize(type)] || {};
    const propMappings = toArr(dbSource.roles?.properties);
    const propKeys = propMappings.map(p => p.key).filter(Boolean);
    const varianceDetails = propMappings.map(p => ({
      key: p.key,
      policy: p.variance_policy || 'authoritative',
      type: p.type || 'string',
      unit: p.unit || '',
      constraints: toArr(p.constraints)
    })).filter(p => p.key);

    // Merge variance policies from both sources
    for (const vd of varianceDetails) {
      if (!allVariancePolicies[vd.key]) allVariancePolicies[vd.key] = vd.policy;
    }

    const varianceKeys = Object.entries(allVariancePolicies)
      .filter(([, p]) => p !== 'authoritative')
      .map(([k, p]) => `${k}:${p}`);

    // Check constraints from cross-validation rules
    const hasConstraints = Object.keys(allConstraints).length > 0 ||
      rules.some(r => r.check?.type === 'component_db_lookup' && (r.check.db === type || r.check.db === singularize(type)));

    // Find alias-matchable and property-rich items for dynamic test data
    const aliasItem = findAliasableItem(db);
    const propItem = findItemWithProperties(db);

    componentTypes.push({
      type: singularize(type),  // sensors -> sensor
      dbFile: singularize(type),
      itemCount: items.length,
      aliasCount,
      propKeys,
      varianceKeys,
      varianceDetails,
      allConstraints,
      allVariancePolicies,
      hasConstraints,
      aliasItem,
      propItem
    });
  }

  // â"€â"€ Analyze enum catalogs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const knownValuesCatalogs = [];
  for (const [catalogName, values] of Object.entries(kvFields)) {
    const valArr = toArr(values);
    // Find which fields use this catalog
    const usingFields = [];
    for (const key of fieldKeys) {
      const rule = fields[key];
      if (!isObj(rule)) continue;
      const enumBlock = isObj(rule.enum) ? rule.enum : {};
      const source = enumBlock.source || '';
      if (source === `data_lists.${catalogName}` || source === catalogName) {
        usingFields.push(key);
      }
      // Also check for yes_no catalog match
      if (catalogName === 'yes_no') {
        const parse = isObj(rule.parse) ? rule.parse : {};
        if (parse.template === 'boolean_yes_no_unk') usingFields.push(key);
      }
    }

    // Determine policy from the first field using this catalog
    let policy = 'open';
    for (const fk of usingFields) {
      const rule = fields[fk];
      if (isObj(rule?.enum)) { policy = rule.enum.policy || 'open'; break; }
    }

    knownValuesCatalogs.push({
      catalog: catalogName,
      policy,
      valueCount: valArr.length,
      values: valArr,
      usingFields
    });
  }

  // â"€â"€ Analyze evidence/conflict/tier policies â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const highEvidenceFields = [];   // fields with min_evidence_refs > 1
  const preserveAllFields = [];    // fields with preserve_all_candidates conflict policy
  const tierOverrideFields = [];   // fields where tier_preference[0] !== 'tier1'
  const objectSchemaFields = [];   // fields with object_schema (nested validation)

  for (const key of fieldKeys) {
    const rule = fields[key];
    if (!isObj(rule)) continue;
    const evidence = isObj(rule.evidence) ? rule.evidence : {};
    const contract = isObj(rule.contract) ? rule.contract : {};

    if ((evidence.min_evidence_refs || 1) > 1) {
      highEvidenceFields.push({ key, minRefs: evidence.min_evidence_refs });
    }
    if (evidence.conflict_policy === 'preserve_all_candidates') {
      preserveAllFields.push(key);
    }
    const tierPref = toArr(evidence.tier_preference);
    if (tierPref.length > 0 && tierPref[0] !== 'tier1') {
      tierOverrideFields.push({ key, tierPref });
    }
    if (isObj(contract.object_schema)) {
      objectSchemaFields.push({ key, schema: contract.object_schema });
    }
  }

  // â"€â"€ Compute scenario count dynamically â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const scenarioDefs = buildScenarioDefsFromContract({
    componentTypes, knownValuesCatalogs, rangeConstraints, rules, listFields, fieldKeys, fields,
    requiredFields, criticalFields, highEvidenceFields, preserveAllFields, tierOverrideFields
  });

  const summary = {
    fieldCount: fieldKeys.length,
    fieldsByType,
    fieldsByShape,
    enumPolicies,
    parseTemplates: parseTemplateCounts,
    componentTypes,
    requiredFields,
    criticalFields,
    rangeConstraints,
    crossValidationRules: rules.map(r => r.rule_id),
    knownValuesCatalogs: knownValuesCatalogs.map(c => c.catalog),
    testProductCount: scenarioDefs.length,
    listFieldCount: listFields.length,
    componentRefFieldCount: componentRefFields.length,
    conflictPolicies,
    evidenceRequirements,
    aiStrategies,
    highEvidenceFieldCount: highEvidenceFields.length,
    preserveAllFieldCount: preserveAllFields.length,
    tierOverrideFieldCount: tierOverrideFields.length,
    objectSchemaFieldCount: objectSchemaFields.length
  };

  // â"€â"€ Build matrices â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const matrices = {
    fieldRules: buildFieldRulesMatrix(fields, fieldKeys, rules, kvFields, rangeConstraints, aiStrategies, evidenceRequirements, scenarioDefs, componentTypes),
    components: buildComponentMatrix(componentTypes, rules, scenarioDefs),
    listsEnums: buildListsEnumsMatrix(knownValuesCatalogs, fields, fieldKeys, listFields, componentTypes, scenarioDefs)
  };

  return {
    summary, matrices, scenarioDefs,
    _raw: {
      fields, fieldKeys, kvFields, rules, componentDBs, componentTypes,
      listFields, componentRefFields, knownValuesCatalogs,
      highEvidenceFields, preserveAllFields, tierOverrideFields, objectSchemaFields
    }
  };
}

// â"€â"€ Dynamic Scenario Definitions â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildScenarioDefsFromContract({ componentTypes, knownValuesCatalogs, rangeConstraints, rules, listFields, fieldKeys, fields = {}, requiredFields, criticalFields, highEvidenceFields, preserveAllFields, tierOverrideFields }) {
  const defs = [];
  let id = 1;

  // 1. Happy path (always)
  defs.push({ id: id++, name: 'happy_path', category: 'Coverage', desc: `All ${fieldKeys.length} fields with valid values`, aiCalls: 'callLlmWithRouting (test_data_generation) -> 3 source results' });

  // 2-N. Component scenarios: new + alias for each type
  for (const ct of componentTypes) {
    defs.push({ id: id++, name: `new_${ct.type}`, category: 'Components', desc: `Unknown ${ct.type} -> new_component suggestion`, aiCalls: `callLlmWithRouting -> source data with unknown ${ct.type} name` });
    if (ct.aliasCount > 0 && ct.aliasItem) {
      defs.push({ id: id++, name: `similar_${ct.type}`, category: 'Components', desc: `${capitalize(ct.type)} alias match ("${ct.aliasItem.loweredName}" -> "${ct.aliasItem.name}")`, aiCalls: `callLlmWithRouting -> source data with near-match ${ct.type} name` });
    }
  }

  // N+1. New enum values (if has open_prefer_known catalogs)
  const openPrefKnown = knownValuesCatalogs.filter(c => c.policy === 'open_prefer_known' && c.catalog !== 'yes_no');
  if (openPrefKnown.length > 0) {
    defs.push({ id: id++, name: 'new_enum_values', category: 'Enums', desc: `New values for ${openPrefKnown.length} open_prefer_known enums`, aiCalls: 'callLlmWithRouting -> source data with fabricated enum values' });
  }

  // N+2. Similar enum values (if has catalogs with values to fuzzy match)
  const closedCatalogs = knownValuesCatalogs.filter(c => c.policy === 'closed' && c.values.length > 0);
  if (closedCatalogs.length > 0 || openPrefKnown.length > 0) {
    defs.push({ id: id++, name: 'similar_enum_values', category: 'Enums', desc: 'Near-match values -> fuzzy resolve to canonical', aiCalls: 'callLlmWithRouting -> source data with near-match enum values' });
  }

  // N+3. Closed enum rejection
  if (closedCatalogs.length > 0) {
    defs.push({ id: id++, name: 'closed_enum_reject', category: 'Enums', desc: `Invalid values for all ${closedCatalogs.length} closed enum fields`, aiCalls: 'callLlmWithRouting -> source data with invalid enum values' });
  }

  // N+4. Range violations
  if (Object.keys(rangeConstraints).length > 0) {
    defs.push({ id: id++, name: 'range_violations', category: 'Constraints', desc: `Out-of-range values for ${Object.keys(rangeConstraints).length} constrained fields`, aiCalls: 'callLlmWithRouting -> source data with out-of-range values' });
  }

  // N+5. Cross-validation
  if (rules.length > 0) {
    defs.push({ id: id++, name: 'cross_validation', category: 'Constraints', desc: `Triggers ${rules.length} cross-validation rules`, aiCalls: 'callLlmWithRouting -> source data crafted to trigger rule violations' });
  }

  // N+5b. Compound range conflict (field-rule range + component bound intersection)
  const compoundFields = toArr(rules)
    .filter(r => r?.check?.type === 'component_db_lookup')
    .map(r => r.trigger_field)
    .filter(f => rangeConstraints[f]);
  if (compoundFields.length > 0) {
    defs.push({ id: id++, name: 'compound_range_conflict', category: 'Constraints', desc: `Value between field-rule max and component max for ${compoundFields.join(', ')}`, aiCalls: 'callLlmWithRouting: source data with values that pass field-rule but fail compound range' });
  }

  // N+6. Component constraint violations (e.g., sensor_date <= release_date)
  const constrainedTypes = componentTypes.filter(ct => Object.keys(ct.allConstraints).length > 0);
  if (constrainedTypes.length > 0) {
    const constraintDesc = constrainedTypes.map(ct => Object.values(ct.allConstraints).flat().join(', ')).join('; ');
    defs.push({ id: id++, name: 'component_constraints', category: 'Constraints', desc: `Violate component constraints: ${constraintDesc}`, aiCalls: 'callLlmWithRouting -> source data with constraint-violating dates/values' });
  }

  // N+7. Variance policy testing
  const varianceTypes = componentTypes.filter(ct => ct.varianceKeys.length > 0);
  if (varianceTypes.length > 0) {
    const varDesc = varianceTypes.map(ct => ct.varianceKeys.join(', ')).join('; ');
    defs.push({ id: id++, name: 'variance_policies', category: 'Constraints', desc: `Test variance policies: ${varDesc}`, aiCalls: 'callLlmWithRouting -> source data with values at variance boundaries' });
  }

  // N+8. Min evidence refs (if any fields require 2+ refs)
  const highEvFields = toArr(highEvidenceFields);
  if (highEvFields.length > 0) {
    defs.push({ id: id++, name: 'min_evidence_refs', category: 'Edge Cases', desc: `Only 1 source for ${highEvFields.length} fields requiring 2+ evidence refs (${highEvFields.map(f => f.key).join(', ')})`, aiCalls: 'callLlmWithRouting -> 1 source for high-evidence fields' });
  }

  // N+9. Tier preference override (if any fields prefer tier2 over tier1)
  const tierFields = toArr(tierOverrideFields);
  if (tierFields.length > 0) {
    defs.push({ id: id++, name: 'tier_preference_override', category: 'Edge Cases', desc: `${tierFields.length} fields prefer tier2 over tier1 â€" conflicting values to verify tier2 wins (${tierFields.map(f => f.key).join(', ')})`, aiCalls: 'callLlmWithRouting -> 2 sources with conflicting values for tier-preference fields' });
  }

  // N+10. Preserve all candidates conflict policy
  const preserveFields = toArr(preserveAllFields);
  if (preserveFields.length > 0) {
    defs.push({ id: id++, name: 'preserve_all_candidates', category: 'Edge Cases', desc: `${preserveFields.length} fields use preserve_all_candidates â€" multiple sources merged not resolved (${preserveFields.join(', ')})`, aiCalls: 'callLlmWithRouting -> 3 sources with different values for preserve-all fields' });
  }

  // N+11. Missing required fields (always)
  defs.push({ id: id++, name: 'missing_required', category: 'Edge Cases', desc: `Only 3-4 optional fields -> ${requiredFields.length} required fields missing`, aiCalls: 'callLlmWithRouting -> source data with minimal fields' });

  // N+9. Multi-source consensus (always)
  defs.push({ id: id++, name: 'multi_source_consensus', category: 'Edge Cases', desc: '4 sources disagree on key fields -> tier-weighted consensus', aiCalls: 'callLlmWithRouting -> 4 source results with disagreements' });

  // N+10. List fields dedup (if has list fields)
  if (listFields.length > 0) {
    defs.push({ id: id++, name: 'list_fields_dedup', category: 'Edge Cases', desc: `All ${listFields.length} list fields with duplicates -> dedupe + union`, aiCalls: 'callLlmWithRouting -> source data with duplicated list values' });
  }

  // ── Validation gap scenarios (always generated — exercise validator P3/P4/P7/rounding) ──

  const numericFields = fieldKeys.filter(k => {
    const r = fields?.[k]; if (!r) return false;
    const t = r.contract?.type || r.data_type || '';
    return t === 'number' || t === 'integer';
  });
  if (numericFields.length > 0) {
    defs.push({ id: id++, name: 'type_violations', category: 'Validation', desc: `Non-numeric strings for ${numericFields.length} number fields -> P3 type coercion repair` });
  }

  const formatFields = fieldKeys.filter(k => {
    const tmpl = fields?.[k]?.parse?.template || '';
    return tmpl === 'url_field' || tmpl === 'date_field';
  });
  if (formatFields.length > 0) {
    defs.push({ id: id++, name: 'format_violations', category: 'Validation', desc: `Malformed values for ${formatFields.length} format-checked fields -> P4 format repair` });
  }

  const unitFields = fieldKeys.filter(k => fields?.[k]?.contract?.unit);
  if (unitFields.length > 0) {
    defs.push({ id: id++, name: 'unit_violations', category: 'Validation', desc: `Wrong unit suffixes for ${unitFields.length} unit fields -> unit conversion repair` });
  }

  if (numericFields.length > 0) {
    defs.push({ id: id++, name: 'rounding_precision', category: 'Validation', desc: `Excess decimal places for ${numericFields.length} numeric fields -> deterministic rounding repair` });
  }

  // shape_violations: arrays where scalars expected, scalars where lists expected -> wrong_shape rejection (prompt_skipped)
  const scalarFields = fieldKeys.filter(k => (fields?.[k]?.contract?.shape || 'scalar') === 'scalar');
  const listFieldsForShape = fieldKeys.filter(k => fields?.[k]?.contract?.shape === 'list');
  if (scalarFields.length > 0 || listFieldsForShape.length > 0) {
    defs.push({ id: id++, name: 'shape_violations', category: 'Validation', desc: `Wrong shapes for ${scalarFields.length} scalar + ${listFieldsForShape.length} list fields -> shape rejection (prompt_skipped)` });
  }

  return defs;
}

// Stable lookup: find scenario by name
function findScenario(defs, name) { return defs.find(d => d.name === name); }
function findScenarioId(defs, name) { return findScenario(defs, name)?.id ?? -1; }

// â"€â"€ Matrix Builders â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildFieldRulesMatrix(fields, fieldKeys, crossRules, kvFields, rangeConstraints, aiStrategies, evidenceRequirements, scenarioDefs, componentTypes = []) {
  const columns = [
    { key: 'fieldKey', label: 'Field Key', width: '160px' },
    { key: 'type', label: 'Type', width: '70px' },
    { key: 'shape', label: 'Shape', width: '70px' },
    { key: 'parseTemplate', label: 'Parse Template', width: '180px' },
    { key: 'unit', label: 'Unit', width: '50px' },
    { key: 'enumPolicy', label: 'Enum Policy', width: '130px' },
    { key: 'enumSource', label: 'Enum Source', width: '150px' },
    { key: 'range', label: 'Range', width: '100px' },
    { key: 'rounding', label: 'Rounding', width: '80px' },
    { key: 'required', label: 'Required', width: '80px' },
    { key: 'minEvidence', label: 'Min Evidence', width: '90px' },
    { key: 'conflictPolicy', label: 'Conflict Policy', width: '130px' },
    { key: 'tierPreference', label: 'Tier Pref', width: '100px' },
    { key: 'aiStrategy', label: 'AI Strategy', width: '80px' },
    { key: 'testNumbers', label: 'Test #', width: '100px' },
    { key: 'expectedBehavior', label: 'Expected Behavior', width: '250px' },
    { key: 'expectedAiBehavior', label: 'Expected AI Behavior', width: '220px' },
    { key: 'useCasesCovered', label: '\u2713 Covered', width: '80px' },
    { key: 'flagsGenerated', label: 'Flags', width: '60px' },
  ];

  const rows = [];
  const fieldSummary = { types: {}, shapes: {}, templates: {}, policies: {}, rangeCount: 0, requiredCount: 0 };

  for (const key of fieldKeys) {
    const rule = fields[key];
    if (!isObj(rule)) continue;

    const contract = isObj(rule.contract) ? rule.contract : {};
    const parse = isObj(rule.parse) ? rule.parse : {};
    const enumBlock = isObj(rule.enum) ? rule.enum : {};
    const evidence = isObj(rule.evidence) ? rule.evidence : {};
    const priority = isObj(rule.priority) ? rule.priority : {};
    const rounding = isObj(contract.rounding) ? contract.rounding : {};

    const type = contract.type || rule.data_type || 'string';
    const shape = contract.shape || rule.output_shape || 'scalar';
    const template = parse.template || '-';
    const unit = contract.unit || parse.unit || '-';
    const policy = enumBlock.policy || 'open';
    const source = enumBlock.source || '-';
    const range = rangeConstraints[key] ? `${rangeConstraints[key].min}-${rangeConstraints[key].max}` : '-';
    const roundStr = rounding.mode ? `${rounding.mode}:${rounding.decimals ?? 0}` : '-';
    const requiredLevel = priority.required_level || priority.availability || rule.required_level || rule.availability || 'optional';
    const minEv = evidence.min_evidence_refs || 1;
    const conflict = evidence.conflict_policy || 'resolve_by_tier';
    const tierPref = toArr(evidence.tier_preference);
    const tierPrefStr = tierPref.length > 0 && tierPref[0] !== 'tier1' ? tierPref.join('>') : 'default';
    const aiStrat = aiStrategies[key] || 'auto';

    // Determine which test scenarios exercise this field
    const testNumbers = assignFieldTestNumbers({ key, type, shape, template, policy, source, range, requiredLevel, rule, scenarioDefs, crossRules, componentTypes });
    const expectedBehavior = describeFieldExpectedBehavior(key, type, shape, template, unit, policy, source, range, roundStr);
    const expectedAiBehavior = describeFieldAiBehavior(key, template, aiStrat, minEv);

    rows.push({
      id: `field_${key}`,
      cells: {
        fieldKey: key, type, shape, parseTemplate: template, unit, enumPolicy: policy, enumSource: source,
        range, rounding: roundStr, required: requiredLevel, minEvidence: minEv, conflictPolicy: conflict,
        tierPreference: tierPrefStr, aiStrategy: aiStrat, testNumbers: '', expectedBehavior: '', expectedAiBehavior,
        useCasesCovered: 'NO', flagsGenerated: 0,
      },
      testNumbers,
      expectedBehavior,
      expandableDetails: [],
      validationStatus: 'pending'
    });

    fieldSummary.types[type] = (fieldSummary.types[type] || 0) + 1;
    fieldSummary.shapes[shape] = (fieldSummary.shapes[shape] || 0) + 1;
    if (template !== '-') fieldSummary.templates[template] = (fieldSummary.templates[template] || 0) + 1;
    fieldSummary.policies[policy] = (fieldSummary.policies[policy] || 0) + 1;
    if (range !== '-') fieldSummary.rangeCount++;
    if (requiredLevel === 'required' || requiredLevel === 'critical') fieldSummary.requiredCount++;
  }

  return {
    title: 'Field Rules Coverage Matrix',
    columns,
    rows,
    summary: {
      totalFields: fieldKeys.length,
      types: JSON.stringify(fieldSummary.types),
      shapes: JSON.stringify(fieldSummary.shapes),
      parseTemplates: Object.keys(fieldSummary.templates).length,
      rangeConstrained: fieldSummary.rangeCount,
      requiredOrCritical: fieldSummary.requiredCount
    }
  };
}

function assignFieldTestNumbers({ key, type, shape, template, policy, source, range, requiredLevel, rule, scenarioDefs, crossRules = [], componentTypes = [] }) {
  const tests = new Set();

  const happyId = findScenarioId(scenarioDefs, 'happy_path');
  if (happyId > 0) tests.add(happyId);

  if (template === 'component_reference') {
    for (const sd of scenarioDefs) {
      if (sd.name.startsWith('new_') && source?.includes?.(sd.name.replace('new_', ''))) tests.add(sd.id);
      if (sd.name.startsWith('similar_') && source?.includes?.(sd.name.replace('similar_', ''))) tests.add(sd.id);
    }
  }

  if (policy === 'open_prefer_known' && source && source !== '-' && !source.startsWith('component_db')) {
    const newEnumId = findScenarioId(scenarioDefs, 'new_enum_values');
    const simEnumId = findScenarioId(scenarioDefs, 'similar_enum_values');
    if (newEnumId > 0) tests.add(newEnumId);
    if (simEnumId > 0) tests.add(simEnumId);
  }
  if (policy === 'closed') {
    const closedId = findScenarioId(scenarioDefs, 'closed_enum_reject');
    if (closedId > 0) tests.add(closedId);
  }

  if (range !== '-') {
    const rangeId = findScenarioId(scenarioDefs, 'range_violations');
    if (rangeId > 0) tests.add(rangeId);
  }

  const crossId = findScenarioId(scenarioDefs, 'cross_validation');
  const missingId = findScenarioId(scenarioDefs, 'missing_required');

  if (crossId > 0) {
    const crossFieldSet = new Set(
      toArr(crossRules).flatMap(r => [
        r.trigger_field,
        ...(r.related_fields || []),
        ...(r.depends_on || []),
        ...(r.requires_field ? [r.requires_field] : []),
      ]).filter(Boolean)
    );
    if (crossFieldSet.has(key)) tests.add(crossId);
  }

  if ((requiredLevel === 'required' || requiredLevel === 'critical') && missingId > 0) tests.add(missingId);

  const compoundId = findScenarioId(scenarioDefs, 'compound_range_conflict');
  if (compoundId > 0 && range !== '-') {
    const compoundTriggers = new Set(
      toArr(crossRules)
        .filter(r => r?.check?.type === 'component_db_lookup')
        .map(r => r.trigger_field)
        .filter(Boolean)
    );
    if (compoundTriggers.has(key)) tests.add(compoundId);
  }

  const constraintId = findScenarioId(scenarioDefs, 'component_constraints');
  if (constraintId > 0) {
    const constraintFields = new Set(
      toArr(componentTypes).flatMap(ct => Object.keys(ct.allConstraints || {}))
    );
    if (constraintFields.has(key)) tests.add(constraintId);
  }

  const varianceId = findScenarioId(scenarioDefs, 'variance_policies');
  if (varianceId > 0) {
    const varianceFields = new Set(
      toArr(componentTypes).flatMap(ct =>
        Object.entries(ct.allVariancePolicies || {})
          .filter(([, p]) => p !== 'authoritative')
          .map(([k]) => k)
      )
    );
    if (varianceFields.has(key)) tests.add(varianceId);
  }

  const minEvId = findScenarioId(scenarioDefs, 'min_evidence_refs');
  if (minEvId > 0) {
    const evBlock = isObj(rule?.evidence) ? rule.evidence : {};
    if ((evBlock.min_evidence_refs || 1) > 1) tests.add(minEvId);
  }

  const tierPrefId = findScenarioId(scenarioDefs, 'tier_preference_override');
  if (tierPrefId > 0) {
    const evBlock = isObj(rule?.evidence) ? rule.evidence : {};
    const tierPref = toArr(evBlock.tier_preference);
    if (tierPref.length > 0 && tierPref[0] !== 'tier1') tests.add(tierPrefId);
  }

  const preserveId = findScenarioId(scenarioDefs, 'preserve_all_candidates');
  if (preserveId > 0) {
    const evBlock = isObj(rule?.evidence) ? rule.evidence : {};
    if (evBlock.conflict_policy === 'preserve_all_candidates') tests.add(preserveId);
  }

  const consensusId = findScenarioId(scenarioDefs, 'multi_source_consensus');
  if (consensusId > 0) {
    const isNumeric = ['number', 'integer', 'float'].includes(type);
    const isRequired = requiredLevel === 'required' || requiredLevel === 'critical';
    const hasRange = range !== '-';
    if (isNumeric && (hasRange || isRequired)) tests.add(consensusId);
  }

  if (shape === 'list') {
    const listId = findScenarioId(scenarioDefs, 'list_fields_dedup');
    if (listId > 0) tests.add(listId);
  }

  return [...tests].sort((a, b) => a - b);
}

function describeFieldExpectedBehavior(key, type, shape, template, unit, policy, source, range, rounding) {
  const parts = [];

  if (template === 'number_with_unit' && unit !== '-') parts.push(`Parse "${unit}" unit values`);
  else if (template === 'boolean_yes_no_unk') parts.push('Parse yes/no -> canonical');
  else if (template === 'component_reference') parts.push('Component lookup');
  else if (template === 'date_field') parts.push('Date parse validation');
  else if (template === 'url_field') parts.push('URL format validation');
  else if (template === 'text_field') parts.push('Text normalization');
  else if (template === 'latency_list_modes_ms') parts.push('Parse latency mode objects');
  else if (template && template.includes('list')) parts.push(`List parse (${template})`);
  else if (template && template !== '-') parts.push(`Parse via ${template}`);

  if (type === 'integer') parts.push('round to int');
  if (rounding !== '-') parts.push(`rounding: ${rounding}`);
  if (range !== '-') parts.push(`range check ${range}`);
  if (policy === 'closed') parts.push('closed enum enforce');
  else if (policy === 'open_prefer_known') parts.push('prefer known + suggest new');
  if (shape === 'list') parts.push('dedupe, union');

  return parts.join(', ') || 'Standard processing';
}

function describeFieldAiBehavior(key, template, aiStrategy, minEvidence) {
  const parts = [];
  parts.push(`strategy: ${aiStrategy}`);
  if (template === 'component_reference') parts.push('component_db lookup after LLM extract');
  else if (template === 'boolean_yes_no_unk') parts.push('LLM extracts yes/no token');
  else if (template === 'number_with_unit') parts.push('LLM extracts number+unit string');
  else if (template && template.includes('list')) parts.push('LLM extracts delimited list');
  else parts.push('LLM extracts raw text');
  if (minEvidence > 1) parts.push(`needs ${minEvidence} evidence refs`);
  return parts.join('; ');
}

function buildComponentMatrix(componentTypes, crossRules, scenarioDefs) {
  const columns = [
    { key: 'componentType', label: 'Component Type', width: '120px' },
    { key: 'dbItems', label: 'DB Items', width: '80px' },
    { key: 'withAliases', label: 'With Aliases', width: '90px' },
    { key: 'propertyKeys', label: 'Property Keys', width: '200px' },
    { key: 'variancePolicies', label: 'Variance Policies', width: '200px' },
    { key: 'constraints', label: 'Constraints', width: '150px' },
    { key: 'testScenario', label: 'Test Scenario', width: '180px' },
    { key: 'injectName', label: 'Inject Name', width: '160px' },
    { key: 'expectedMatchType', label: 'Expected Match', width: '120px' },
    { key: 'expectedBehavior', label: 'Expected Behavior', width: '250px' },
    { key: 'expectedAiBehavior', label: 'Expected AI Behavior', width: '220px' },
    { key: 'useCasesCovered', label: '\u2713 Covered', width: '80px' },
    { key: 'flagsGenerated', label: 'Flags', width: '60px' },
  ];

  const rows = [];

  for (const ct of componentTypes) {
    const newScenario = findScenario(scenarioDefs, `new_${ct.type}`);
    const similarScenario = findScenario(scenarioDefs, `similar_${ct.type}`);
    const constraintScenario = findScenario(scenarioDefs, 'component_constraints');
    const varianceScenario = findScenario(scenarioDefs, 'variance_policies');
    const crossValScenario = findScenario(scenarioDefs, 'cross_validation');

    const constraintsList = Object.entries(ct.allConstraints).map(([f, c]) => `${f}: ${c.join(', ')}`).join('; ') || 'none';

    // Row 1: New component discovery
    if (newScenario) {
      const fabricatedName = buildUnknownComponentIdentity(ct.type, 0).name;
      rows.push({
        id: `comp_${ct.type}_new`,
        cells: {
          componentType: ct.type, dbItems: ct.itemCount, withAliases: ct.aliasCount,
          propertyKeys: ct.propKeys.join(', ') || 'none',
          variancePolicies: ct.varianceKeys.join(', ') || 'none',
          constraints: constraintsList,
          testScenario: `Test ${newScenario.id}: New ${capitalize(ct.type)}`,
          injectName: fabricatedName,
          expectedMatchType: 'new_component',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [newScenario.id],
        expectedBehavior: `Creates curation suggestion in SQL (curation_suggestions table) with type=${ct.type}, records product_attributes {${ct.propKeys.join(', ')}}`,
        validationStatus: 'pending'
      });
    }

    // Row 2: Alias/similar match
    if (similarScenario && ct.aliasItem) {
      rows.push({
        id: `comp_${ct.type}_similar`,
        cells: {
          componentType: ct.type, dbItems: ct.itemCount, withAliases: ct.aliasCount,
          propertyKeys: ct.propKeys.join(', ') || 'none',
          variancePolicies: ct.varianceKeys.join(', ') || 'none',
          constraints: constraintsList,
          testScenario: `Test ${similarScenario.id}: Similar ${capitalize(ct.type)}`,
          injectName: ct.aliasItem.loweredName,
          expectedMatchType: 'exact_or_alias',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [similarScenario.id],
        expectedBehavior: `Resolves to canonical "${ct.aliasItem.name}", identity observation recorded, property scoring applied`,
        validationStatus: 'pending'
      });
    }

    // Row 3: Per-property variance policy rows
    for (const [prop, policy] of Object.entries(ct.allVariancePolicies)) {
      if (varianceScenario) {
        const policyLabel = policy === 'upper_bound' ? 'extracted â‰¤ known -> full score' :
          policy === 'override_allowed' ? 'product can claim different value' :
            'must match exactly';
        rows.push({
          id: `comp_${ct.type}_variance_${prop}`,
          cells: {
            componentType: ct.type, dbItems: '-', withAliases: '-',
            propertyKeys: prop,
            variancePolicies: `${prop}: ${policy}`,
            constraints: '-',
            testScenario: `Test ${varianceScenario.id}: Variance`,
            injectName: ct.propItem?.name || '-',
            expectedMatchType: 'variance_check',
            expectedBehavior: '', expectedAiBehavior: ''
          },
          testNumbers: [varianceScenario.id],
          expectedBehavior: `${capitalize(ct.type)}.${prop} (${policy}): ${policyLabel}`,
          validationStatus: 'pending'
        });
      }
    }

    // Row 4: Constraint violation rows
    for (const [field, constraintArr] of Object.entries(ct.allConstraints)) {
      if (constraintScenario) {
        for (const constraint of constraintArr) {
          rows.push({
            id: `comp_${ct.type}_constraint_${field}`,
            cells: {
              componentType: ct.type, dbItems: '-', withAliases: '-',
              propertyKeys: field,
              variancePolicies: '-',
              constraints: constraint,
              testScenario: `Test ${constraintScenario.id}: Constraint`,
              injectName: `${ct.propItem?.name || ct.type} + violation`,
              expectedMatchType: 'constraint_violation',
              expectedBehavior: '', expectedAiBehavior: ''
            },
            testNumbers: [constraintScenario.id],
            expectedBehavior: `Violate "${constraint}" -> constraint_analysis contradiction, flag_for_review`,
            validationStatus: 'pending'
          });
        }
      }
    }

    // Row 5: Cross-validation (DPI consistency for sensor type)
    if (crossValScenario && ct.propKeys.includes('dpi')) {
      rows.push({
        id: `comp_${ct.type}_crossval_dpi`,
        cells: {
          componentType: ct.type, dbItems: '-', withAliases: '-',
          propertyKeys: 'dpi',
          variancePolicies: 'dpi: upper_bound',
          constraints: 'sensor_dpi_consistency',
          testScenario: `Test ${crossValScenario.id}: DPI Consistency`,
          injectName: `${ct.propItem?.name || ct.type} + dpi=999999`,
          expectedMatchType: 'cross_validation',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [crossValScenario.id],
        expectedBehavior: `Cross-validation: dpi exceeds ${ct.type} max dpi Ã-- 1.05 -> sensor_dpi_consistency violation`,
        validationStatus: 'pending'
      });
    }
  }

  // Add AI behavior column values
  for (const row of rows) {
    const matchType = row.cells.expectedMatchType;
    if (matchType === 'new_component') row.cells.expectedAiBehavior = 'LLM generates unknown name -> runtime gate: component_reference parse -> no match -> new_component suggestion created';
    else if (matchType === 'exact_or_alias') row.cells.expectedAiBehavior = 'LLM generates near-match -> runtime gate: fuzzy/alias lookup -> canonical resolution -> identity observation';
    else if (matchType === 'variance_check') row.cells.expectedAiBehavior = 'LLM generates value -> runtime gate: property scoring compares extracted vs component DB value';
    else if (matchType === 'constraint_violation') row.cells.expectedAiBehavior = 'LLM generates constraint-violating value -> constraint graph evaluation -> contradiction flagged';
    else if (matchType === 'cross_validation') row.cells.expectedAiBehavior = 'LLM generates inconsistent value -> cross_validation_rules check -> flag_for_review';
    else row.cells.expectedAiBehavior = 'LLM generates source data -> standard component pipeline';
  }

  for (const row of rows) {
    if (!row.expandableDetails) row.expandableDetails = [];
    if (!row.cells.useCasesCovered) row.cells.useCasesCovered = 'NO';
    if (row.cells.flagsGenerated == null) row.cells.flagsGenerated = 0;
  }

  return {
    title: 'Component Table Coverage Matrix',
    columns,
    rows,
    summary: {
      totalTypes: componentTypes.length,
      totalItems: componentTypes.reduce((s, c) => s + c.itemCount, 0),
      newDiscoveryTested: `${componentTypes.filter(ct => findScenario(scenarioDefs, `new_${ct.type}`)).length}/${componentTypes.length} types`,
      aliasMatchTested: `${componentTypes.filter(ct => ct.aliasItem && findScenario(scenarioDefs, `similar_${ct.type}`)).length}/${componentTypes.length} types`,
      variancePoliciesTested: componentTypes.reduce((s, ct) => s + Object.keys(ct.allVariancePolicies).length, 0),
      constraintsTested: componentTypes.reduce((s, ct) => s + Object.values(ct.allConstraints).flat().length, 0)
    }
  };
}

function buildListsEnumsMatrix(catalogs, fields, fieldKeys, listFields, componentTypes, scenarioDefs) {
  const columns = [
    { key: 'catalog', label: 'Catalog / Field', width: '180px' },
    { key: 'policy', label: 'Policy', width: '130px' },
    { key: 'knownValues', label: 'Known Values', width: '80px' },
    { key: 'fieldsUsing', label: 'Fields Using It', width: '180px' },
    { key: 'testScenario', label: 'Test Scenario', width: '180px' },
    { key: 'injectValue', label: 'Inject Value', width: '160px' },
    { key: 'expectedMatch', label: 'Expected Match', width: '120px' },
    { key: 'expectedBehavior', label: 'Expected Behavior', width: '250px' },
    { key: 'expectedAiBehavior', label: 'Expected AI Behavior', width: '220px' },
    { key: 'useCasesCovered', label: '\u2713 Covered', width: '80px' },
    { key: 'flagsGenerated', label: 'Flags', width: '60px' },
  ];

  const rows = [];
  const closedCatalogs = catalogs.filter(c => c.policy === 'closed');
  const openPrefKnown = catalogs.filter(c => c.policy === 'open_prefer_known');

  const closedScenarioId = findScenarioId(scenarioDefs, 'closed_enum_reject');
  const newEnumScenarioId = findScenarioId(scenarioDefs, 'new_enum_values');
  const simEnumScenarioId = findScenarioId(scenarioDefs, 'similar_enum_values');
  const happyId = findScenarioId(scenarioDefs, 'happy_path');

  // Closed catalogs -> rejection test + happy path test
  for (const cat of closedCatalogs) {
    // Rejection row
    if (closedScenarioId > 0) {
      rows.push({
        id: `enum_${cat.catalog}_closed`,
        cells: {
          catalog: `data_lists.${cat.catalog}`, policy: 'closed', knownValues: cat.valueCount,
          fieldsUsing: cat.usingFields.join(', ') || cat.catalog,
          testScenario: `Test ${closedScenarioId}: Closed Enum`,
          injectValue: `invalid_${cat.catalog}_value`,
          expectedMatch: 'REJECT',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [closedScenarioId],
        expectedBehavior: `enum_value_not_allowed -> field set to 'unk', runtime gate failure`,
        validationStatus: 'pending'
      });
    }

    // Happy path row
    if (cat.values.length > 0 && happyId > 0) {
      rows.push({
        id: `enum_${cat.catalog}_happy`,
        cells: {
          catalog: `data_lists.${cat.catalog}`, policy: 'closed', knownValues: cat.valueCount,
          fieldsUsing: cat.usingFields.join(', ') || cat.catalog,
          testScenario: `Test ${happyId}: Happy Path`,
          injectValue: cat.values[0],
          expectedMatch: 'EXACT',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [happyId],
        expectedBehavior: 'Accepted as-is (exact match in closed enum)',
        validationStatus: 'pending'
      });
    }

    // Similar match row for closed catalogs with parenthetical values
    if (simEnumScenarioId > 0) {
      const parenVal = cat.values.find(v => v.includes('('));
      if (parenVal) {
        const stripped = parenVal.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
        rows.push({
          id: `enum_${cat.catalog}_similar`,
          cells: {
            catalog: `data_lists.${cat.catalog}`, policy: 'closed', knownValues: cat.valueCount,
            fieldsUsing: cat.usingFields.join(', ') || cat.catalog,
            testScenario: `Test ${simEnumScenarioId}: Similar Enum`,
            injectValue: stripped,
            expectedMatch: `SIMILAR -> "${parenVal}"`,
            expectedBehavior: '', expectedAiBehavior: ''
          },
          testNumbers: [simEnumScenarioId],
          expectedBehavior: `Alias/fuzzy match resolves "${stripped}" -> "${parenVal}"`,
          validationStatus: 'pending'
        });
      }
    }
  }

  // Open prefer known -> new value + similar match tests
  for (const cat of openPrefKnown) {
    if (cat.catalog === 'yes_no') {
      rows.push({
        id: `enum_${cat.catalog}`,
        cells: {
          catalog: cat.catalog, policy: 'open_prefer_known', knownValues: cat.valueCount,
          fieldsUsing: `${cat.usingFields.length} boolean fields`,
          testScenario: `Test ${happyId}: Happy Path`,
          injectValue: 'yes/no',
          expectedMatch: 'EXACT',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [happyId],
        expectedBehavior: 'All boolean fields use this catalog',
        validationStatus: 'pending'
      });
      continue;
    }

    // New value test
    if (newEnumScenarioId > 0) {
      rows.push({
        id: `enum_${cat.catalog}_new`,
        cells: {
          catalog: `data_lists.${cat.catalog}`, policy: 'open_prefer_known', knownValues: cat.valueCount,
          fieldsUsing: cat.usingFields.join(', ') || cat.catalog,
          testScenario: `Test ${newEnumScenarioId}: New Enum`,
          injectValue: `NewTestValue_${cat.catalog}`,
          expectedMatch: 'NEW -> suggestion',
          expectedBehavior: '', expectedAiBehavior: ''
        },
        testNumbers: [newEnumScenarioId],
        expectedBehavior: 'Accepted (open_prefer_known) + enum curation suggestion created in SQL (curation_suggestions table)',
        validationStatus: 'pending'
      });
    }

    // Similar match test (if has values with variation potential)
    if (simEnumScenarioId > 0 && cat.values.length > 0) {
      const parenVal = cat.values.find(v => v.includes('('));
      if (parenVal) {
        const stripped = parenVal.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
        rows.push({
          id: `enum_${cat.catalog}_similar`,
          cells: {
            catalog: `data_lists.${cat.catalog}`, policy: 'open_prefer_known', knownValues: cat.valueCount,
            fieldsUsing: cat.usingFields.join(', ') || cat.catalog,
            testScenario: `Test ${simEnumScenarioId}: Similar Enum`,
            injectValue: stripped,
            expectedMatch: `SIMILAR -> "${parenVal}"`,
            expectedBehavior: '', expectedAiBehavior: ''
          },
          testNumbers: [simEnumScenarioId],
          expectedBehavior: `Alias/fuzzy resolves to canonical form "${parenVal}"`,
          validationStatus: 'pending'
        });
      }
    }
  }

  // Component DB as enum sources
  for (const ct of componentTypes) {
    const newId = findScenarioId(scenarioDefs, `new_${ct.type}`);
    const simId = findScenarioId(scenarioDefs, `similar_${ct.type}`);
    const testNums = [newId, simId].filter(n => n > 0);
    rows.push({
      id: `enum_compdb_${ct.type}`,
      cells: {
        catalog: `component_db.${ct.type}`, policy: 'open_prefer_known', knownValues: ct.itemCount,
        fieldsUsing: ct.type,
        testScenario: testNums.map(n => `Test ${n}`).join(', '),
        injectValue: 'varies',
        expectedMatch: 'NEW or SIMILAR',
        expectedBehavior: '', expectedAiBehavior: ''
      },
      testNumbers: testNums,
      expectedBehavior: 'Component-level matching (see Component Matrix)',
      validationStatus: 'pending'
    });
  }

  // List fields sub-matrix rows
  const listScenarioId = findScenarioId(scenarioDefs, 'list_fields_dedup');
  const preserveScenarioId = findScenarioId(scenarioDefs, 'preserve_all_candidates');
  const tierPrefScenarioId = findScenarioId(scenarioDefs, 'tier_preference_override');
  const minEvScenarioId = findScenarioId(scenarioDefs, 'min_evidence_refs');

  for (const lf of listFields) {
    const rule = fields[lf];
    if (!isObj(rule)) continue;
    const parse = isObj(rule.parse) ? rule.parse : {};
    const enumBlock = isObj(rule.enum) ? rule.enum : {};
    const evidence = isObj(rule.evidence) ? rule.evidence : {};
    const contract = isObj(rule.contract) ? rule.contract : {};
    const listRules = isObj(rule.list_rules) ? rule.list_rules : {};

    const testNums = listScenarioId > 0 ? [listScenarioId] : [];
    const behaviorParts = [`${parse.template || 'list'} parse, dedupe, max:${listRules.max_items || 100}`];

    // Enrich with conflict policy info
    if (evidence.conflict_policy === 'preserve_all_candidates') {
      if (preserveScenarioId > 0) testNums.push(preserveScenarioId);
      behaviorParts.push('conflict: preserve_all (merge, not resolve)');
    }

    // Enrich with tier preference info
    const tierPref = toArr(evidence.tier_preference);
    if (tierPref.length > 0 && tierPref[0] !== 'tier1') {
      if (tierPrefScenarioId > 0) testNums.push(tierPrefScenarioId);
      behaviorParts.push(`tier_pref: ${tierPref.join('>')}`);
    }

    // Enrich with object schema info
    if (isObj(contract.object_schema)) {
      const schemaKeys = Object.keys(contract.object_schema);
      const nestedEnums = [];
      for (const [sk, sv] of Object.entries(contract.object_schema)) {
        if (isObj(sv) && sv.enum_policy) {
          nestedEnums.push(`${sk}: ${sv.enum_policy} [${toArr(sv.allowed).slice(0, 4).join(',')}]`);
        }
      }
      behaviorParts.push(`object_schema: {${schemaKeys.join(', ')}}`);
      if (nestedEnums.length > 0) behaviorParts.push(`nested enums: ${nestedEnums.join('; ')}`);
    }

    // Enrich with min evidence info
    if ((evidence.min_evidence_refs || 1) > 1) {
      if (minEvScenarioId > 0) testNums.push(minEvScenarioId);
    }

    rows.push({
      id: `list_${lf}`,
      cells: {
        catalog: `list:${lf}`, policy: enumBlock.source ? `enum: ${enumBlock.source}` : 'no enum',
        knownValues: '-', fieldsUsing: lf,
        testScenario: testNums.map(n => `Test ${n}`).join(', ') || '-',
        injectValue: 'duplicated values',
        expectedMatch: evidence.conflict_policy === 'preserve_all_candidates' ? 'PRESERVE_ALL' : 'DEDUPE',
        expectedBehavior: '', expectedAiBehavior: ''
      },
      testNumbers: testNums,
      expectedBehavior: behaviorParts.join('; '),
      validationStatus: 'pending'
    });
  }

  // Set AI behavior for all rows
  for (const row of rows) {
    const match = String(row.cells.expectedMatch || '');
    if (match === 'REJECT') row.cells.expectedAiBehavior = 'LLM generates invalid value -> runtime gate: closed enum check -> rejection -> field set to unk';
    else if (match.startsWith('SIMILAR')) row.cells.expectedAiBehavior = 'LLM generates near-match -> runtime gate: fuzzy match against known_values -> canonical resolution';
    else if (match.startsWith('NEW')) row.cells.expectedAiBehavior = 'LLM generates unknown value -> runtime gate: open_prefer_known accepts -> curation suggestion created';
    else if (match === 'EXACT') row.cells.expectedAiBehavior = 'LLM generates known value -> runtime gate: exact match in enum -> accepted';
    else if (match === 'PRESERVE_ALL') row.cells.expectedAiBehavior = 'LLM generates per-source list items -> preserve_all_candidates: ALL values from ALL sources kept (not tier-resolved)';
    else if (match === 'DEDUPE') row.cells.expectedAiBehavior = 'LLM generates list with dupes -> list_union reducer: split + dedupe + max_items';
    else row.cells.expectedAiBehavior = 'LLM generates source data -> standard enum/list pipeline';
  }

  for (const row of rows) {
    if (!row.expandableDetails) row.expandableDetails = [];
    if (!row.cells.useCasesCovered) row.cells.useCasesCovered = 'NO';
    if (row.cells.flagsGenerated == null) row.cells.flagsGenerated = 0;
  }

  return {
    title: 'Lists & Enums Coverage Matrix',
    columns,
    rows,
    summary: {
      totalCatalogs: catalogs.length,
      closedCount: closedCatalogs.length,
      openPreferKnownCount: openPrefKnown.length,
      listFieldCount: listFields.length,
      allClosedRejectionTested: closedCatalogs.length > 0 && closedScenarioId > 0 ? `Test ${closedScenarioId}` : 'n/a',
      allListsDedupTested: listFields.length > 0 && listScenarioId > 0 ? `Test ${listScenarioId}` : 'n/a'
    }
  };
}

// â"€â"€ Export stable scenario defs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// For backward compatibility, export default mouse-like scenarios
// but buildScenarioDefsFromContract() creates the real ones dynamically
const SCENARIO_DEFS_DEFAULT = [
  { id: 1,  name: 'happy_path',           category: 'Coverage',    desc: 'All fields with valid values' },
  { id: 2,  name: 'new_sensor',           category: 'Components',  desc: 'Unknown sensor -> new component suggestion' },
  { id: 3,  name: 'similar_sensor',       category: 'Components',  desc: 'Sensor alias match' },
  { id: 4,  name: 'new_switch',           category: 'Components',  desc: 'Unknown switch -> new component suggestion' },
  { id: 5,  name: 'similar_switch',       category: 'Components',  desc: 'Switch alias match' },
  { id: 6,  name: 'new_encoder',          category: 'Components',  desc: 'Unknown encoder -> new component suggestion' },
  { id: 7,  name: 'new_material',         category: 'Components',  desc: 'Unknown material -> new component suggestion' },
  { id: 8,  name: 'new_enum_values',      category: 'Enums',       desc: 'New values for open_prefer_known enums' },
  { id: 9,  name: 'similar_enum_values',  category: 'Enums',       desc: 'Near-match values -> fuzzy resolve to canonical' },
  { id: 10, name: 'closed_enum_reject',   category: 'Enums',       desc: 'Invalid values for all closed enum fields' },
  { id: 11, name: 'range_violations',     category: 'Constraints', desc: 'Out-of-range values for constrained fields' },
  { id: 12, name: 'cross_validation',     category: 'Constraints', desc: 'Triggers cross-validation rules' },
  { id: 13, name: 'component_constraints', category: 'Constraints', desc: 'Violate component constraints' },
  { id: 14, name: 'variance_policies',    category: 'Constraints', desc: 'Test variance policies' },
  { id: 15, name: 'min_evidence_refs',    category: 'Edge Cases',  desc: '1 source for fields requiring 2+ evidence refs' },
  { id: 16, name: 'tier_preference_override', category: 'Edge Cases', desc: 'Tier2 preferred over tier1 for latency fields' },
  { id: 17, name: 'preserve_all_candidates', category: 'Edge Cases', desc: 'All values from all sources kept for preserve_all fields' },
  { id: 18, name: 'missing_required',     category: 'Edge Cases',  desc: 'Only 3-4 optional fields -> missing required detection' },
  { id: 19, name: 'multi_source_consensus', category: 'Edge Cases', desc: '4 sources disagree on key fields -> consensus' },
  { id: 20, name: 'list_fields_dedup',    category: 'Edge Cases',  desc: 'All list fields with duplicates -> dedupe + union' },
  { id: 21, name: 'type_violations',     category: 'Validation',  desc: 'Non-numeric strings for number fields -> P3 type coercion repair' },
  { id: 22, name: 'format_violations',   category: 'Validation',  desc: 'Malformed URLs and dates -> P4 format repair' },
  { id: 23, name: 'unit_violations',     category: 'Validation',  desc: 'Wrong unit suffixes -> unit conversion repair' },
  { id: 24, name: 'rounding_precision',  category: 'Validation',  desc: 'Excess decimal places -> deterministic rounding repair' },
];

// â"€â"€ Test Product Generator â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function buildTestProducts(category, contractAnalysis) {
  const defs = contractAnalysis?.scenarioDefs || SCENARIO_DEFS_DEFAULT;
  return defs.map(sc => {
    const slug = `${category}-testco-scenario-${String(sc.id).padStart(2, '0')}`;
    const baseModel = `Scenario ${sc.id}`;
    const variant = sc.name;
    return {
      productId: slug,
      category,
      identityLock: {
        brand: 'TestCo',
        base_model: baseModel,
        model: deriveFullModel(baseModel, variant),
        variant,
        id: 9000 + sc.id,
        identifier: `test${String(sc.id).padStart(3, '0')}a`
      },
      anchors: {},
      _testCase: { id: sc.id, name: sc.name, description: sc.desc, category: sc.category }
    };
  });
}

// â"€â"€ LLM Prompt Builder â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildFieldRulesSummary(fieldRules) {
  const fields = [];
  const rawFields = isObj(fieldRules.fields) ? fieldRules.fields : fieldRules;
  for (const [key, rule] of Object.entries(rawFields)) {
    if (!rule || typeof rule !== 'object') continue;
    const contract = isObj(rule.contract) ? rule.contract : {};
    const parse = isObj(rule.parse) ? rule.parse : {};
    const enumBlock = isObj(rule.enum) ? rule.enum : {};
    const priority = isObj(rule.priority) ? rule.priority : {};
    const entry = {
      field: key,
      type: contract.type || rule.data_type || 'string',
      shape: contract.shape || rule.output_shape || 'scalar',
      unit: contract.unit || parse.unit || '',
      required: priority.required_level || rule.required_level || 'optional',
      parse_template: parse.template || ''
    };
    if (enumBlock.policy) entry.enum_policy = enumBlock.policy;
    if (enumBlock.source) entry.enum_source = enumBlock.source;
    fields.push(entry);
  }
  return fields;
}

function buildComponentSummary(componentDBs) {
  const summary = {};
  for (const [type, db] of Object.entries(componentDBs)) {
    const items = toArr(db.items || db.entities);
    summary[type] = {
      count: items.length,
      sample: items.slice(0, 5).map(item => item.name)
    };
  }
  return summary;
}

function buildKnownValuesSummary(knownValues) {
  const summary = {};
  const kvFields = isObj(knownValues.enums)
    ? Object.fromEntries(Object.entries(knownValues.enums).map(([k, v]) => [k, Array.isArray(v?.values) ? v.values : []]))
    : isObj(knownValues.fields) ? knownValues.fields : knownValues;
  for (const [key, values] of Object.entries(kvFields)) {
    if (!Array.isArray(values)) continue;
    summary[key] = values.slice(0, 10);
  }
  return summary;
}

/**
 * Build the scenario-specific instruction block for the LLM prompt.
 * Uses contractAnalysis to derive all values dynamically (universal category support).
 */
function buildScenarioInstructions(scenario, contractAnalysis) {
  const raw = contractAnalysis?._raw || {};
  const fields = raw.fields || {};
  const fieldKeys = raw.fieldKeys || [];
  const listFields = raw.listFields || [];
  const componentTypes = raw.componentTypes || [];
  const knownValuesCatalogs = raw.knownValuesCatalogs || [];
  const rules = raw.rules || [];

  const scenarioName = scenario.name;

  // â"€â"€ Happy path â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'happy_path') {
    return {
      sourceCount: 3,
      instructions: `Generate realistic, consistent values for ALL ${fieldKeys.length} fields.
Source 1 (tier 1, manufacturer): Return values for EVERY field with high confidence. Use correct types, units, and enum values.
Source 2 (tier 2, review site): Return values for most fields, all consistent with Source 1.
Source 3 (tier 3, retailer): Return values for about half the fields, consistent with others.
IMPORTANT: Every field must have a realistic value. For boolean fields use "yes" or "no". For list fields provide 2-3 comma-separated values. For number fields include units where specified.`
    };
  }

  // â"€â"€ New component (dynamic per type) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName.startsWith('new_')) {
    const typeName = scenarioName.replace('new_', '');
    const ct = componentTypes.find(c => c.type === typeName);
    const unknownIdentity = buildUnknownComponentIdentity(typeName, 1);
    const fabricatedName = unknownIdentity.name;
    const fabricatedBrand = unknownIdentity.maker;
    const propInstructions = (ct?.propKeys || []).map(p => `- ${p} should have a realistic value`).join('\n');
    return {
      sourceCount: 3,
      instructions: `Generate realistic values for all fields, BUT:
- ${typeName} MUST be "${fabricatedName}" (unknown to any database)
- ${typeName}_brand MUST be "${fabricatedBrand}"
${propInstructions}
All other fields should have normal realistic values.
Source 1 (tier 1): Return all fields with the unknown ${typeName}.
Source 2 (tier 2): Return most fields with same ${typeName}.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Similar component (dynamic per type) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName.startsWith('similar_')) {
    const typeName = scenarioName.replace('similar_', '');
    const ct = componentTypes.find(c => c.type === typeName);
    const aliasItem = ct?.aliasItem;
    if (!aliasItem) return { sourceCount: 3, instructions: 'Generate realistic values for all fields.' };
    return {
      sourceCount: 3,
      instructions: `Generate realistic values for all fields, BUT:
- ${typeName} MUST be "${aliasItem.loweredName}" (near-match for known "${aliasItem.name}")
All other fields should have normal realistic values.
Source 1 (tier 1): Return all fields with ${typeName}="${aliasItem.loweredName}".
Source 2 (tier 2): Return most fields with same ${typeName}.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ New enum values â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'new_enum_values') {
    const openPK = knownValuesCatalogs.filter(c => c.policy === 'open_prefer_known' && c.catalog !== 'yes_no');
    const enumInstructions = openPK.slice(0, 5).map(cat =>
      `- ${cat.usingFields[0] || cat.catalog} MUST include "NewTestValue_${cat.catalog}" (not in known ${cat.catalog} values)`
    ).join('\n');
    return {
      sourceCount: 3,
      instructions: `Generate realistic values for all fields, BUT these specific fields MUST have NEW values not in any known list:
${enumInstructions}
All other fields should have normal realistic values from known enums.
Source 1 (tier 1): Return all fields with the new enum values.
Source 2 (tier 2): Return most fields consistent with Source 1.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Similar enum values â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'similar_enum_values') {
    // Find catalogs with parenthetical values we can strip
    const allCats = [...knownValuesCatalogs];
    const similarInstructions = [];
    for (const cat of allCats) {
      const parenVal = cat.values.find(v => v.includes('('));
      if (parenVal) {
        const stripped = parenVal.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
        similarInstructions.push(`- ${cat.usingFields[0] || cat.catalog} MUST be "${stripped}" (near-match for "${parenVal}")`);
      }
      if (similarInstructions.length >= 4) break;
    }
    if (similarInstructions.length === 0) similarInstructions.push('- Use slight variations of known enum values (different casing, missing punctuation)');
    return {
      sourceCount: 3,
      instructions: `Generate realistic values for all fields, BUT:
${similarInstructions.join('\n')}
All other fields should have normal realistic values.
Source 1 (tier 1): Return all fields with the near-match values.
Source 2 (tier 2): Return most fields consistent with Source 1.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Closed enum rejection â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'closed_enum_reject') {
    const closedCats = knownValuesCatalogs.filter(c => c.policy === 'closed');
    const closedInstructions = closedCats.map(cat =>
      `- ${cat.usingFields[0] || cat.catalog} MUST be "invalid_${cat.catalog}_value" (not in: ${cat.values.slice(0, 5).join(', ')})`
    ).join('\n');
    return {
      sourceCount: 2,
      instructions: `Generate realistic values for most fields, BUT these closed-enum fields MUST have INVALID values:
${closedInstructions}
All other fields should have normal realistic values.
Source 1 (tier 1): Return all fields with the invalid enum values.
Source 2 (tier 2): Return same invalid values.`
    };
  }

  // â"€â"€ Range violations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'range_violations') {
    const rangeRules = rules.filter(r => r.check?.type === 'range');
    const rangeInstructions = rangeRules.map(r => {
      const below = (r.check.min || 0) - 1;
      const above = (r.check.max || 1000) * 2;
      return `- ${r.trigger_field} MUST be "${below}" (below min of ${r.check.min}) â€" OR use "${above}" (above max of ${r.check.max})`;
    }).join('\n');
    return {
      sourceCount: 2,
      instructions: `Generate realistic values for most fields, BUT these range-constrained fields MUST have OUT-OF-RANGE values:
${rangeInstructions}
All other fields should have normal realistic values.
Source 1 (tier 1): Return all fields with the out-of-range values.
Source 2 (tier 2): Return same out-of-range values.`
    };
  }

  // â"€â"€ Cross-validation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'cross_validation') {
    const crossInstructions = [];
    for (const r of rules) {
      if (r.rule_id === 'sensor_dpi_consistency') {
        const sensorCt = componentTypes.find(c => c.type === 'sensor');
        const sensorName = sensorCt?.propItem?.name || 'known sensor';
        crossInstructions.push(`- sensor MUST be "${sensorName}" (known sensor)`);
        crossInstructions.push(`- dpi MUST be "999999" (way exceeds sensor capability -> sensor_dpi_consistency violation)`);
      } else if (r.rule_id === 'wireless_battery_required') {
        crossInstructions.push(`- connection MUST be "wireless"`);
        crossInstructions.push(`- battery_hours MUST be absent/omitted (triggers wireless_battery_required)`);
      } else if (r.rule_id === 'dimensions_consistency') {
        const trigger = r.trigger_field || 'lngth';
        const related = toArr(r.related_fields);
        crossInstructions.push(`- ${trigger} MUST be present but ${related.join(' and ')} should be ABSENT (triggers dimensions_consistency)`);
      }
    }
    return {
      sourceCount: 3,
      instructions: `Generate values that trigger cross-validation rules:
${crossInstructions.join('\n')}
All other fields should have normal realistic values.
Source 1 (tier 1): Return fields as specified.
Source 2 (tier 2): Return most fields consistent with Source 1.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Component constraint violations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'component_constraints') {
    const constraintInstructions = [];
    for (const ct of componentTypes) {
      for (const [field, constraintArr] of Object.entries(ct.allConstraints)) {
        for (const constraint of constraintArr) {
          // Parse constraint like "sensor_date <= release_date"
          if (constraint.includes('<=')) {
            const [left, right] = constraint.split('<=').map(s => s.trim());
            constraintInstructions.push(`- Use a known ${ct.type} (e.g., "${ct.propItem?.name || ct.type}")`);
            constraintInstructions.push(`- ${right} MUST be "2010-01-01" (very old date, before ${left} -> violates "${constraint}")`);
          }
        }
      }
    }
    if (constraintInstructions.length === 0) {
      constraintInstructions.push('- Use component values that violate any documented constraints');
    }
    return {
      sourceCount: 3,
      instructions: `Generate values that violate component constraints:
${constraintInstructions.join('\n')}
All other fields should have normal realistic values.
Source 1 (tier 1): Return fields as specified.
Source 2 (tier 2): Consistent with Source 1.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Variance policy testing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'variance_policies') {
    const varianceInstructions = [];
    for (const ct of componentTypes) {
      if (Object.keys(ct.allVariancePolicies).length === 0) continue;
      const itemName = ct.propItem?.name || `known ${ct.type}`;
      varianceInstructions.push(`- ${ct.type} MUST be "${itemName}" (known â€" has property data)`);
      for (const [prop, policy] of Object.entries(ct.allVariancePolicies)) {
        const propVal = ct.propItem?.properties?.[prop];
        if (policy === 'upper_bound' && propVal != null) {
          varianceInstructions.push(`- ${prop} MUST be "${Math.round(propVal * 0.8)}" (below ${ct.type}'s max of ${propVal} -> valid upper_bound)`);
        } else if (policy === 'override_allowed' && propVal != null) {
          varianceInstructions.push(`- ${prop} MUST be "${Math.round(propVal * 1.2)}" (different from ${ct.type}'s ${propVal} -> override_allowed accepts)`);
        } else if (policy === 'authoritative' && propVal != null) {
          varianceInstructions.push(`- ${prop} MUST be "${propVal}" (must match ${ct.type}'s authoritative value)`);
        }
      }
    }
    return {
      sourceCount: 3,
      instructions: `Generate values that test component variance policies:
${varianceInstructions.join('\n')}
All other fields should have normal realistic values.
Source 1 (tier 1): Return fields as specified.
Source 2 (tier 2): Consistent with Source 1.
Source 3 (tier 3): Return a subset.`
    };
  }

  // â"€â"€ Min evidence refs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'min_evidence_refs') {
    const highEvFields = raw.highEvidenceFields || [];
    const fieldNames = highEvFields.map(f => f.key);
    return {
      sourceCount: 1,
      instructions: `Generate values for all fields, BUT provide only 1 source.
The following fields require ${highEvFields[0]?.minRefs || 2}+ evidence references to pass: ${fieldNames.join(', ')}.
With only 1 source, these fields should NOT meet their pass target (below_pass_target).
Source 1 (tier 1, manufacturer): Return realistic values for all fields including ${fieldNames.join(', ')}.
IMPORTANT: Only 1 source total â€" no Source 2 or Source 3.`
    };
  }

  // â"€â"€ Tier preference override â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'tier_preference_override') {
    const tierFields = raw.tierOverrideFields || [];
    const tierInstructions = tierFields.slice(0, 6).map(f => {
      const pref = f.tierPref[0] || 'tier2';
      return `- ${f.key}: Source 1 (tier1)="tier1_value_${f.key}", Source 2 (tier2)="tier2_value_${f.key}" -> ${pref} wins, so tier2_value should be selected`;
    });
    return {
      sourceCount: 2,
      instructions: `Generate values where tier1 and tier2 DISAGREE on specific fields that prefer tier2:
${tierInstructions.join('\n')}
For these ${tierFields.length} fields, the conflict resolution should pick the tier2 value because their tier_preference is [tier2, tier1, tier3].
All other fields should have consistent values across both sources.
Source 1 (tier 1, manufacturer): Return values for all fields.
Source 2 (tier 2, review/benchmark site): Return DIFFERENT values for the tier-preference fields listed above.`
    };
  }

  // â"€â"€ Preserve all candidates conflict policy â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'preserve_all_candidates') {
    const preserveFields = raw.preserveAllFields || [];
    return {
      sourceCount: 3,
      instructions: `Generate values focusing on fields that use "preserve_all_candidates" conflict policy: ${preserveFields.join(', ')}.
For these fields, ALL values from ALL sources should be kept (not resolved to one winner).
- Source 1: Provide ${preserveFields[0] || 'latency'} data with mode="wired" and a realistic ms value
- Source 2: Provide ${preserveFields[0] || 'latency'} data with mode="wireless" and a different ms value
- Source 3: Provide ${preserveFields[0] || 'latency'} data with mode="bluetooth" and another ms value
All three values should appear in the final merged output (not just the tier1 value).
All other fields should have normal consistent values.
Source 1 (tier 1): Return all fields plus latency data for mode="wired".
Source 2 (tier 2): Return most fields plus latency data for mode="wireless".
Source 3 (tier 3): Return a subset plus latency data for mode="bluetooth".`
    };
  }

  // â"€â"€ Missing required fields â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'missing_required') {
    // Find a few optional fields to populate
    const optionalFields = fieldKeys.filter(k => {
      const rule = fields[k];
      if (!isObj(rule)) return false;
      const priority = isObj(rule.priority) ? rule.priority : {};
      const level = priority.required_level || rule.required_level || 'optional';
      return level === 'optional' || level === 'sometimes';
    }).slice(0, 4);

    const optionalInstructions = optionalFields.map(f => `- ${f}: use a realistic value`).join('\n');
    return {
      sourceCount: 2,
      instructions: `Generate values for ONLY these ${optionalFields.length} optional fields. Leave ALL required and critical fields missing.
Only return values for:
${optionalInstructions}
ALL other fields should be completely absent.
Source 1 (tier 1): Return only those ${optionalFields.length} fields.
Source 2 (tier 2): Return only 2-3 of those same fields.`
    };
  }

  // â"€â"€ Multi-source consensus â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'multi_source_consensus') {
    // Pick key fields that have range constraints or are required
    const keyFields = fieldKeys.filter(k => {
      const rule = fields[k];
      if (!isObj(rule)) return false;
      const contract = isObj(rule.contract) ? rule.contract : {};
      return (contract.type === 'number' || contract.type === 'integer') &&
        (rule.required_level === 'required' || rule.priority?.required_level === 'required');
    }).slice(0, 3);

    const consensusFields = keyFields.length > 0 ? keyFields : ['dpi', 'weight', 'height'].filter(f => fieldKeys.includes(f));

    return {
      sourceCount: 4,
      instructions: `Generate values where sources DISAGREE on key fields:
${consensusFields.map((f, i) => `- ${f}: Source 1="${i * 10 + 100}", Source 2="${i * 10 + 200}", Source 3="${i * 10 + 100}", Source 4="${i * 10 + 100}" (${i * 10 + 100} wins by majority)`).join('\n')}
All other fields should have consistent, realistic values across all sources.
Source 1 (tier 1, manufacturer): Most authoritative.
Source 2 (tier 2, review site): Some different values.
Source 3 (tier 3, retailer): Mostly agrees with Source 1.
Source 4 (tier 3, forum): Mixed agreement.`
    };
  }

  // â"€â"€ List fields dedup â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (scenarioName === 'list_fields_dedup') {
    const listFieldNames = listFields.length > 0 ? listFields.join(', ') : 'any list-type fields';
    return {
      sourceCount: 3,
      instructions: `Generate values focusing on LIST fields with intentional DUPLICATES to test dedup.
For these list fields: ${listFieldNames}
- Each source should provide overlapping but slightly different list values
- Include intentional duplicates within each source (repeat values)
- All sources should have some overlapping values for union testing
All scalar fields should have normal realistic values.
Source 1 (tier 1): Return list fields with duplicates.
Source 2 (tier 2): Return overlapping list values.
Source 3 (tier 3): Return a subset of list values.`
    };
  }

  // Fallback
  return { sourceCount: 3, instructions: 'Generate realistic values for all fields.' };
}

// â"€â"€ Deterministic Test Data Generation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * Build deterministic seed component DBs with 6-11 items per type.
 * Returns Record<dbFile, dbObject> â€" one entry per component type.
 */
export function buildSeedComponentDB(contractAnalysis, testCategory = '_test', options = {}) {
  const raw = contractAnalysis?._raw || {};
  const componentTypes = raw.componentTypes || [];
  const fieldKeys = raw.fieldKeys || Object.keys(raw.fields || {});
  const identityPoolsByType = isObj(options?.identityPoolsByType) ? options.identityPoolsByType : {};
  const strictIdentityPools = options?.strictIdentityPools !== false;
  const result = {};

  if (strictIdentityPools && componentTypes.length > 0 && Object.keys(identityPoolsByType).length === 0) {
    throw new Error('seed component DB failed: identity pools are required but none were provided');
  }

  for (const ct of componentTypes) {
    const typeName = ct.type;
    const typeCapital = capitalize(typeName);
    const propKeys = ct.propKeys || [];
    const varianceDetails = ct.varianceDetails || [];
    const allConstraints = ct.allConstraints || {};
    const allVariancePolicies = ct.allVariancePolicies || {};
    const identityPool = getIdentityPool(identityPoolsByType, typeName);
    const supportsMaker = componentTypeSupportsMakerField(raw, typeName, fieldKeys);

    const poolNames = uniqueCaseInsensitive(identityPool.names);
    const poolBrands = uniqueCaseInsensitive(identityPool.brands);

    const totalItemTarget = 6 + (stableTextHash(typeName) % 6);
    const rawNdCount = 1 + (stableTextHash(typeName + '_nd') % 3);
    const maxDiscovered = 7;
    const nonDiscoveredCount = Math.max(rawNdCount, totalItemTarget - maxDiscovered);
    const discoveredCount = Math.max(3, totalItemTarget - nonDiscoveredCount);
    const actualTotal = discoveredCount + nonDiscoveredCount;
    const extraNameStart = supportsMaker ? 1 : 3;
    const requiredPoolNames = extraNameStart + (actualTotal - 3);

    if (strictIdentityPools) {
      if (poolNames.length === 0) {
        throw new Error(`seed component DB failed: missing pool names for component type '${typeName}'`);
      }
      if (supportsMaker && poolBrands.length < 2) {
        throw new Error(`seed component DB failed: component type '${typeName}' requires at least 2 maker values`);
      }
      if (poolNames.length < requiredPoolNames) {
        throw new Error(`seed component DB failed: component type '${typeName}' requires at least ${requiredPoolNames} names, got ${poolNames.length}`);
      }
    }

    const fallbackNamePrefix = `${typeCapital} Seed`;
    const laneNameA = supportsMaker
      ? (poolNames[0] || `${fallbackNamePrefix} Alpha`)
      : (poolNames[0] || `${fallbackNamePrefix} Alpha`);
    const laneNameB = supportsMaker
      ? laneNameA
      : (poolNames[1] || `${fallbackNamePrefix} Beta`);
    const laneNameNoMaker = supportsMaker
      ? laneNameA
      : (poolNames[2] || `${fallbackNamePrefix} Gamma`);
    const aliasBaseName = laneNameA;

    const makerA = supportsMaker ? (poolBrands[0] || '') : '';
    let makerB = supportsMaker
      ? (poolBrands.find((maker) => normLower(maker) !== normLower(makerA)) || '')
      : '';
    if (supportsMaker && !makerB && strictIdentityPools) {
      throw new Error(`seed component DB failed: component type '${typeName}' needs two distinct makers`);
    }
    makerB = makerB || makerA;

    function propValue(propKey, strategy) {
      const vd = varianceDetails.find(v => v.key === propKey);
      const propType = vd?.type || 'string';

      if (propType === 'number' || propType === 'integer') {
        const defaults = { dpi: 26000, ips: 650, acceleration: 50, weight: 85, click_force: 55, polling_rate: 1000, encoder_steps: 24, releasing_force: 45 };
        const mid = defaults[propKey] || 100;
        if (strategy === 'upper') return Math.round(mid * 1.5);
        if (strategy === 'lower') return Math.round(mid * 0.5);
        return mid;
      }
      // Check if the propKey has constraints containing date comparisons
      const hasDateConstraint = Object.values(allConstraints).flat().some(c =>
        c.includes(propKey) && (c.includes('<=') || c.includes('>='))
      );
      if (hasDateConstraint || propKey.includes('date')) return '2024-01-15';

      const stringDefaults = { sensor_type: 'optical', switch_type: 'mechanical', material_type: 'plastic', flawless_sensor: 'yes', encoder_type: 'optical', encoder_life_span: '1000000', switch_life_span: '70' };
      return stringDefaults[propKey] || `test_${propKey}`;
    }

    const items = [];

    // Item 1: Alpha â€" Standard, all props at midpoint, with aliases
    const alphaProps = {};
    for (const pk of propKeys) alphaProps[pk] = propValue(pk, 'mid');
    items.push({
      name: laneNameA,
      aliases: [`${aliasBaseName} A`, `${typeCapital} Alpha Prime`],
      maker: makerA,
      properties: alphaProps,
      __variance_policies: { ...allVariancePolicies },
      __constraints: {},
      __nonDiscovered: false,
      __discovery_source: 'pipeline',
    });

    // Item 2: Beta â€" Upper-bound values, with aliases
    const betaProps = {};
    for (const pk of propKeys) betaProps[pk] = propValue(pk, 'upper');
    const betaVariance = {};
    for (const pk of propKeys) {
      const vd = varianceDetails.find(v => v.key === pk);
      if (vd && (vd.type === 'number' || vd.type === 'integer')) betaVariance[pk] = 'upper_bound';
      else betaVariance[pk] = allVariancePolicies[pk] || 'authoritative';
    }
    items.push({
      name: laneNameB,
      aliases: [`${aliasBaseName} B`, `${typeCapital} Beta Prime`],
      maker: makerB,
      properties: betaProps,
      __variance_policies: betaVariance,
      __constraints: {},
      __nonDiscovered: false,
      __discovery_source: 'pipeline',
    });

    // Item 3: Gamma â€" Lower-bound values, with constraints
    const gammaProps = {};
    for (const pk of propKeys) gammaProps[pk] = propValue(pk, 'lower');
    const gammaVariance = {};
    for (const pk of propKeys) {
      const vd = varianceDetails.find(v => v.key === pk);
      if (vd && (vd.type === 'number' || vd.type === 'integer')) gammaVariance[pk] = 'lower_bound';
      else gammaVariance[pk] = allVariancePolicies[pk] || 'authoritative';
    }
    items.push({
      name: laneNameNoMaker,
      aliases: [],
      maker: '',
      properties: gammaProps,
      __variance_policies: gammaVariance,
      __constraints: { ...allConstraints },
      __nonDiscovered: false,
      __discovery_source: 'pipeline',
    });

    const extraItemCount = actualTotal - 3;
    const discoveredExtraCount = extraItemCount - nonDiscoveredCount;
    const strategies = ['mid', 'upper', 'lower'];

    for (let i = 0; i < extraItemCount; i += 1) {
      const poolIdx = extraNameStart + i;
      const extraName = poolNames[poolIdx];
      if (!extraName) break;
      const extraMaker = supportsMaker
        ? (poolBrands[(2 + i) % poolBrands.length] || '')
        : '';
      const strategy = strategies[i % strategies.length];
      const extraProps = {};
      for (const pk of propKeys) extraProps[pk] = propValue(pk, strategy);
      const isNonDiscovered = i >= discoveredExtraCount;
      items.push({
        name: extraName,
        aliases: [],
        maker: extraMaker,
        properties: extraProps,
        __variance_policies: { ...allVariancePolicies },
        __constraints: {},
        __nonDiscovered: isNonDiscovered,
        __discovery_source: isNonDiscovered ? 'component_db' : 'pipeline',
      });
    }

    result[ct.dbFile] = {
      category: testCategory,
      component_type: typeName,
      generated_at: new Date().toISOString(),
      items
    };
  }

  return result;
}


function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp01(value, fallback) {
  const num = toFiniteNumber(value, fallback);
  return Math.max(0, Math.min(1, num));
}

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(String(value ?? ''), 10);
  const safe = Number.isFinite(num) ? num : fallback;
  return Math.max(min, Math.min(max, safe));
}

function normalizeGenerationOptions(raw = {}) {
  const sourceCountOverride = clampInt(raw?.sourcesPerScenario ?? raw?.sourceCount, 0, 5, 0);
  const sharedRatioRaw = raw?.sharedFieldRatioPercent ?? raw?.sharedFieldRatio;
  const duplicateRatioRaw = raw?.sameValueDuplicatePercent ?? raw?.sameValueDuplicateRate;
  const sharedFieldRatio = clamp01(
    toFiniteNumber(sharedRatioRaw, 40) > 1 ? toFiniteNumber(sharedRatioRaw, 40) / 100 : sharedRatioRaw,
    0.4,
  );
  const sameValueDuplicateRate = clamp01(
    toFiniteNumber(duplicateRatioRaw, 30) > 1 ? toFiniteNumber(duplicateRatioRaw, 30) / 100 : duplicateRatioRaw,
    0.3,
  );
  return {
    sourceCountOverride,
    sharedFieldRatio,
    sameValueDuplicateRate,
  };
}

function resolveScenarioGenerationPolicy(scenarioName = '') {
  const name = String(scenarioName || '').trim().toLowerCase();
  if (!name) {
    return { allowSourceCountOverride: true, allowValueMutation: true };
  }
  if (name === 'happy_path') {
    return { allowSourceCountOverride: true, allowValueMutation: true };
  }
  // Non-happy scenarios are deterministic edge-case contracts.
  // Keep generation knobs from mutating their core behavior.
  return { allowSourceCountOverride: false, allowValueMutation: false };
}

function stableUnitHash(input) {
  const text = String(input ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function perturbValueForSource(value, sourceIndex) {
  const text = String(value ?? '').trim();
  if (!text) return text;
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return String(Math.round((n + (sourceIndex + 1) * 0.5) * 100) / 100);
  }
  if (/^(yes|no)$/i.test(text)) {
    return /^yes$/i.test(text) ? 'no' : 'yes';
  }
  if (text.includes(',')) {
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const shift = sourceIndex % parts.length;
      return [...parts.slice(shift), ...parts.slice(0, shift)].join(', ');
    }
  }
  return `${text} v${sourceIndex + 1}`;
}

function withSourceHost(source, host) {
  const nextHost = String(host || source?.host || '').trim();
  if (!nextHost) return source;
  // Keep synthetic sources domain-distinct in consensus by preserving full host identity.
  // Collapsing to eTLD+1 (e.g. example.com) makes all sources look like one domain.
  const next = { ...source, host: nextHost, rootDomain: nextHost };
  try {
    const url = new URL(String(source?.url || `https://${nextHost}`));
    url.hostname = nextHost;
    next.url = url.toString();
    next.finalUrl = url.toString();
  } catch {
    next.url = `https://${nextHost}`;
    next.finalUrl = `https://${nextHost}`;
  }
  return next;
}

function applyGenerationOptionsToSources({
  sourceResults = [],
  options = {},
  productId = '',
  scenarioName = '',
}) {
  const normalized = normalizeGenerationOptions(options);
  const scenarioPolicy = resolveScenarioGenerationPolicy(scenarioName);
  if (!Array.isArray(sourceResults) || sourceResults.length === 0) return sourceResults;

  const cloneSource = (source) => ({
    ...source,
    fieldCandidates: (source?.fieldCandidates || []).map((candidate) => ({ ...candidate })),
  });
  let sources = sourceResults.map(cloneSource);

  if (normalized.sourceCountOverride > 0 && scenarioPolicy.allowSourceCountOverride) {
    const target = normalized.sourceCountOverride;
    if (sources.length > target) {
      sources = sources.slice(0, target);
    } else if (sources.length < target) {
      const original = [...sources];
      for (let i = sources.length; i < target; i += 1) {
        const template = cloneSource(original[i % original.length] || original[0]);
        sources.push(withSourceHost(template, `test-extra-${i + 1}.example.com`));
      }
    }
  }

  const itemToken = slugify(productId) || 'item';
  sources = sources.map((source, index) => {
    const baseHost = String(source?.host || `test-source-${index + 1}.example.com`).trim().toLowerCase();
    const hostPrefix = baseHost.split('.')[0] || `test-source-${index + 1}`;
    return withSourceHost(source, `${hostPrefix}-${itemToken}.example.com`);
  });

  if (sources.length <= 1 || !scenarioPolicy.allowValueMutation) return sources;

  const primaryMap = new Map();
  for (const candidate of (sources[0]?.fieldCandidates || [])) {
    const fieldKey = String(candidate?.field || '').trim();
    if (!fieldKey) continue;
    primaryMap.set(fieldKey, String(candidate?.value ?? ''));
  }
  if (primaryMap.size === 0) return sources;

  for (let sourceIndex = 1; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    source.fieldCandidates = (source.fieldCandidates || []).map((candidate) => {
      const fieldKey = String(candidate?.field || '').trim();
      const primaryValue = primaryMap.get(fieldKey);
      if (!fieldKey || primaryValue == null) return candidate;
      const shareRoll = stableUnitHash(`${scenarioName}|${productId}|${sourceIndex}|${fieldKey}|share`);
      const duplicateRoll = stableUnitHash(`${scenarioName}|${productId}|${sourceIndex}|${fieldKey}|dup`);
      const shouldShare = shareRoll <= normalized.sharedFieldRatio || duplicateRoll <= normalized.sameValueDuplicateRate;
      const nextValue = shouldShare
        ? primaryValue
        : perturbValueForSource(primaryValue, sourceIndex);
      const quote = `${fieldKey}: ${nextValue}`;
      return {
        ...candidate,
        value: nextValue,
        quote,
      };
    });
  }

  return sources;
}

// â"€â"€ Source Result Schema â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const sourceResponseZodSchema = z.object({
  sources: z.array(z.object({
    host: z.string(),
    tier: z.number().int(),
    role: z.string().optional(),
    fieldCandidates: z.array(z.object({
      field: z.string(),
      value: z.string(),
      confidence: z.number().optional(),
    })),
  })),
});

function sourceResponseJsonSchema() {
  return zodToLlmSchema(sourceResponseZodSchema);
}
const sourceResponseSchema = sourceResponseJsonSchema();

// â"€â"€ Core Generator â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/**
 * Generate synthetic sourceResults[] for a test product using contract analysis.
 */
export async function generateTestSourceResults({
  product,
  fieldRules,
  componentDBs = {},
  knownValues = {},
  config = {},
  contractAnalysis = null,
  generationOptions = {},
}) {
  const testCase = product._testCase;
  if (!testCase) throw new Error('Product missing _testCase metadata');

  const defs = contractAnalysis?.scenarioDefs || SCENARIO_DEFS_DEFAULT;
  const scenario = defs.find(s => s.id === testCase.id);
  if (!scenario) throw new Error(`Unknown test case id: ${testCase.id}`);

  const { sourceCount, instructions } = buildScenarioInstructions(scenario, contractAnalysis);

  const brand = product.identityLock?.brand || 'TestCo';
  const model = product.identityLock?.model || 'Unknown';
  const fieldSummary = buildFieldRulesSummary(fieldRules);
  const componentSummary = buildComponentSummary(componentDBs);
  const knownValuesSummary = buildKnownValuesSummary(knownValues);

  const prompt = `You are generating fake but realistic spec data for a product called "${brand} ${model}" (test scenario: ${scenario.name}).

Based on these field rules (field name, type, shape, unit, required level, parse template):
${JSON.stringify(fieldSummary, null, 2)}

Known component names (for reference â€" these exist in the database):
${JSON.stringify(componentSummary, null, 2)}

Known enum values (for reference â€" these are accepted values):
${JSON.stringify(knownValuesSummary, null, 2)}

Generate ${sourceCount} fake source results, each representing data from a different website.

${instructions}

IMPORTANT:
- Use the exact field names from the field rules above.
- Values should be realistic (unless the test case instructions say otherwise).
- Each source should have a unique fake host like "test-source-1.example.com".
- Tier 1 = manufacturer, Tier 2 = review site, Tier 3 = retailer/forum.
- For list/array fields, provide comma-separated values as a single string.
- Return a JSON object with a "sources" array.`;

  const result = await callLlmWithRouting({
    config,
    reason: 'test_data_generation',
    role: 'extract',
    system: 'You generate synthetic test data for a hardware spec pipeline. Return valid JSON only.',
    user: prompt,
    jsonSchema: sourceResponseSchema,
    usageContext: {
      category: product.category || '_test',
      productId: product.productId || '',
      reason: 'test_data_generation'
    },
    costRates: config,
    onUsage: () => {},
    timeoutMs: config.llmTimeoutMs || 60000
  });

  // Convert LLM response into sourceResults[] format
  const sourceResults = (result?.sources || []).map((src, idx) => {
    const host = src.host || `test-source-${idx + 1}.example.com`;
    const tier = src.tier || (idx === 0 ? 1 : idx === 1 ? 2 : 3);
    const tierNames = { 1: 'manufacturer', 2: 'review', 3: 'retailer' };
    const baseModel = String(product.identityLock?.base_model || model || '').trim();

    return {
      url: `https://${host}/products/${encodeURIComponent(model.toLowerCase().replace(/\s+/g, '-'))}`,
      finalUrl: `https://${host}/products/${encodeURIComponent(model.toLowerCase().replace(/\s+/g, '-'))}`,
      host,
      rootDomain: host,
      tier,
      tierName: src.role || tierNames[tier] || 'retailer',
      role: src.role || tierNames[tier] || 'retailer',
      ts: new Date().toISOString(),
      status: 200,
      identity: { match: true, score: 1.0 },
      identityCandidates: {
        brand,
        base_model: baseModel,
        model: baseModel || model,
        variant: product.identityLock?.variant || ''
      },
      fieldCandidates: (src.fieldCandidates || []).map((cand, ci) => ({
        field: cand.field,
        value: String(cand.value ?? ''),
        method: 'test_inject',
        keyPath: `specs.${cand.field}`,
        evidenceRefs: [`test_evidence_${idx + 1}_${ci + 1}`],
        snippetId: `test_snippet_${idx + 1}_${ci + 1}`,
        snippetHash: '',
        quote: `${cand.field}: ${cand.value}`,
        quoteSpan: null,
        llm_extract_model: 'test_inject',
        llm_extract_provider: 'test'
      })),
      anchorCheck: { conflicts: [], majorConflicts: [] },
      anchorStatus: 'pass',
      approvedDomain: tier === 1,
      llmEvidencePack: null,
      fingerprint: null,
      parserHealth: { health_score: 1.0 }
    };
  });

  return applyGenerationOptionsToSources({
    sourceResults,
    options: generationOptions,
    productId: product.productId || '',
    scenarioName: scenario.name,
  });
}
