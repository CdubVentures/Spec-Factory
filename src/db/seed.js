/**
 * Seed logic for SpecDb — populates all tables from existing JSON artifacts + field rules.
 *
 * Usage:
 *   const result = await seedSpecDb({ db, config, category, fieldRules, logger });
 *
 * Seed order respects FK dependencies:
 *   1. component_identity + component_aliases + component_values
 *   2. list_values
 *   3-6. Per-product: item_field_state, item_component_links, item_list_links
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildComponentIdentifier } from '../utils/componentIdentifier.js';
import {
  isKnownSlotValue,
  normalizeSlotValueForShape,
  slotValueToText,
} from '../utils/slotValueShape.js';
import { projectFieldRulesForConsumer } from '../field-rules/consumerGate.js';
import { buildCategorySurfaces } from './seedRegistry.js';
import { runCategorySeed } from './seedEngine.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

import { isObject, toArray, normalizeToken } from '../shared/primitives.js';

function isKnownToken(v) {
  const token = normalizeToken(v);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

function extractComponentTypeFromRule(rule) {
  if (!isObject(rule)) return null;
  const directType = String(rule?.component?.type || rule?.component_type || '').trim();
  if (directType) return directType;
  const enumSource = String(rule?.enum?.source || rule?.enum_source || '').trim();
  if (enumSource.toLowerCase().startsWith('component_db.')) {
    const suffix = enumSource.slice('component_db.'.length);
    const parsed = String(suffix.split('.')[0] || '').trim();
    if (parsed) return parsed;
  }
  return null;
}

function resolveComponentMakerHint(fields, fieldKey, componentType) {
  const scopeType = String(componentType || '').trim();
  const scopeField = String(fieldKey || '').trim();
  const hintKeys = [
    `${scopeType}_brand`,
    `${scopeType}_maker`,
    `${scopeField}_brand`,
    `${scopeField}_maker`,
    'brand',
    'maker',
  ].filter(Boolean);
  for (const hintKey of hintKeys) {
    const raw = fields?.[hintKey];
    const hint = String(raw ?? '').trim();
    if (!isKnownToken(hint)) continue;
    return hint;
  }
  return '';
}

function dedupeComponentEntries(entries = []) {
  const unique = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const key = `${normalizeToken(entry.canonical_name)}::${normalizeToken(entry.maker)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function resolveComponentEntryByNameAndMaker(compDb, rawValueText, makerHint = '') {
  const token = normalizeToken(rawValueText);
  if (!token) return { entry: null, ambiguous: false };
  const compactToken = token.replace(/\s+/g, '');
  const allMatches = dedupeComponentEntries([
    ...(toArray(compDb?.__indexAll?.get(token))),
    ...(toArray(compDb?.__indexAll?.get(compactToken))),
  ]);
  if (allMatches.length === 0) {
    const fallback = compDb?.__index?.get(token) || compDb?.__index?.get(compactToken) || null;
    return { entry: fallback, ambiguous: false };
  }
  if (allMatches.length === 1) {
    return { entry: allMatches[0], ambiguous: false };
  }
  const makerToken = normalizeToken(makerHint);
  if (!makerToken) return { entry: null, ambiguous: true };
  const makerMatches = allMatches.filter((entry) => normalizeToken(entry?.maker) === makerToken);
  if (makerMatches.length === 1) return { entry: makerMatches[0], ambiguous: false };
  if (makerMatches.length > 1) return { entry: null, ambiguous: true };
  return { entry: null, ambiguous: true };
}

function expandListLinkValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  }
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const split = raw
    .split(/[,;|/]+/)
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const ordered = split.length > 1 ? split : [raw];
  const seen = new Set();
  const out = [];
  for (const token of ordered) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function collectAuthoritativeComponentIdentities(fieldRules) {
  const componentDBs = fieldRules?.componentDBs || {};
  const expected = new Map();
  for (const [typeKey, compDb] of Object.entries(componentDBs)) {
    const componentType = String(typeKey || '').trim();
    if (!componentType) continue;
    const entries = isObject(compDb?.entries) ? compDb.entries : {};
    const keep = new Set();
    for (const entry of Object.values(entries)) {
      if (!isObject(entry)) continue;
      const canonicalName = String(entry.canonical_name || entry.name || '').trim();
      if (!canonicalName) continue;
      const maker = String(entry.maker || '').trim();
      keep.add(`${canonicalName}::${maker}`);
    }
    expected.set(componentType, keep);
  }
  return expected;
}

function deleteComponentValuesById(db, componentValueId) {
  if (!componentValueId) return 0;
  return db.db.prepare('DELETE FROM component_values WHERE id = ?').run(componentValueId).changes || 0;
}

function reconcileComponentDbRows(db, fieldRules) {
  const expected = collectAuthoritativeComponentIdentities(fieldRules);
  const existing = db.db
    .prepare('SELECT id, component_type, canonical_name, maker FROM component_identity WHERE category = ?')
    .all(db.category);
  if (!existing.length) {
    return {
      removed_identity_rows: 0,
      removed_value_rows: 0,
      removed_alias_rows: 0,
      removed_key_review_rows: 0,
    };
  }

  const staleIdentities = existing.filter((row) => {
    const typeKey = String(row?.component_type || '').trim();
    const byType = expected.get(typeKey) || new Set();
    const maker = String(row?.maker || '').trim();
    const canonicalName = String(row?.canonical_name || '').trim();
    return !byType.has(`${canonicalName}::${maker}`);
  });
  if (!staleIdentities.length) {
    return {
      removed_identity_rows: 0,
      removed_value_rows: 0,
      removed_alias_rows: 0,
      removed_key_review_rows: 0,
    };
  }

  const selectComponentValues = db.db.prepare(
    'SELECT id FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?'
  );
  const deleteComponentAliasRows = db.db.prepare('DELETE FROM component_aliases WHERE component_id = ?');
  const deleteComponentValue = db.db.prepare(
    'DELETE FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?'
  );
  const deleteComponentValueReviewRows = db.db.prepare('DELETE FROM key_review_state WHERE component_value_id = ?');
  const deleteComponentIdentityReviewRows = db.db.prepare(
    'DELETE FROM key_review_state WHERE category = ? AND target_kind = ? AND component_identity_id = ?'
  );
  const deleteItemComponentLinks = db.db.prepare(
    'DELETE FROM item_component_links WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?'
  );
  const deleteComponentIdentity = db.db.prepare('DELETE FROM component_identity WHERE id = ? AND category = ?');

  let removedIdentityRows = 0;
  let removedValueRows = 0;
  let removedAliasRows = 0;
  let removedKeyReviewRows = 0;
  let removedItemComponentLinks = 0;

  const tx = db.db.transaction((rows) => {
    for (const row of rows) {
      const componentType = String(row.component_type || '').trim();
      const canonicalName = String(row.canonical_name || '').trim();
      const maker = String(row.maker || '').trim();
      const componentId = Number(row.id);

      const valueRows = selectComponentValues.all(db.category, componentType, canonicalName, maker);
      for (const valueRow of valueRows) {
        const valueId = valueRow.id;
        removedKeyReviewRows += deleteComponentValueReviewRows.run(valueId).changes || 0;
        removedValueRows += deleteComponentValuesById(db, valueId);
      }

      removedAliasRows += deleteComponentAliasRows.run(componentId).changes || 0;
      removedItemComponentLinks += deleteItemComponentLinks.run(db.category, componentType, canonicalName, maker).changes || 0;
      removedKeyReviewRows += deleteComponentIdentityReviewRows.run(
        db.category,
        'component_key',
        componentId
      ).changes || 0;
      removedValueRows += deleteComponentValue.run(db.category, componentType, canonicalName, maker).changes || 0;
      deleteComponentIdentity.run(componentId, db.category);
      removedIdentityRows += 1;
    }
  });
  tx(staleIdentities);

  return {
    removed_identity_rows: removedIdentityRows,
    removed_value_rows: removedValueRows,
    removed_alias_rows: removedAliasRows,
    removed_item_component_link_rows: removedItemComponentLinks,
    removed_key_review_rows: removedKeyReviewRows,
  };
}

// WHY: Reconcile component override rows so that removed override files or removed
// properties within surviving files result in stale SQL rows being pruned. Missing
// override directory = empty authoritative set (not a no-op).
async function reconcileComponentOverrideRows(db, config, category) {
  const helperRoot = config.categoryAuthorityRoot || 'category_authority';
  const overrideDir = path.join(helperRoot, category, '_overrides', 'components');
  let removedOverrideValueRows = 0;
  let removedAliasRows = 0;
  let resetReviewStatusRows = 0;

  // Build expected set from override files on disk
  // key = "type|name|maker", value = Set<propertyKey>
  const expectedOverrides = new Map();
  let files = [];
  try {
    const entries = await fs.readdir(overrideDir, { withFileTypes: true });
    files = entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Missing directory = empty authoritative set — all overrides are stale
  }

  for (const fileName of files) {
    let ovr;
    try {
      const raw = await fs.readFile(path.join(overrideDir, fileName), 'utf8');
      ovr = JSON.parse(raw);
    } catch { continue; }
    if (!ovr || !ovr.name) continue;
    const componentType = ovr.componentType || fileName.split('_')[0];
    const maker = ovr.identity?.maker ?? '';
    const key = `${componentType}|${ovr.name}|${maker}`;
    const propKeys = new Set(Object.keys(ovr.properties || {}));
    expectedOverrides.set(key, propKeys);
  }

  // Query existing override-backed rows
  const existingOverrides = db.db.prepare(
    'SELECT id, component_type, component_name, component_maker, property_key FROM component_values WHERE category = ? AND overridden = 1'
  ).all(db.category);

  if (!existingOverrides.length) {
    return { removed_override_value_rows: 0, removed_alias_rows: 0, reset_review_status_rows: 0 };
  }

  // Find stale component tuples (components no longer in any override file)
  const staleComponents = new Set();
  const deleteOverrideValue = db.db.prepare('DELETE FROM component_values WHERE id = ?');

  const tx = db.db.transaction(() => {
    for (const row of existingOverrides) {
      const key = `${row.component_type}|${row.component_name}|${row.component_maker}`;
      const expectedProps = expectedOverrides.get(key);
      if (!expectedProps || !expectedProps.has(row.property_key)) {
        deleteOverrideValue.run(row.id);
        removedOverrideValueRows++;
        if (!expectedProps) staleComponents.add(key);
      }
    }

    // For fully stale components: reset review_status, aliases_overridden, user aliases
    for (const key of staleComponents) {
      const [componentType, componentName, maker] = key.split('|');

      // Reset review_status
      const reviewResult = db.db.prepare(
        'UPDATE component_identity SET review_status = NULL WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ? AND review_status IS NOT NULL'
      ).run(db.category, componentType, componentName, maker);
      resetReviewStatusRows += reviewResult.changes || 0;

      // Reset aliases_overridden + delete user aliases
      db.db.prepare(
        'UPDATE component_identity SET aliases_overridden = 0 WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
      ).run(db.category, componentType, componentName, maker);

      const idRow = db.db.prepare(
        'SELECT id FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
      ).get(db.category, componentType, componentName, maker);
      if (idRow) {
        const aliasResult = db.db.prepare("DELETE FROM component_aliases WHERE component_id = ? AND source = 'user'").run(idRow.id);
        removedAliasRows += aliasResult.changes || 0;
      }
    }
  });
  tx();

  return { removed_override_value_rows: removedOverrideValueRows, removed_alias_rows: removedAliasRows, reset_review_status_rows: resetReviewStatusRows };
}

async function collectListSeedRows(fieldRules, config, category) {
  const rows = [];

  // From knownValues.enums
  const enums = fieldRules.knownValues?.enums;
  if (isObject(enums)) {
    for (const [fieldKey, enumDef] of Object.entries(enums)) {
      const policy = enumDef.policy || 'open';
      const values = Array.isArray(enumDef.values) ? enumDef.values : [];
      for (const value of values) {
        const rawEnumValue = isObject(value)
          ? (value.canonical ?? value.value ?? '')
          : value;
        const trimmed = String(rawEnumValue || '').trim();
        if (!trimmed) continue;
        rows.push({
          fieldKey,
          value: trimmed,
          normalizedValue: normalizeToken(trimmed),
          source: 'known_values',
          enumPolicy: policy
        });
      }
    }
  }

  // From control plane data_lists manual values
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const controlPlaneRoot = path.join(helperRoot, category, '_control_plane');
  const fieldStudioMapPath = path.join(controlPlaneRoot, 'field_studio_map.json');
  const fieldStudioMap = await readJsonIfExists(fieldStudioMapPath);
  const seedDataLists = Array.isArray(fieldStudioMap?.data_lists) ? fieldStudioMap.data_lists
    : Array.isArray(fieldStudioMap?.enum_lists) ? fieldStudioMap.enum_lists : [];
  for (const dl of seedDataLists) {
    const fieldKey = String(dl.field || '').trim();
    if (!fieldKey) continue;
    const values = Array.isArray(dl.manual_values) ? dl.manual_values
      : Array.isArray(dl.values) ? dl.values : [];
    for (const value of values) {
      const trimmed = String(value || '').trim();
      if (!trimmed) continue;
      rows.push({
        fieldKey,
        value: trimmed,
        normalizedValue: normalizeToken(trimmed),
        source: 'manual',
        enumPolicy: null,
        sourceTimestamp: null,
      });
    }
  }

  // WHY: Test harnesses write _suggestions/enums.json before seedSpecDb runs.
  // This reads pending suggestions into list_values so reconciliation is aware of them.
  // In production the file won't exist (directory deleted), so this is a no-op.
  const suggestPath = path.join(helperRoot, category, '_suggestions', 'enums.json');
  const suggestDoc = await readJsonIfExists(suggestPath);
  if (Array.isArray(suggestDoc?.suggestions)) {
    for (const s of suggestDoc.suggestions) {
      const fk = String(s?.field_key || '').trim();
      const val = String(s?.value || '').trim();
      if (!fk || !val) continue;
      if (s.status && s.status !== 'pending') continue;
      rows.push({
        fieldKey: fk,
        value: val,
        normalizedValue: normalizeToken(val),
        source: 'pipeline',
        enumPolicy: null,
        needsReview: true,
        sourceTimestamp: s.first_seen_at || s.created_at || null
      });
    }
  }

  // WHY: Read discovered enum values (pipeline-accumulated, durable JSON record).
  // Satisfies rebuild contract: delete .sqlite → seed → list_values reconstructed from JSON.
  const discoveredPath = path.join(config.localOutputRoot || path.resolve('.workspace', 'output'), category, 'discovered_enums.json');
  const discoveredDoc = await readJsonIfExists(discoveredPath);
  if (isObject(discoveredDoc?.values)) {
    for (const [fieldKey, entries] of Object.entries(discoveredDoc.values)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const val = String(entry?.value || '').trim();
        if (!val) continue;
        rows.push({
          fieldKey,
          value: val,
          normalizedValue: normalizeToken(val),
          source: 'pipeline',
          enumPolicy: null,
          needsReview: true,
          sourceTimestamp: entry.first_seen_at || null
        });
      }
    }
  }

  return rows;
}

async function reconcileListSeedRows(db, fieldRules, config, category) {
  const pruneSources = new Set(['known_values', 'manual', 'pipeline']);
  const candidateRows = await collectListSeedRows(fieldRules, config, category);
  const expected = new Set(candidateRows.map((row) => `${row.fieldKey}::${row.normalizedValue}::${row.source}`));
  const stale = db.db
    .prepare('SELECT field_key, value, source FROM list_values WHERE category = ?')
    .all(db.category)
    .filter((row) => {
      if (!pruneSources.has(String(row?.source || '').trim())) return false;
      const normalizedValue = normalizeToken(row?.value);
      return !expected.has(`${row.field_key}::${normalizedValue}::${String(row.source || '').trim()}`);
    });

  if (!stale.length) return { removed_list_value_rows: 0 };

  const tx = db.db.transaction((rows) => {
    for (const row of rows) {
      db.deleteListValue(row.field_key, row.value);
    }
  });
  tx(stale);
  return { removed_list_value_rows: stale.length };
}

// ── Field metadata lookup ────────────────────────────────────────────────────

function buildFieldMeta(fieldRules) {
  const meta = {};
  const fields = isObject(fieldRules?.rules?.fields)
    ? fieldRules.rules.fields
    : (isObject(fieldRules?.fields) ? fieldRules.fields : null);
  if (!isObject(fields)) return meta;

  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (!isObject(rule)) continue;
    const componentType = extractComponentTypeFromRule(rule);
    const shape = String(rule.output_shape || rule.contract?.shape || 'scalar').trim().toLowerCase() || 'scalar';
    const isList = shape === 'list';
    const isEnum = isObject(rule.enum);
    const isComponentField = Boolean(componentType);
    meta[fieldKey] = {
      is_component_field: isComponentField,
      component_type: isComponentField ? componentType : null,
      is_list_field: isList,
      is_enum_field: isEnum,
      shape,
      enum_policy: rule.enum?.policy ?? null
    };
  }
  return meta;
}

// ── Step 1a: Component override seeding ──────────────────────────────────────

async function seedComponentOverrides(db, config, category) {
  const helperRoot = config.categoryAuthorityRoot || 'category_authority';
  const overrideDir = path.join(helperRoot, category, '_overrides', 'components');
  let overrideCount = 0;

  let files;
  try {
    const entries = await fs.readdir(overrideDir, { withFileTypes: true });
    files = entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);
  } catch (error) {
    if (error.code === 'ENOENT') return { overrideCount: 0 };
    throw error;
  }

  // Read all override files async before entering the synchronous transaction
  const overrides = [];
  for (const fileName of files) {
    const ovr = await readJsonIfExists(path.join(overrideDir, fileName));
    if (isObject(ovr) && ovr.name) overrides.push({ fileName, ovr });
  }

  const tx = db.db.transaction(() => {
    for (const { fileName, ovr } of overrides) {
      const componentType = ovr.componentType || fileName.split('_')[0];
      const componentName = ovr.name;
      const maker = ovr.identity?.maker ?? '';

      // Update review_status on component_identity
      if (ovr.review_status) {
        db.updateComponentReviewStatus(componentType, componentName, maker, ovr.review_status);
      }

      // Update aliases_overridden flag
      if (ovr.identity?.aliases) {
        db.updateAliasesOverridden(componentType, componentName, maker, true);
        // Seed override aliases
        const idRow = db.db.prepare(
          'SELECT id FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
        ).get(db.category, componentType, componentName, maker || '');
        if (idRow) {
          for (const alias of ovr.identity.aliases) {
            const trimmed = String(alias || '').trim();
            if (trimmed) db.insertAlias(idRow.id, trimmed, 'user');
          }
        }
      }

      // Seed property overrides
      if (isObject(ovr.properties)) {
        for (const [propKey, propVal] of Object.entries(ovr.properties)) {
          db.upsertComponentValue({
            componentType,
            componentName,
            componentMaker: maker,
            propertyKey: propKey,
            value: propVal != null ? String(propVal) : null,
            confidence: 1.0,
            source: 'user',
            overridden: true
          });
          overrideCount++;
        }
      }
    }
  });
  tx();

  return { overrideCount };
}

// ── Step 1: Component seeding ────────────────────────────────────────────────

function seedComponents(db, fieldRules) {
  const componentDBs = fieldRules.componentDBs || {};
  let identityCount = 0;
  let aliasCount = 0;
  let valueCount = 0;

  const tx = db.db.transaction(() => {
    for (const [typeKey, compDb] of Object.entries(componentDBs)) {
      const componentType = typeKey;
      const entries = isObject(compDb.entries) ? compDb.entries : {};

      for (const entry of Object.values(entries)) {
        if (!isObject(entry)) continue;
        const canonicalName = String(entry.canonical_name || entry.name || '').trim();
        if (!canonicalName) continue;
        const maker = String(entry.maker || '').trim();
        const links = Array.isArray(entry.links) ? entry.links : null;

        const entrySource = entry.__discovery_source || 'component_db';

        const idRow = db.upsertComponentIdentity({
          componentType,
          canonicalName,
          maker,
          links,
          source: entrySource,
        });
        identityCount++;

        if (idRow && idRow.id) {
          const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
          for (const alias of aliases) {
            const trimmed = String(alias || '').trim();
            if (!trimmed) continue;
            db.insertAlias(idRow.id, trimmed, entrySource);
            aliasCount++;
          }
          // Also add canonical_name as alias for findComponentByAlias lookups
          db.insertAlias(idRow.id, canonicalName, entrySource);
          aliasCount++;
        }

        const properties = isObject(entry.properties) ? entry.properties : {};
        const variancePolicies = isObject(entry.__variance_policies) ? entry.__variance_policies : {};
        const entryConstraints = isObject(entry.__constraints) ? entry.__constraints : {};
        const ruleFields = isObject(fieldRules?.rules?.fields)
          ? fieldRules.rules.fields
          : (isObject(fieldRules?.fields) ? fieldRules.fields : {});
        for (const [propKey, propVal] of Object.entries(properties)) {
          const fieldRule = isObject(ruleFields[propKey]) ? ruleFields[propKey] : null;
          const ruleVariance = fieldRule?.variance_policy ?? null;
          const ruleConstraints = Array.isArray(fieldRule?.constraints) ? fieldRule.constraints : null;
          db.upsertComponentValue({
            componentType,
            componentName: canonicalName,
            componentMaker: maker,
            propertyKey: propKey,
            value: propVal != null ? String(propVal) : null,
            confidence: 1.0,
            variancePolicy: ruleVariance ?? variancePolicies[propKey] ?? null,
            source: entrySource,
            constraints: ruleConstraints ?? (Array.isArray(entryConstraints[propKey]) ? entryConstraints[propKey] : null)
          });
          valueCount++;
        }
      }
    }
  });
  tx();

  return { identityCount, aliasCount, valueCount };
}

// ── Step 2: List values seeding ──────────────────────────────────────────────

async function seedListValues(db, fieldRules, config, category) {
  let count = 0;
  const rows = await collectListSeedRows(fieldRules, config, category);
  const tx = db.db.transaction((rowsToSeed) => {
    for (const row of rowsToSeed) {
      db.upsertListValue(row);
      count++;
    }
  });

  tx(rows);

  const policyByField = new Map();
  const knownByField = new Map();
  for (const row of rows) {
    if (row.enumPolicy) policyByField.set(row.fieldKey, row.enumPolicy);
    if (row.source === 'known_values') {
      if (!knownByField.has(row.fieldKey)) knownByField.set(row.fieldKey, new Set());
      knownByField.get(row.fieldKey).add(row.normalizedValue);
    }
  }
  for (const [fieldKey, policy] of policyByField) {
    const knownNormalized = knownByField.get(fieldKey) || new Set();
    reEvaluateEnumPolicy(db, fieldKey, policy, knownNormalized);
  }

  // WHY: Auto-create enum_lists for open_prefer_known fields that have no curated
  // values yet. This enables the discovery-enum self-tightening loop — discovered
  // pipeline values accumulate here over time.
  const fields = fieldRules?.rules?.fields || fieldRules?.fields || {};
  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (rule?.enum?.policy === 'open_prefer_known') {
      db.ensureEnumList(fieldKey, 'auto_discovery');
    }
  }

  return { count };
}

// ── Enum policy re-evaluation ──────────────────────────────────────────────

export { reconcileComponentOverrideRows };

export function reEvaluateEnumPolicy(db, fieldKey, newPolicy, knownNormalizedValues) {
  const category = db.category;
  const isClosedPolicy = newPolicy === 'closed' || newPolicy === 'closed_with_curation';

  db.db.prepare(
    'UPDATE list_values SET enum_policy = ?, updated_at = datetime(\'now\') WHERE category = ? AND field_key = ?'
  ).run(newPolicy, category, fieldKey);

  const pipelineRows = db.db.prepare(
    'SELECT id, normalized_value, overridden FROM list_values WHERE category = ? AND field_key = ? AND source = ?'
  ).all(category, fieldKey, 'pipeline');

  const update = db.db.prepare(
    'UPDATE list_values SET needs_review = ?, updated_at = datetime(\'now\') WHERE id = ?'
  );

  for (const row of pipelineRows) {
    if (row.overridden) continue;
    const inKnownSet = knownNormalizedValues.has(row.normalized_value);
    const needsReview = !inKnownSet && isClosedPolicy ? 1 : 0;
    update.run(needsReview, row.id);
  }
}

// ── Steps 3-7: Per-product seeding ───────────────────────────────────────────

async function seedProducts(db, config, category, fieldRules, fieldMeta) {
  // WHY: Storage now strips the specs/outputs/ prefix from resolved paths.
  // Check the new path first, fall back to legacy specs/outputs/ layout.
  const baseOut = config.localOutputRoot || 'out';
  const newPath = path.join(baseOut, category);
  const legacyPath = path.join(baseOut, 'specs', 'outputs', category);
  let outputRoot = newPath;
  try { if (!(await fs.stat(newPath)).isDirectory()) outputRoot = legacyPath; } catch { outputRoot = legacyPath; }
  const helperRoot = config.categoryAuthorityRoot || 'category_authority';
  const overridesDir = path.join(helperRoot, category, '_overrides');

  // WHY: Overlap 0d — read consolidated overrides once, fall back to per-product files
  let consolidatedProducts = {};
  try {
    const { readConsolidatedOverrides } = await import('../shared/consolidatedOverrides.js');
    const consolidated = await readConsolidatedOverrides({ config, category });
    consolidatedProducts = consolidated?.products || {};
  } catch { /* consolidated file missing or module not available — fall back to per-product */ }

  let entries;
  try {
    entries = await fs.readdir(outputRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { productCount: 0, errors: [] };
    throw error;
  }

  const errors = [];
  let productCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_index') continue;

    const productId = entry.name;
    const latestDir = path.join(outputRoot, productId, 'latest');

    try {
      // WHY: reads latest/normalized.json + provenance.json if they exist. In production
      // these files are not produced (no validation stage yet), so this block is skipped.
      // Test harnesses write these files to seed the review grid with fixture data.
      const overridesFromConsolidated = consolidatedProducts[productId] || null;
      const [normalized, provenance, overrides] = await Promise.all([
        readJsonIfExists(path.join(latestDir, 'normalized.json')),
        readJsonIfExists(path.join(latestDir, 'provenance.json')),
        overridesFromConsolidated
          ? Promise.resolve(overridesFromConsolidated)
          : readJsonIfExists(path.join(overridesDir, `${productId}.overrides.json`))
      ]);

      if (!normalized) continue;

      const tx = db.db.transaction(() => {
        // Step 4: Insert item_field_state from normalized + provenance + overrides
        const fields = isObject(normalized.fields) ? normalized.fields : {};
        const overrideMap = isObject(overrides?.overrides) ? overrides.overrides : {};

        for (const [fieldKey, rawValue] of Object.entries(fields)) {
          const prov = isObject(provenance) ? provenance[fieldKey] : null;
          const ovr = overrideMap[fieldKey];
          const isOverridden = isObject(ovr);
          const shape = fieldMeta[fieldKey]?.shape || 'scalar';

          const value = isOverridden ? (ovr.value ?? ovr.override_value ?? rawValue) : rawValue;
          const normalizedSlotValue = normalizeSlotValueForShape(value, shape).value;
          const valueText = slotValueToText(normalizedSlotValue, shape);
          const hasKnownSlot = isKnownSlotValue(normalizedSlotValue, shape);
          const confidence = isOverridden ? 1.0 : (prov?.confidence ?? 0);
          const source = isOverridden ? 'override' : 'pipeline';

          const knownValue = hasKnownSlot;
          db.upsertItemFieldState({
            productId,
            fieldKey,
            value: valueText ?? null,
            confidence,
            source,
            acceptedCandidateId: null,
            overridden: isOverridden,
            needsAiReview: !isOverridden && knownValue && confidence < 0.8,
            aiReviewComplete: false,
            ...(isOverridden ? {
              overrideSource: ovr.override_source || 'candidate_selection',
              overrideValue: ovr.override_value || ovr.value || valueText,
              overrideReason: ovr.override_reason || null,
              overrideProvenance: ovr.override_provenance ? JSON.stringify(ovr.override_provenance) : null,
              overriddenBy: ovr.overridden_by || null,
              overriddenAt: ovr.overridden_at || ovr.set_at || null,
            } : {}),
          });
        }

        // Step 5: Insert item_component_links
        const componentDBs = fieldRules.componentDBs || {};
        for (const [fieldKey, fm] of Object.entries(fieldMeta)) {
          if (!fm.is_component_field || !fm.component_type) continue;
          const rawValue = fields[fieldKey];
          const normalizedComponentValue = normalizeSlotValueForShape(rawValue, fm.shape || 'scalar').value;
          const rawValueText = String(slotValueToText(normalizedComponentValue, fm.shape || 'scalar') || '').trim();
          if (!rawValueText || normalizeToken(rawValueText) === 'unk' || normalizeToken(rawValueText) === 'n/a') continue;

          const compType = fm.component_type;
          // Try singular key first (loadFieldRules keys by filename: sensor.json → "sensor"),
          // then plural fallback (some callers use plural keys: "sensors", "switches")
          const compDb = componentDBs[compType];
          if (!compDb?.__index) {
            db.upsertItemComponentLink({
              productId,
              fieldKey,
              componentType: compType,
              componentName: rawValueText,
              componentMaker: '',
              matchType: 'unresolved',
              matchScore: 0.0
            });
            continue;
          }

          const makerHint = resolveComponentMakerHint(fields, fieldKey, compType);
          const { entry: matched, ambiguous } = resolveComponentEntryByNameAndMaker(compDb, rawValueText, makerHint);
          if (matched) {
            db.upsertItemComponentLink({
              productId,
              fieldKey,
              componentType: compType,
              componentName: matched.canonical_name || rawValueText,
              componentMaker: matched.maker || '',
              matchType: makerHint ? 'exact_with_maker' : 'exact',
              matchScore: 1.0
            });
          } else {
            db.upsertItemComponentLink({
              productId,
              fieldKey,
              componentType: compType,
              componentName: rawValueText,
              componentMaker: '',
              matchType: ambiguous ? 'ambiguous' : 'unresolved',
              matchScore: 0.0
            });
          }
        }

        // Step 6: Insert item_list_links for list + enum fields
        for (const [fieldKey, fm] of Object.entries(fieldMeta)) {
          if (!fm.is_list_field && !fm.is_enum_field) continue;
          const rawValue = fields[fieldKey];
          db.removeItemListLinksForField(productId, fieldKey);
          const linkShape = fm.is_list_field ? 'list' : (fm.shape || 'scalar');
          const normalizedListValue = normalizeSlotValueForShape(rawValue, linkShape).value;
          if (!isKnownSlotValue(normalizedListValue, linkShape)) continue;

          const valueTokens = expandListLinkValues(slotValueToText(normalizedListValue, linkShape));
          const linkedIds = new Set();
          for (const token of valueTokens) {
            const listRow = db.getListValueByFieldAndValue(fieldKey, token);
            if (!listRow?.id) continue;
            if (linkedIds.has(listRow.id)) continue;
            linkedIds.add(listRow.id);
            db.upsertItemListLink({
              productId,
              fieldKey,
              listValueId: listRow.id
            });
          }
        }

      });
      tx();

      // Step 8: Populate product_review_state from override file envelope
      if (isObject(overrides)) {
        const reviewStatus = normalizeToken(overrides.review_status || '');
        if (reviewStatus) {
          db.upsertProductReviewState({
            productId,
            reviewStatus,
            reviewStartedAt: overrides.review_started_at || null,
            reviewedBy: overrides.reviewed_by || null,
            reviewedAt: overrides.reviewed_at || null,
          });
        }
      }

      productCount++;
    } catch (error) {
      errors.push({ productId, error: error.message });
    }
  }

  return { productCount, errors };
}

// ── Backfill item_component_links from item_field_state ──────────────────────

function backfillComponentLinks(db, fieldMeta, fieldRules) {
  const componentDBs = fieldRules.componentDBs || {};
  let backfilled = 0;

  const tx = db.db.transaction(() => {
    for (const [fieldKey, fm] of Object.entries(fieldMeta)) {
      if (!fm.is_component_field || !fm.component_type) continue;
      const compType = fm.component_type;
      const compDb = componentDBs[compType];
      if (!compDb) continue;

      // Build alias → canonical_name lookup from DB
      const aliasMap = new Map();
      try {
        const identities = db.db.prepare(
          'SELECT id, canonical_name, maker FROM component_identity WHERE category = ? AND component_type = ?'
        ).all(db.category, compType);
        for (const id of identities) {
          aliasMap.set(id.canonical_name.trim().toLowerCase(), { name: id.canonical_name, maker: id.maker || '' });
          const aliases = db.db.prepare('SELECT alias FROM component_aliases WHERE component_id = ?').all(id.id);
          for (const a of aliases) {
            if (a.alias) aliasMap.set(a.alias.trim().toLowerCase(), { name: id.canonical_name, maker: id.maker || '' });
          }
        }
      } catch { continue; }

      // Find all item_field_state rows for this field that aren't already linked
      const fieldRows = db.db.prepare(`
        SELECT ifs.product_id, ifs.value
        FROM item_field_state ifs
        WHERE ifs.category = ? AND ifs.field_key = ?
          AND ifs.value IS NOT NULL AND LOWER(TRIM(ifs.value)) NOT IN ('unk', 'n/a', '')
          AND NOT EXISTS (
            SELECT 1 FROM item_component_links icl
            WHERE icl.category = ifs.category AND icl.product_id = ifs.product_id AND icl.field_key = ifs.field_key
          )
      `).all(db.category, fieldKey);

      for (const row of fieldRows) {
        const token = row.value.trim().toLowerCase();
        const match = aliasMap.get(token);
        if (match) {
          db.upsertItemComponentLink({
            productId: row.product_id,
            fieldKey,
            componentType: compType,
            componentName: match.name,
            componentMaker: match.maker,
            matchType: 'alias',
            matchScore: 1.0
          });
          backfilled++;
        }
      }
    }
  });
  tx();
  return { backfilled };
}

// ── Step 9: Source + Key Review backfill ──────────────────────────────────────

function seedSourceAndKeyReview(db, category, fieldMeta) {
  let keyReviewStateCount = 0;
  let keyReviewAuditCount = 0;
  let keyReviewRunCount = 0;

  const tx = db.db.transaction(() => {
    const itemFieldStateRows = db.db.prepare(
      'SELECT id, product_id, field_key FROM item_field_state WHERE category = ?'
    ).all(db.category);
    const itemFieldStateIdBySlot = new Map();
    for (const row of itemFieldStateRows) {
      itemFieldStateIdBySlot.set(`${row.product_id}::${row.field_key}`, row.id);
    }

    const enumListRows = db.db.prepare(
      'SELECT id, field_key FROM enum_lists WHERE category = ?'
    ).all(db.category);
    const enumListIdByField = new Map();
    for (const row of enumListRows) {
      enumListIdByField.set(String(row.field_key || ''), row.id);
    }

    const listValueRows = db.db.prepare(
      'SELECT id, list_id, field_key, value FROM list_values WHERE category = ?'
    ).all(db.category);
    const listValueIdByFieldValue = new Map();
    for (const row of listValueRows) {
      const valueToken = normalizeToken(row.value);
      if (!valueToken) continue;
      listValueIdByFieldValue.set(`${row.field_key}::${valueToken}`, row.id);
    }

    const componentLinkRows = db.db.prepare(
      'SELECT product_id, field_key, component_type, component_name, component_maker FROM item_component_links WHERE category = ?'
    ).all(db.category);
    const componentLinkByProductType = new Map();
    for (const row of componentLinkRows) {
      const key = `${row.product_id}::${row.component_type || row.field_key || ''}`;
      if (!componentLinkByProductType.has(key)) {
        componentLinkByProductType.set(key, row);
      }
    }

    const componentValueRows = db.db.prepare(
      'SELECT id, component_type, component_name, component_maker, property_key FROM component_values WHERE category = ?'
    ).all(db.category);
    const componentValueIdBySlot = new Map();
    for (const row of componentValueRows) {
      componentValueIdBySlot.set(
        `${row.component_type}::${row.component_name}::${row.component_maker || ''}::${row.property_key}`,
        row.id
      );
    }

    // 9b: item_field_state → key_review_state (grid_key)
    const allFieldStates = db.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ?'
    ).all(db.category);

    // Pre-load llm_route_matrix for contract snapshots
    const routes = db.db.prepare(
      'SELECT * FROM llm_route_matrix WHERE category = ?'
    ).all(db.category);
    const fieldRoutes = routes.filter(r => r.scope === 'field');
    const componentRoutes = routes.filter(r => r.scope === 'component');
    const listRoutes = routes.filter(r => r.scope === 'list');

    function findRoute(routeList) {
      return routeList.length > 0 ? routeList[0] : null;
    }

    for (const ifs of allFieldStates) {
      // Primary lane mapping
      let aiConfirmPrimaryStatus = null;
      if (ifs.needs_ai_review && !ifs.ai_review_complete) aiConfirmPrimaryStatus = 'pending';
      else if (ifs.ai_review_complete) aiConfirmPrimaryStatus = 'confirmed';

      let userAcceptPrimaryStatus = null;
      if (ifs.overridden) userAcceptPrimaryStatus = 'accepted';

      // Contract snapshot from route matrix
      const route = findRoute(fieldRoutes);

      db.upsertKeyReviewState({
        category,
        targetKind: 'grid_key',
        itemIdentifier: ifs.product_id,
        fieldKey: ifs.field_key,
        itemFieldStateId: ifs.id,
        requiredLevel: route?.required_level ?? null,
        availability: route?.availability ?? null,
        difficulty: route?.difficulty ?? null,
        effort: route?.effort ?? null,
        aiMode: route?.model_ladder_today ?? null,
        evidencePolicy: route?.insufficient_evidence_action ?? null,
        minEvidenceRefsEffective: route?.llm_output_min_evidence_refs_required ?? 1,
        sendMode: route?.all_source_data ? 'all_source_data' : (route?.single_source_data ? 'single_source_data' : null),
        selectedValue: ifs.value,
        selectedCandidateId: ifs.accepted_candidate_id,
        confidenceScore: ifs.confidence || 0,
        aiConfirmPrimaryStatus,
        userAcceptPrimaryStatus,
      });
      keyReviewStateCount++;
    }

    // 9c: component_values → key_review_state (component_key)
    const allComponentValues = db.db.prepare(
      'SELECT * FROM component_values WHERE category = ?'
    ).all(db.category);

    for (const cv of allComponentValues) {
      let aiConfirmSharedStatus = null;
      if (cv.overridden) {
        // overridden → user accepted
      } else if (cv.needs_review) {
        aiConfirmSharedStatus = 'pending';
      } else {
        aiConfirmSharedStatus = 'not_run';
      }

      let userAcceptSharedStatus = null;
      if (cv.overridden) userAcceptSharedStatus = 'accepted';

      const componentIdentifier = buildComponentIdentifier(
        cv.component_type,
        cv.component_name,
        cv.component_maker || ''
      );
      const route = findRoute(componentRoutes);

      db.upsertKeyReviewState({
        category,
        targetKind: 'component_key',
        componentIdentifier,
        propertyKey: cv.property_key,
        fieldKey: cv.property_key,
        componentValueId: cv.id,
        componentIdentityId: cv.component_identity_id ?? null,
        requiredLevel: route?.required_level ?? null,
        availability: route?.availability ?? null,
        difficulty: route?.difficulty ?? null,
        effort: route?.effort ?? null,
        aiMode: route?.model_ladder_today ?? null,
        evidencePolicy: route?.insufficient_evidence_action ?? null,
        minEvidenceRefsEffective: route?.llm_output_min_evidence_refs_required ?? 1,
        sendMode: route?.all_source_data ? 'all_source_data' : (route?.single_source_data ? 'single_source_data' : null),
        componentSendMode: route?.component_values_send?.includes('prime') ? 'component_values_prime_sources' : 'component_values',
        selectedValue: cv.value,
        selectedCandidateId: cv.accepted_candidate_id,
        confidenceScore: cv.confidence || 0,
        aiConfirmSharedStatus,
        userAcceptSharedStatus,
      });
      keyReviewStateCount++;
    }

    // 9d: list_values → key_review_state (enum_key)
    const allListValues = db.db.prepare(
      'SELECT * FROM list_values WHERE category = ?'
    ).all(db.category);

    for (const lv of allListValues) {
      let aiConfirmSharedStatus = null;
      if (lv.overridden) {
        // overridden → user accepted
      } else if (lv.needs_review) {
        aiConfirmSharedStatus = 'pending';
      } else if (lv.source === 'pipeline') {
        aiConfirmSharedStatus = 'pending';
      } else if (lv.source === 'known_values') {
        aiConfirmSharedStatus = 'not_run';
      } else {
        aiConfirmSharedStatus = 'not_run';
      }

      let userAcceptSharedStatus = null;
      if (lv.overridden) userAcceptSharedStatus = 'accepted';

      const enumValueNorm = lv.normalized_value || String(lv.value || '').trim().toLowerCase();
      const route = findRoute(listRoutes);

      db.upsertKeyReviewState({
        category,
        targetKind: 'enum_key',
        fieldKey: lv.field_key,
        enumValueNorm: enumValueNorm,
        listValueId: lv.id,
        enumListId: lv.list_id ?? null,
        requiredLevel: route?.required_level ?? null,
        availability: route?.availability ?? null,
        difficulty: route?.difficulty ?? null,
        effort: route?.effort ?? null,
        aiMode: route?.model_ladder_today ?? null,
        evidencePolicy: route?.insufficient_evidence_action ?? null,
        minEvidenceRefsEffective: route?.llm_output_min_evidence_refs_required ?? 1,
        sendMode: route?.all_source_data ? 'all_source_data' : (route?.single_source_data ? 'single_source_data' : null),
        listSendMode: route?.list_values_send?.includes('prime') ? 'list_values_prime_sources' : 'list_values',
        selectedValue: lv.value,
        selectedCandidateId: lv.accepted_candidate_id,
        aiConfirmSharedStatus,
        userAcceptSharedStatus,
      });
      keyReviewStateCount++;
    }

  });
  tx();

  return {
    keyReviewStateCount,
    keyReviewAuditCount,
    keyReviewRunCount,
  };
}

// ── Category surface registry (built once at module load) ────────────────────

const categorySurfaces = buildCategorySurfaces({
  seedComponents, reconcileComponentDbRows,
  seedComponentOverrides, reconcileComponentOverrideRows,
  seedListValues, reconcileListSeedRows,
  seedProducts,
  backfillComponentLinks,
  seedSourceAndKeyReview,
});

// ── Main entry point ─────────────────────────────────────────────────────────

export async function seedSpecDb({ db, config, category, fieldRules, logger }) {
  const seededFieldRules = projectFieldRulesForConsumer(fieldRules, 'seed');
  const fieldMeta = buildFieldMeta(seededFieldRules);

  const result = await runCategorySeed({
    db, config, category,
    fieldRules: seededFieldRules,
    fieldMeta,
    logger,
    surfaces: categorySurfaces,
  });

  return result;
}

