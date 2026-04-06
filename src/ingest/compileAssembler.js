// WHY: Extracted from categoryCompile.js — post-loop assembly phase.
// Pure computation: key migration reconciliation, validation, canonical field
// ordering, tier classification, payload building, compile report assembly.

import path from 'node:path';
import { toRawFieldKey } from '../utils/fieldKeys.js';
import {
  toArray,
  isObject,
  asInt,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  stableSortStrings,
  sortDeep,
  hashBuffer,
  hashJson,
} from './compileUtils.js';
import {
  reconcileKeyMigrationsForFieldSet,
  findKeyMigrationCycle,
} from './compileFieldInference.js';
import {
  buildParseTemplateCatalog,
  buildCompileValidation,
} from './compileValidation.js';
import { buildComponentSourceSummary } from './compileComponentHelpers.js';
import { diffFieldRuleSets } from './compileFileIo.js';

export function assembleCompileOutput({
  fieldsRuntime,
  fieldsStudio,
  uiFieldCatalogRows,
  knownValues,
  keyMigrations,
  map,
  category,
  compileTimestamp,
  compileMode,
  baselineFieldRules,
  componentDb,
  componentSourceAssertions,
  componentSourceStats,
  enumLists,
  mapWarnings,
  keyRows,
  samples,
  previousCompileReport,
  previousGeneratedFieldRules,
  controlPlaneRoot,
  generatedRoot,
  resolvedControlMapPath,
  mapHash,
  resolvedFieldStudioSourcePath,
  fieldStudioSourceHash,
}) {
  // ── Key migration reconciliation ──
  const reconciledKeyMigrations = reconcileKeyMigrationsForFieldSet(
    keyMigrations,
    Object.keys(fieldsRuntime),
    mapWarnings
  );
  for (const key of Object.keys(keyMigrations)) {
    delete keyMigrations[key];
  }
  Object.assign(keyMigrations, reconciledKeyMigrations);

  const keyMigrationCycle = findKeyMigrationCycle(keyMigrations);
  if (keyMigrationCycle) {
    return {
      earlyReturn: {
        category,
        compiled: false,
        field_studio_source_path: resolvedFieldStudioSourcePath,
        field_studio_source_hash: fieldStudioSourceHash,
        map_path: resolvedControlMapPath,
        map_hash: mapHash,
        errors: [
          `key_migrations: cycle detected (${keyMigrationCycle.join(' -> ')})`
        ],
        warnings: mapWarnings
      },
    };
  }

  // ── Validation ──
  const validation = buildCompileValidation({
    fields: fieldsRuntime,
    knownValues,
    enumLists,
    componentDb,
    map,
  });
  for (const assertion of componentSourceAssertions) {
    if (!validation.errors.includes(assertion)) {
      validation.errors.push(assertion);
    }
  }

  // ── Canonical field ordering ──
  const canonicalFields = {};
  const baselineFieldOrder = Object.keys(isObject(baselineFieldRules?.fields) ? baselineFieldRules.fields : {});
  for (const fieldKey of baselineFieldOrder) {
    if (Object.prototype.hasOwnProperty.call(fieldsStudio, fieldKey)) {
      canonicalFields[fieldKey] = fieldsStudio[fieldKey];
    }
  }
  for (const row of keyRows) {
    const outputField = normalizeFieldKey(toRawFieldKey(row.key)) || row.key;
    if (Object.prototype.hasOwnProperty.call(fieldsStudio, outputField) && !Object.prototype.hasOwnProperty.call(canonicalFields, outputField)) {
      canonicalFields[outputField] = fieldsStudio[outputField];
    }
  }
  for (const fieldKey of Object.keys(fieldsStudio)) {
    if (!Object.prototype.hasOwnProperty.call(canonicalFields, fieldKey)) {
      canonicalFields[fieldKey] = fieldsStudio[fieldKey];
    }
  }

  // Sort canonicalFields alphabetically by key
  const sortedCanonicalFields = {};
  for (const k of stableSortStrings(Object.keys(canonicalFields))) {
    sortedCanonicalFields[k] = canonicalFields[k];
  }
  Object.keys(canonicalFields).forEach(k => delete canonicalFields[k]);
  Object.assign(canonicalFields, sortedCanonicalFields);

  // Strip orphan properties from compiled output.
  // These are used internally during compilation but never read by runtime code.
  const orphanKeys = ['parse_rules', 'value_form', 'round', 'canonical_key'];
  for (const rule of Object.values(canonicalFields)) {
    if (!isObject(rule)) continue;
    for (const orphan of orphanKeys) {
      delete rule[orphan];
    }
  }

  // ── Field tier classification ──
  const identityKeys = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => normalizeToken(rule?.priority?.required_level) === 'identity')
      .map(([field]) => field)
  );
  const requiredKeys = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => normalizeToken(rule?.priority?.required_level) === 'required')
      .map(([field]) => field)
  );
  const criticalKeys = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => normalizeToken(rule?.priority?.required_level) === 'critical')
      .map(([field]) => field)
  );
  const expectedEasy = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => (
        normalizeToken(rule?.priority?.required_level) === 'expected'
        && normalizeToken(rule?.priority?.difficulty) === 'easy'
      ))
      .map(([field]) => field)
  );
  const expectedSometimes = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => (
        normalizeToken(rule?.priority?.required_level) === 'expected'
        && normalizeToken(rule?.priority?.difficulty) !== 'easy'
      ))
      .map(([field]) => field)
  );
  const deepFields = stableSortStrings(
    Object.entries(canonicalFields)
      .filter(([, rule]) => (
        ['optional', 'rare'].includes(normalizeToken(rule?.priority?.required_level))
      ))
      .map(([field]) => field)
  );

  // ── Source metadata ──
  const keySourceColumn = String(map?.key_list?.column || '').toUpperCase();
  const keySourceRange = normalizeText(
    map?.key_list?.source === 'range'
      ? map?.key_list?.range
      : (map?.key_list?.source === 'named_range'
        ? String(map?.key_list?.named_range || '')
        : `${keySourceColumn}${asInt(map?.key_list?.row_start, 1)}:${keySourceColumn}${asInt(map?.key_list?.row_end, asInt(map?.key_list?.row_start, 1))}`)
  );

  const keyRange = normalizeText(map?.key_list?.sheet)
    ? `${normalizeText(map?.key_list?.sheet)}!${keySourceRange}`
    : keySourceRange;
  const sourceTabs = sortDeep(isObject(baselineFieldRules?.source_tabs) ? baselineFieldRules.source_tabs : {});
  const enumBuckets = sortDeep(isObject(baselineFieldRules?.enum_buckets) ? baselineFieldRules.enum_buckets : {});
  const componentDbSources = buildComponentSourceSummary({
    map,
    componentDb,
    sourceStats: componentSourceStats,
    fieldsRuntime
  });
  const parseTemplates = isObject(baselineFieldRules?.parse_templates)
    ? baselineFieldRules.parse_templates
    : buildParseTemplateCatalog();

  // ── Build payloads ──
  const fieldRulesCanonical = {
    category,
    publish_gate: normalizeToken(baselineFieldRules?.publish_gate || '') || 'required_complete',
    component_db_sources: sortDeep(componentDbSources),
    enum_buckets: sortDeep(isObject(baselineFieldRules?.enum_buckets) ? baselineFieldRules.enum_buckets : enumBuckets),
    field_count: Object.keys(canonicalFields).length,
    fields: canonicalFields,
    generated_at: compileTimestamp,
    key_range: normalizeText(baselineFieldRules?.key_range || '') || keyRange,
    notes: Array.isArray(baselineFieldRules?.notes)
      ? baselineFieldRules.notes
      : [
        'Generated by Field Rules Studio compiler.',
        'Canonical runtime contract used by ingestion and extraction.'
      ],
    parse_templates: sortDeep(parseTemplates),
    source_context: normalizeText(baselineFieldRules?.source_context || '')
      || (compileMode === 'field_studio' ? 'field_studio_map' : 'field_studio_source'),
    version: normalizeText(baselineFieldRules?.version || '') || `field_rules_${normalizeFieldKey(category) || category}_compiled_v1`,
    source_tabs: sortDeep(
      isObject(baselineFieldRules?.source_tabs)
        ? baselineFieldRules.source_tabs
        : sourceTabs
    )
  };

  const uiFieldCatalog = {
    version: 1,
    category,
    generated_at: compileTimestamp,
    fields: uiFieldCatalogRows.sort((a, b) => (asInt(a.order, 0) - asInt(b.order, 0)) || a.key.localeCompare(b.key))
  };

  // WHY: Write enums form with per-field policy so the seed chain reads
  // the correct enum_policy per field (e.g., 'closed' for colors).
  const knownValuesArtifact = {
    version: 1,
    category,
    generated_at: compileTimestamp,
    enums: Object.fromEntries(
      Object.entries(knownValues).map(([fieldKey, values]) => [
        fieldKey,
        {
          policy: fieldsRuntime[fieldKey]?.enum_policy || 'open',
          values: sortDeep(values),
        },
      ])
    ),
  };

  // ── Cross-check runtime ↔ UI keys ──
  const runtimeKeys = stableSortStrings(Object.keys(fieldsRuntime));
  const uiKeys = stableSortStrings(toArray(uiFieldCatalog.fields).map((row) => normalizeFieldKey(row?.key || '')));
  const uiKeySet = new Set(uiKeys);
  for (const key of runtimeKeys) {
    if (!uiKeySet.has(key)) {
      validation.errors.push(`ui_field_catalog missing key '${key}'`);
    }
  }
  const runtimeKeySet = new Set(runtimeKeys);
  for (const key of uiKeys) {
    if (!runtimeKeySet.has(key)) {
      validation.errors.push(`field_rules missing key '${key}'`);
    }
  }

  // ── Change detection & compile report ──
  const previousHash = previousCompileReport?.artifacts?.field_rules?.hash || null;
  const currentHash = hashBuffer(Buffer.from(`${JSON.stringify(fieldRulesCanonical, null, 2)}\n`, 'utf8'));
  const changed = Boolean(previousHash && previousHash !== currentHash);
  const fieldDiff = diffFieldRuleSets(previousGeneratedFieldRules, fieldRulesCanonical);
  const componentSourceCount = toArray(map.component_sources).length > 0
    ? toArray(map.component_sources).length
    : toArray(map.component_sheets).length;

  const compileReport = {
    version: 1,
    category,
    generated_at: compileTimestamp,
    compiled_at: compileTimestamp,
    compile_mode: compileMode,
    compiled: validation.errors.length === 0,
    field_studio_source_path: '',
    field_studio_source_hash: null,
    field_studio_map_path: resolvedControlMapPath,
    field_studio_map_hash: mapHash,
    counts: {
      fields: Object.keys(fieldsRuntime).length,
      identity: identityKeys.length,
      required: requiredKeys.length,
      critical: criticalKeys.length,
      expected_easy: expectedEasy.length,
      expected_sometimes: expectedSometimes.length,
      deep: deepFields.length,
      enums: Object.keys(knownValues).length,
      component_types: Object.keys(componentDb).length
    },
    warnings: [...mapWarnings, ...validation.warnings],
    errors: validation.errors,
    source_summary: {
      key_rows: keyRows.length,
      sampled_product_columns: toArray(samples.columns).length,
      sampled_values: Object.values(samples.byField || {}).reduce((sum, list) => sum + toArray(list).length, 0),
      enum_lists: toArray(map.enum_lists).length,
      component_sources: componentSourceCount,
      component_sheets: componentSourceCount
    },
    diff: {
      changed,
      previous_hash: previousHash,
      current_hash: currentHash,
      fields: fieldDiff
    },
    artifacts: {
      field_rules: {
        path: path.join(generatedRoot, 'field_rules.json'),
        hash: currentHash,
        changed
      },
      ui_field_catalog: {
        path: path.join(generatedRoot, 'ui_field_catalog.json'),
        hash: hashJson(uiFieldCatalog)
      },
      known_values: {
        path: path.join(generatedRoot, 'known_values.json'),
        hash: hashJson(knownValuesArtifact)
      },
      key_migrations: Object.keys(keyMigrations).length
        ? {
          path: path.join(generatedRoot, 'key_migrations.json'),
          hash: hashJson(keyMigrations)
        }
        : null
    }
  };

  return {
    earlyReturn: null,
    fieldRulesCanonical,
    uiFieldCatalog,
    knownValuesArtifact,
    compileReport,
    validation,
  };
}
