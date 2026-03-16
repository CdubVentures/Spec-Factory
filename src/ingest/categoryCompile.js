import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../utils/common.js';
import { toRawFieldKey } from '../utils/fieldKeys.js';
import {
  toArray,
  isObject,
  asInt,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  titleFromKey,
  stableSortStrings,
  orderedUniqueStrings,
  sortDeep,
  isNumericContractType,
  hashBuffer,
  hashJson,
  fileExists
} from './compileUtils.js';
import {
  loadTooltipLibrary
} from './compileTooltipParser.js';
import {
  normalizeFieldStudioMap,
  validateFieldStudioMap as _validateFieldStudioMap
} from './compileMapNormalization.js';

// Re-export validateFieldStudioMap for backward compatibility
export { _validateFieldStudioMap as validateFieldStudioMap };

import {
  reconcileKeyMigrationsForFieldSet,
  findKeyMigrationCycle,
  inferParseTemplate,
  canonicalParseTemplate,
  enforceExpectationPriority
} from './compileFieldInference.js';
import {
  buildPropertyConstraintsFromMap,
  resolveComponentPropertyMetaFromMap,
  applyKeyLevelConstraintsToEntities,
  buildComponentSourceSummary,
  declaredComponentPropertyKeysFromMap
} from './compileComponentHelpers.js';
import {
  mergeFieldOverride,
  parseRulesForTemplate,
  buildFieldRuleDraft,
  buildStudioFieldRule
} from './compileFieldRuleBuilder.js';
import {
  buildGlobalContractMetadata,
  buildParseTemplateCatalog,
  buildCompileValidation
} from './compileValidation.js';
import {
  writeJsonStable,
  writeCanonicalFieldRulesPair,
  diffFieldRuleSets,
  writeControlPlaneSnapshot,
  readJsonIfExists,
  resolveControlPlaneMapPaths,
  loadFieldStudioMap,
  saveFieldStudioMap,
  normalizeKnownValuesFieldsDoc,
  loadGeneratedComponentDbForCompile,
  buildFallbackKeyRows
} from './compileFileIo.js';

// Re-export loadFieldStudioMap and saveFieldStudioMap for backward compatibility
export { loadFieldStudioMap, saveFieldStudioMap };


export async function compileCategoryFieldStudio({
  category,
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  workbookMap = null,
  config = {},
  mapPath = null,
  forceSourceExtraction = false
}) {
  if (!normalizeText(category)) {
    throw new Error('category_required');
  }
  const helperRoot = path.resolve(config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority');
  const categoryRoot = path.join(helperRoot, category);
  const controlPlaneRoot = path.join(categoryRoot, '_control_plane');
  const generatedRoot = path.join(categoryRoot, '_generated');
  const { fieldStudioPath: controlPlaneFieldStudioMapPath } = resolveControlPlaneMapPaths(controlPlaneRoot);
  const providedMap = isObject(fieldStudioMap)
    ? fieldStudioMap
    : (isObject(workbookMap) ? workbookMap : null);
  const controlMap = providedMap
    ? { map: normalizeFieldStudioMap(providedMap), file_path: mapPath ? path.resolve(mapPath) : null }
    : await loadFieldStudioMap({ category, config, mapPath });
  if (!controlMap?.map) {
    throw new Error('field_studio_map_missing');
  }
  const resolvedControlMapPath = normalizeText(mapPath)
    ? path.resolve(String(mapPath))
    : controlPlaneFieldStudioMapPath;

  const configuredFieldStudioSourcePath = normalizeText(fieldStudioSourcePath)
    || normalizeText(controlMap.map.field_studio_source_path);
  const resolvedFieldStudioSourcePath = configuredFieldStudioSourcePath
    ? path.resolve(configuredFieldStudioSourcePath)
    : '';
  const fieldStudioSourceExists = resolvedFieldStudioSourcePath
    ? await fileExists(resolvedFieldStudioSourcePath)
    : false;
  const compileMode = 'field_studio';

  const mapValidation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: normalizeFieldStudioMap(controlMap.map)
  };
  if (resolvedFieldStudioSourcePath && !fieldStudioSourceExists) {
    mapValidation.warnings.push(`field_studio_source_not_found:${resolvedFieldStudioSourcePath}; using app-native compile fallback from saved map + generated artifacts`);
  }
  if (!mapValidation.valid) {
    return {
      category,
      compiled: false,
      field_studio_source_path: resolvedFieldStudioSourcePath,
      field_studio_source_hash: null,
      map_path: resolvedControlMapPath,
      map_hash: hashJson(mapValidation.normalized),
      errors: mapValidation.errors,
      warnings: mapValidation.warnings
    };
  }
  const map = normalizeFieldStudioMap(mapValidation.normalized);
  const mapWarnings = [...mapValidation.warnings];
  const mapHash = hashJson(map);
  const previousCompileReport = await readJsonIfExists(path.join(generatedRoot, '_compile_report.json'));
  const previousMapHash = normalizeText(previousCompileReport?.field_studio_map_hash || '');
  const previousGeneratedFieldRules = await readJsonIfExists(path.join(generatedRoot, 'field_rules.json'));
  const previousTimestamp = normalizeText(
    previousGeneratedFieldRules?.generated_at
    || previousCompileReport?.compiled_at
    || previousCompileReport?.generated_at
    || ''
  );
  const fieldStudioSourceHash = null;
  const canReuseTimestamp = Boolean(
    previousTimestamp
    && (previousCompileReport?.field_studio_source_hash || null) === fieldStudioSourceHash
    && previousMapHash === mapHash
  );
  const compileTimestamp = canReuseTimestamp ? previousTimestamp : nowIso();
  const baselineCandidates = [
    { source: 'authoring', path: path.join(categoryRoot, 'field_rules.json') },
    { source: 'authoring', path: path.join(categoryRoot, 'field_rules_sample.json') },
    { source: 'generated', path: path.join(generatedRoot, 'field_rules.json') },
    { source: 'control_plane', path: path.join(controlPlaneRoot, 'field_rules.full.json') }
  ];
  let baselineFieldRules = null;
  let baselineFieldRulesSource = '';
  for (const candidateRow of baselineCandidates) {
    const candidate = await readJsonIfExists(candidateRow.path);
    if (isObject(candidate) && isObject(candidate.fields)) {
      baselineFieldRules = candidate;
      baselineFieldRulesSource = candidateRow.source;
      break;
    }
  }
  const baselineFieldOverrides = isObject(baselineFieldRules?.fields) ? baselineFieldRules.fields : {};
  const mapFieldOverrides = baselineFieldRulesSource === 'authoring'
    ? {}
    : (isObject(map.field_overrides) ? map.field_overrides : {});
  const draftFieldOverrides = {};
  const effectiveFieldOverrides = {
    ...baselineFieldOverrides,
    ...mapFieldOverrides,
    ...draftFieldOverrides
  };

  const previousUiFieldCatalog = await readJsonIfExists(path.join(generatedRoot, 'ui_field_catalog.json'));
  const previousKnownValuesArtifact = await readJsonIfExists(path.join(generatedRoot, 'known_values.json'));
  const extractedKeyRows = buildFallbackKeyRows({
    map,
    baselineFieldRules,
    baselineUiFieldCatalog: previousUiFieldCatalog
  });
  const selectedKeySet = new Set(toArray(map.selected_keys).map((field) => normalizeFieldKey(field)).filter(Boolean));
  const componentPropertyKeySet = declaredComponentPropertyKeysFromMap(map);
  const extractedKeySet = new Set(extractedKeyRows.map((row) => normalizeFieldKey(row.key)).filter(Boolean));
  const declaredOnlyKeyRows = [...componentPropertyKeySet]
    .filter((key) => !extractedKeySet.has(key))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      row: 0,
      label: titleFromKey(key),
      key,
    }));
  const candidateKeyRows = [...extractedKeyRows, ...declaredOnlyKeyRows];
  const keyRows = selectedKeySet.size > 0
    ? candidateKeyRows.filter((row) => (
      selectedKeySet.has(normalizeFieldKey(row.key))
      || componentPropertyKeySet.has(normalizeFieldKey(row.key))
    ))
    : candidateKeyRows;
  if (!keyRows.length) {
    return {
      category,
      compiled: false,
      field_studio_source_path: resolvedFieldStudioSourcePath,
      field_studio_source_hash: fieldStudioSourceHash,
      map_path: resolvedControlMapPath,
      map_hash: mapHash,
      errors: [selectedKeySet.size > 0 ? 'selected_keys_filtered_all_extracted_keys' : 'no_keys_extracted_from_key_list'],
      warnings: mapValidation.warnings
    };
  }

  const samples = {
    byField: {},
    columns: []
  };
  const enumLists = normalizeKnownValuesFieldsDoc(previousKnownValuesArtifact);
  // Merge manual_enum_values into pulled enum lists
  const manualEnumValues2 = isObject(map.manual_enum_values) ? map.manual_enum_values : {};
  for (const [field, values] of Object.entries(manualEnumValues2)) {
    const nf = normalizeFieldKey(field);
    if (!nf) continue;
    const existing = toArray(enumLists[nf]);
    const manual = toArray(values).map((v) => String(v).trim()).filter(Boolean);
    enumLists[nf] = orderedUniqueStrings([...existing, ...manual]);
  }
  for (const overrides of [baselineFieldOverrides, mapFieldOverrides, draftFieldOverrides]) {
    if (!isObject(overrides)) continue;
    for (const [field, ruleDraft] of Object.entries(overrides)) {
      const nf = normalizeFieldKey(field);
      if (!nf) continue;
      const enumBlock = isObject(ruleDraft?.enum) ? ruleDraft.enum : {};
      const vals = toArray(enumBlock.additional_values).map((v) => String(v).trim()).filter(Boolean);
      if (!vals.length) continue;
      enumLists[nf] = orderedUniqueStrings([...toArray(enumLists[nf]), ...vals]);
    }
  }
  const componentPull = {
    componentDb: await loadGeneratedComponentDbForCompile(generatedRoot),
    sourceAssertions: [],
    sourceStats: {}
  };
  const componentDb = componentPull.componentDb || {};
  const componentSourceAssertions = toArray(componentPull.sourceAssertions);
  const componentSourceStats = isObject(componentPull.sourceStats) ? componentPull.sourceStats : {};
  const tooltipLibrary = await loadTooltipLibrary({ categoryRoot, map });
  const tooltipEntries = isObject(tooltipLibrary?.entries) ? tooltipLibrary.entries : {};
  if (tooltipLibrary?.selectedMissing) {
    mapWarnings.push(`tooltip_source: file not found '${normalizeText(tooltipLibrary.configuredPath || map?.tooltip_source?.path || '')}'`);
  } else if (tooltipLibrary?.selectedConfigured && Object.keys(tooltipEntries).length === 0) {
    mapWarnings.push(`tooltip_source: no tooltip entries parsed from '${normalizeText(tooltipLibrary.configuredPath || map?.tooltip_source?.path || '')}'`);
  }

  const expectations = map.expectations || {
    required_fields: [],
    critical_fields: [],
    expected_easy_fields: [],
    expected_sometimes_fields: [],
    deep_fields: []
  };

  const fieldsRuntime = {};
  const fieldsStudio = {};
  const uiFieldCatalogRows = [];
  const knownValues = {};
  const keyMigrations = {};

  let order = 1;
  for (const row of keyRows) {
    const sourceField = row.key;
    const field = sourceField;
    const label = row.label;
    const tooltipEntry = tooltipEntries[field]
      || tooltipEntries[normalizeFieldKey(label)]
      || null;
    const enumValues = stableSortStrings([
      ...toArray(enumLists[field]),
      ...toArray(enumLists[normalizeFieldKey(label)])
    ]);
    if (enumValues.length) {
      knownValues[field] = enumValues;
    }

    let componentType = '';
    const componentTypeMatch = Object.keys(componentDb).find((type) => {
      const token = normalizeFieldKey(type);
      const singular = token.endsWith('s') ? token.slice(0, -1) : token;
      return field === token || field === singular;
    });
    if (componentTypeMatch) {
      componentType = componentTypeMatch;
    }

    const draft = buildFieldRuleDraft({
      key: field,
      label,
      samples: samples.byField[field] || [],
      enumValues,
      componentType,
      tooltipEntry,
      expectations,
      order,
      uiDefaults: map.ui_defaults || {}
    });
    const rawAliasField = normalizeFieldKey(toRawFieldKey(field)) || field;
    const editedOverride = draftFieldOverrides?.[field]
      || draftFieldOverrides?.[label]
      || draftFieldOverrides?.[rawAliasField]
      || null;
    const mapOverride = mapFieldOverrides?.[field]
      || mapFieldOverrides?.[label]
      || mapFieldOverrides?.[rawAliasField]
      || null;
    const override = effectiveFieldOverrides?.[field]
      || effectiveFieldOverrides?.[label]
      || effectiveFieldOverrides?.[rawAliasField]
      || null;
    const outputField = normalizeFieldKey(toRawFieldKey(field)) || field;
    const baselineRule = baselineFieldOverrides?.[outputField]
      || baselineFieldOverrides?.[field]
      || baselineFieldOverrides?.[rawAliasField]
      || null;
    const componentPropertyMeta = resolveComponentPropertyMetaFromMap(map, outputField);
    if (isObject(baselineRule) && !isObject(editedOverride) && !isObject(mapOverride) && !componentPropertyMeta) {
      const passthrough = JSON.parse(JSON.stringify(baselineRule));
      passthrough.key = outputField;
      if (outputField !== field) {
        keyMigrations[field] = outputField;
      }
      const passthroughCanonical = normalizeFieldKey(passthrough.canonical_key || '');
      if (passthroughCanonical && passthroughCanonical !== outputField && passthroughCanonical !== field) {
        keyMigrations[outputField] = passthroughCanonical;
      }
      enforceExpectationPriority({
        key: outputField,
        rule: passthrough,
        expectations
      });
      fieldsRuntime[outputField] = passthrough;
      fieldsStudio[outputField] = buildStudioFieldRule({
        category,
        key: outputField,
        rule: passthrough,
        row,
        map,
        samples: samples.byField[sourceField] || [],
        enumLists,
        componentDb
      });
      const passthroughForUi = mergeFieldOverride(draft, passthrough);
      const passUi = isObject(passthroughForUi.ui) ? passthroughForUi.ui : {};
      const passPriority = isObject(passthroughForUi.priority) ? passthroughForUi.priority : {};
      const passContract = isObject(passthroughForUi.contract) ? passthroughForUi.contract : {};
      const passAliases = orderedUniqueStrings([
        ...toArray(draft.aliases || []),
        ...toArray(passthroughForUi.aliases || [])
      ]).sort((a, b) => a.localeCompare(b));
      const passRequestedCanonical = normalizeFieldKey(passthroughForUi.canonical_key || '');
      const passCanonicalTarget = (
        passRequestedCanonical
        && passRequestedCanonical !== outputField
        && passRequestedCanonical !== field
      )
        ? passRequestedCanonical
        : '';
      const passSurfaces = (
        isObject(passthroughForUi.surfaces) && Object.keys(passthroughForUi.surfaces).length > 0
      )
        ? passthroughForUi.surfaces
        : (isObject(draft.surfaces) ? draft.surfaces : {});
      uiFieldCatalogRows.push({
        key: outputField,
        canonical_key: passCanonicalTarget || outputField,
        label: passUi.label || titleFromKey(outputField),
        group: passUi.group || 'general',
        order: passUi.order || order,
        tooltip_md: passUi.tooltip_md || '',
        aliases: passAliases,
        short_label: normalizeText(passUi.short_label || '') || null,
        prefix: normalizeText(passUi.prefix || '') || null,
        suffix: normalizeText(passUi.suffix || '') || null,
        placeholder: normalizeText(passUi.placeholder || 'unk') || 'unk',
        input_control: normalizeText(passUi.input_control || 'text') || 'text',
        tooltip_key: normalizeText(passUi.tooltip_key || '') || null,
        tooltip_source: normalizeText(passUi.tooltip_source || '') || null,
        guidance_md: normalizeText(passUi.guidance_md || '') || null,
        display_mode: normalizeToken(passUi.display_mode || 'all') || 'all',
        display_decimals: asInt(passUi.display_decimals, 0),
        array_handling: normalizeToken(passUi.array_handling || passthrough.array_handling || 'none') || 'none',
        examples: orderedUniqueStrings(toArray(passUi.examples || [])),
        required_level: normalizeToken(passPriority.required_level || passthrough.required_level || 'optional') || 'optional',
        availability: normalizeToken(passPriority.availability || passthrough.availability || 'sometimes') || 'sometimes',
        difficulty: normalizeToken(passPriority.difficulty || passthrough.difficulty || 'medium') || 'medium',
        effort: asInt(passPriority.effort ?? passthrough.effort, 5),
        type: normalizeToken(passContract.type || passthrough.type || 'string') || 'string',
        shape: normalizeToken(passContract.shape || passthrough.shape || 'scalar') || 'scalar',
        unit: normalizeText(passContract.unit || passthroughForUi.unit || ''),
        surfaces: passSurfaces
      });
      order += 1;
      continue;
    }
    const baseForMerge = isObject(baselineRule)
      ? JSON.parse(JSON.stringify(baselineRule))
      : draft;
    const merged = mergeFieldOverride(baseForMerge, override);
    const requestedCanonical = normalizeFieldKey(merged.canonical_key || '');
    const canonicalTarget = requestedCanonical && requestedCanonical !== outputField && requestedCanonical !== field
      ? requestedCanonical
      : '';
    if (outputField !== field) {
      keyMigrations[field] = outputField;
      merged.aliases = stableSortStrings([...(merged.aliases || []), field, outputField]);
    }
    if (canonicalTarget) {
      keyMigrations[outputField] = canonicalTarget;
    }
    merged.key = outputField;
    merged.canonical_key = canonicalTarget || null;
    if (componentPropertyMeta) {
      merged.type = componentPropertyMeta.type;
      const existingContract = isObject(merged.contract) ? merged.contract : {};
      merged.contract = {
        ...existingContract,
        type: componentPropertyMeta.type
      };
      if (isNumericContractType(componentPropertyMeta.type)) {
        merged.unit = componentPropertyMeta.unit || merged.unit || '';
      } else {
        merged.unit = componentPropertyMeta.unit || '';
      }
      merged.variance_policy = componentPropertyMeta.variance_policy || 'authoritative';
      if (!Array.isArray(merged.constraints) || merged.constraints.length === 0) {
        merged.constraints = componentPropertyMeta.constraints;
      }
      if (!isNumericContractType(componentPropertyMeta.type) && normalizeToken(merged.round || '') !== 'none') {
        merged.round = 'none';
      }
    }
    if (!Array.isArray(merged.constraints)) {
      merged.constraints = buildPropertyConstraintsFromMap(map, outputField);
    }

    if ((merged.enum_policy === 'closed' || merged.enum_policy === 'closed_with_curation') && (!merged.vocab?.known_values || merged.vocab.known_values.length === 0)) {
      merged.enum_policy = 'open_prefer_known';
      merged.vocab = {
        ...(merged.vocab || {}),
        mode: 'open_prefer_known',
        allow_new: true,
        known_values: []
      };
    }
    if (componentType) {
      merged.enum_source = {
        type: 'component_db',
        ref: componentType
      };
      merged.parse_template = 'component_reference';
      merged.parse_rules = parseRulesForTemplate('component_reference', { componentType });
      merged.enum_policy = 'open_prefer_known';
      merged.vocab = {
        ...(merged.vocab || {}),
        mode: 'open_prefer_known',
        allow_new: true
      };
    } else if (enumValues.length > 0) {
      merged.enum_source = {
        type: 'known_values',
        ref: field
      };
    }
    if (componentPropertyMeta && isNumericContractType(componentPropertyMeta.type) && enumValues.length > 0) {
      merged.enum_policy = 'closed';
      merged.enum_source = {
        type: 'known_values',
        ref: field
      };
      merged.vocab = {
        ...(merged.vocab || {}),
        mode: 'closed',
        allow_new: false,
        known_values: stableSortStrings(enumValues),
      };
      merged.new_value_policy = null;
    }
    if ((merged.type === 'boolean' || merged.parse_template === 'boolean_yes_no_unknown') && !toArray(enumLists[field]).length && !toArray(enumLists.yes_no).length) {
      enumLists.yes_no = ['yes', 'no'];
    }
    if ((merged.type === 'boolean' || merged.parse_template === 'boolean_yes_no_unknown')
      && (merged.enum_policy === 'closed' || merged.enum_policy === 'closed_with_curation')
      && (!isObject(merged.enum_source) || !normalizeText(merged.enum_source.ref))) {
      merged.enum_source = {
        type: 'known_values',
        ref: enumLists[field]?.length ? field : 'yes_no'
      };
      if (!toArray(merged.vocab?.known_values).length) {
        merged.vocab = {
          ...(merged.vocab || {}),
          known_values: enumLists[field]?.length
            ? stableSortStrings(enumLists[field])
            : ['yes', 'no']
        };
      }
    }
    if (merged.parse_template === 'latency_list_modes_ms' && (!isObject(merged.object_schema) || Object.keys(merged.object_schema).length === 0)) {
      merged.object_schema = {
        mode: { type: 'string' },
        ms: { type: 'number' },
        source_host: { type: 'string' },
        method: { type: 'string' }
      };
    }
    if (!isObject(merged.ui)) {
      merged.ui = {};
    }
    if (!normalizeText(merged.ui.tooltip_md) && tooltipEntry?.markdown) {
      merged.ui.tooltip_md = tooltipEntry.markdown;
    }
    if (!normalizeText(merged.ui.tooltip_key) && tooltipEntry?.key) {
      merged.ui.tooltip_key = tooltipEntry.key;
    }
    if (!normalizeText(merged.ui.tooltip_source) && tooltipEntry?.source) {
      merged.ui.tooltip_source = tooltipEntry.source;
    }
    if ((merged.enum_policy === 'open' || merged.enum_policy === 'open_prefer_known') && !isObject(merged.new_value_policy)) {
      merged.new_value_policy = {};
    }
    if (merged.enum_policy === 'open' || merged.enum_policy === 'open_prefer_known') {
      merged.new_value_policy = {
        accept_if_evidence: typeof merged.new_value_policy?.accept_if_evidence === 'boolean'
          ? merged.new_value_policy.accept_if_evidence
          : true,
        mark_needs_curation: typeof merged.new_value_policy?.mark_needs_curation === 'boolean'
          ? merged.new_value_policy.mark_needs_curation
          : true,
        suggestion_target: normalizeText(merged.new_value_policy?.suggestion_target)
          || '_suggestions/enums.json'
      };
    }

    const mergedType = normalizeToken(merged.type || merged.contract?.type || 'string') || 'string';
    const mergedShape = normalizeToken(merged.shape || merged.contract?.shape || 'scalar') || 'scalar';
    const mergedEnumValues = stableSortStrings([
      ...toArray(enumLists[outputField]),
      ...toArray(enumLists[normalizeFieldKey(label)])
    ]);
    let mergedParseTemplate = normalizeToken(merged.parse_template || merged.parse?.template || '');
    if (!mergedParseTemplate) {
      mergedParseTemplate = inferParseTemplate({
        key: outputField,
        type: mergedType,
        shape: mergedShape,
        enumValues: mergedEnumValues,
        componentType
      });
    }
    const listParseTemplates = new Set([
      'list_of_tokens_delimited',
      'list_of_numbers_with_unit',
      'list_numbers_or_ranges_with_unit',
      'latency_list_modes_ms',
      'mode_tagged_list',
      'mode_tagged_values'
    ]);
    if (listParseTemplates.has(mergedParseTemplate) && mergedShape !== 'list') {
      mergedParseTemplate = inferParseTemplate({
        key: outputField,
        type: mergedType,
        shape: mergedShape,
        enumValues: mergedEnumValues,
        componentType
      });
      if (listParseTemplates.has(mergedParseTemplate) && mergedShape !== 'list') {
        mergedParseTemplate = mergedType === 'string' ? 'text_field' : mergedParseTemplate;
      }
    }
    if (mergedShape === 'list' && ['text_field', 'string', 'enum_string'].includes(mergedParseTemplate)) {
      mergedParseTemplate = inferParseTemplate({
        key: outputField,
        type: mergedType,
        shape: mergedShape,
        enumValues: mergedEnumValues,
        componentType
      });
    }
    const scalarNumericParseTemplates = new Set([
      'number_with_unit',
      'integer_with_unit',
      'range_number',
    ]);
    const isMergedNumericType = isNumericContractType(mergedType);
    if (!isMergedNumericType && scalarNumericParseTemplates.has(mergedParseTemplate)) {
      mergedParseTemplate = normalizeFieldKey(outputField).includes('date') ? 'date_field' : 'text_field';
      merged.parse_rules = {};
    }
    if (
      isMergedNumericType
      && ['text_field', 'string', 'enum_string', 'date_field'].includes(mergedParseTemplate)
    ) {
      mergedParseTemplate = inferParseTemplate({
        key: outputField,
        type: mergedType,
        shape: mergedShape,
        enumValues: mergedEnumValues,
        componentType,
      });
    }
    if (
      isMergedNumericType
      && !normalizeText(merged.unit || '')
      && ['number_with_unit', 'integer_with_unit'].includes(mergedParseTemplate)
    ) {
      mergedParseTemplate = 'integer_field';
      merged.parse_rules = {};
    }
    merged.parse_template = canonicalParseTemplate(mergedParseTemplate);
    if (!isObject(merged.parse)) {
      merged.parse = {};
    }
    merged.parse.template = merged.parse_template;
    if (!isObject(merged.parse_rules)) {
      merged.parse_rules = {};
    }
    if (mergedShape === 'list') {
      const existingListRules = isObject(merged.list_rules) ? merged.list_rules : {};
      merged.list_rules = {
        dedupe: existingListRules.dedupe !== false,
        sort: normalizeToken(existingListRules.sort || 'none') || 'none',
        min_items: asInt(existingListRules.min_items, 0),
        max_items: asInt(existingListRules.max_items, 100)
      };
      if (
        ['list_of_tokens_delimited', 'list_of_numbers_with_unit', 'list_numbers_or_ranges_with_unit', 'latency_list_modes_ms'].includes(mergedParseTemplate)
        && toArray(merged.parse_rules.delimiters).length === 0
      ) {
        merged.parse_rules.delimiters = [',', '/', '|', ';'];
      }
    }
    if (mergedShape === 'object' && !isObject(merged.object_schema)) {
      merged.object_schema = {};
    }

    if (isObject(merged.selection_policy) && Object.keys(merged.selection_policy).length > 0 && !normalizeText(merged.selection_policy.source_field)) {
      merged.selection_policy = {
        ...merged.selection_policy,
        source_field: field
      };
    }
    if (isObject(merged.enum_source) && normalizeToken(merged.enum_source.type) === 'known_values') {
      const enumRef = normalizeFieldKey(merged.enum_source.ref || field) || field;
      merged.enum_source = {
        type: 'known_values',
        ref: enumRef
      };
      if (!Object.prototype.hasOwnProperty.call(knownValues, enumRef)) {
        knownValues[enumRef] = [];
      }
      const inlineKnownValues = stableSortStrings(toArray(merged.vocab?.known_values));
      if (inlineKnownValues.length > 0) {
        knownValues[enumRef] = stableSortStrings([
          ...toArray(knownValues[enumRef]),
          ...inlineKnownValues
        ]);
      }
      if (enumRef === 'yes_no' && toArray(knownValues[enumRef]).length === 0) {
        knownValues[enumRef] = ['yes', 'no'];
      }
    }

    enforceExpectationPriority({
      key: outputField,
      rule: merged,
      expectations
    });

    fieldsRuntime[outputField] = merged;
    fieldsStudio[outputField] = buildStudioFieldRule({
      category,
      key: outputField,
      rule: merged,
      row,
      map,
      samples: samples.byField[sourceField] || [],
      enumLists,
      componentDb
    });
    uiFieldCatalogRows.push({
      key: outputField,
      canonical_key: merged.canonical_key || outputField,
      label: merged.ui?.label || titleFromKey(outputField),
      group: merged.ui?.group || 'general',
      order: merged.ui?.order || order,
      tooltip_md: merged.ui?.tooltip_md || '',
      aliases: orderedUniqueStrings(toArray(merged.aliases || [])).sort((a, b) => a.localeCompare(b)),
      short_label: normalizeText(merged.ui?.short_label || '') || null,
      prefix: normalizeText(merged.ui?.prefix || '') || null,
      suffix: normalizeText(merged.ui?.suffix || '') || null,
      placeholder: normalizeText(merged.ui?.placeholder || 'unk') || 'unk',
      input_control: normalizeText(merged.ui?.input_control || 'text') || 'text',
      tooltip_key: normalizeText(merged.ui?.tooltip_key || '') || null,
      tooltip_source: normalizeText(merged.ui?.tooltip_source || '') || null,
      guidance_md: normalizeText(merged.ui?.guidance_md || '') || null,
      display_mode: normalizeToken(merged.ui?.display_mode || 'all') || 'all',
      display_decimals: asInt(merged.ui?.display_decimals, 0),
      array_handling: normalizeToken(merged.array_handling || merged.ui?.array_handling || 'none') || 'none',
      examples: stableSortStrings(toArray(merged.ui?.examples || [])),
      required_level: merged.required_level,
      availability: merged.availability,
      difficulty: merged.difficulty,
      effort: asInt(merged.effort, 5),
      type: merged.type,
      shape: merged.shape,
      unit: merged.unit || '',
      surfaces: (isObject(merged.surfaces) && Object.keys(merged.surfaces).length > 0)
        ? merged.surfaces
        : (isObject(draft.surfaces) ? draft.surfaces : {})
    });
    order += 1;
  }
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
    };
  }

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

  const fieldRulesFull = sortDeep({
    version: 1,
    category,
    generated_at: compileTimestamp,
    source_context: compileMode === 'field_studio' ? 'field_studio_map' : 'field_studio_source',
    field_studio_source: {
      path: '',
      hash: null
    },
    field_studio_map_hash: mapHash,
    key_source: {
      sheet: normalizeText(map?.key_list?.sheet || ''),
      range: keySourceRange
    },
    schema: {
      identity_fields: identityKeys,
      required_fields: requiredKeys,
      critical_fields: criticalKeys,
      expected_easy_fields: expectedEasy,
      expected_sometimes_fields: expectedSometimes,
      deep_fields: deepFields,
      include_fields: stableSortStrings(Object.keys(canonicalFields)),
      exclude_fields: ['id', 'brand', 'model', 'base_model', 'category', 'sku'],
      preserve_existing_fields: false
    },
    source_tabs: sourceTabs,
    enum_buckets: enumBuckets,
    component_db_sources: componentDbSources,
    parse_templates: parseTemplates,
    fields: canonicalFields,
    known_values: sortDeep(knownValues),
    key_migrations_suggested: sortDeep(keyMigrations),
    global: buildGlobalContractMetadata()
  });

  const uiFieldCatalog = {
    version: 1,
    category,
    generated_at: compileTimestamp,
    fields: uiFieldCatalogRows.sort((a, b) => (asInt(a.order, 0) - asInt(b.order, 0)) || a.key.localeCompare(b.key))
  };

  const knownValuesArtifact = {
    version: 1,
    category,
    generated_at: compileTimestamp,
    fields: sortDeep(knownValues)
  };

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
      field_rules_full: {
        path: path.join(controlPlaneRoot, 'field_rules.full.json'),
        hash: hashJson(fieldRulesFull)
      },
      field_rules: {
        path: path.join(generatedRoot, 'field_rules.json'),
        hash: currentHash,
        changed
      },
      field_rules_runtime: {
        path: path.join(generatedRoot, 'field_rules.runtime.json'),
        hash: currentHash
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

  await fs.mkdir(controlPlaneRoot, { recursive: true });
  await writeJsonStable(resolvedControlMapPath, map);
  if (resolvedControlMapPath !== controlPlaneFieldStudioMapPath) {
    await writeJsonStable(controlPlaneFieldStudioMapPath, map);
  }
  await writeJsonStable(path.join(controlPlaneRoot, 'field_rules.full.json'), fieldRulesFull);
  const controlPlaneSnapshot = await writeControlPlaneSnapshot({
    controlPlaneRoot,
    fieldStudioMap: map,
    fieldRulesFull,
    note: 'category-compile'
  });
  compileReport.artifacts.control_plane_version = {
    path: controlPlaneSnapshot.path,
    version_id: controlPlaneSnapshot.version_id
  };

  if (validation.errors.length > 0) {
    return {
      category,
      compiled: false,
      field_studio_source_path: resolvedFieldStudioSourcePath,
      field_studio_source_hash: fieldStudioSourceHash,
      map_path: resolvedControlMapPath,
      map_hash: mapHash,
      selected_key_count: keyRows.length,
      errors: compileReport.errors,
      warnings: compileReport.warnings,
      compile_report: compileReport,
      control_plane_version: controlPlaneSnapshot
    };
  }

  await fs.mkdir(generatedRoot, { recursive: true });
  const canonicalPair = await writeCanonicalFieldRulesPair({
    generatedRoot,
    runtimePayload: fieldRulesCanonical
  });
  if (!canonicalPair.identical) {
    compileReport.errors.push('field_rules.json and field_rules.runtime.json must be byte-identical');
    compileReport.compiled = false;
    await writeJsonStable(path.join(generatedRoot, '_compile_report.json'), compileReport);
    return {
      category,
      compiled: false,
      field_studio_source_path: resolvedFieldStudioSourcePath,
      field_studio_source_hash: fieldStudioSourceHash,
      map_path: resolvedControlMapPath,
      map_hash: mapHash,
      selected_key_count: keyRows.length,
      errors: compileReport.errors,
      warnings: compileReport.warnings,
      compile_report: compileReport,
      control_plane_version: controlPlaneSnapshot
    };
  }
  compileReport.artifacts.field_rules.hash = canonicalPair.field_rules_hash;
  compileReport.artifacts.field_rules_runtime.hash = canonicalPair.field_rules_runtime_hash;
  compileReport.artifacts.field_rules_runtime.identical_to_field_rules = true;
  compileReport.artifacts.field_rules_runtime.bytes = canonicalPair.bytes;
  await writeJsonStable(path.join(generatedRoot, 'ui_field_catalog.json'), uiFieldCatalog);
  await writeJsonStable(path.join(generatedRoot, 'known_values.json'), knownValuesArtifact);
  await fs.rm(path.join(generatedRoot, 'schema.json'), { force: true });
  await fs.rm(path.join(generatedRoot, 'required_fields.json'), { force: true });
  if (Object.keys(keyMigrations).length > 0) {
    const keyMigrationsEnvelope = {
      bump: 'patch',
      key_map: sortDeep(keyMigrations),
      migrations: Object.entries(keyMigrations).map(([from, to]) => ({
        from,
        reason: 'auto-generated from key map',
        to,
        type: 'rename'
      })),
      previous_version: '1.0.0',
      summary: { added_count: 0, changed_count: 0, removed_count: 0 },
      version: '1.0.0'
    };
    await writeJsonStable(path.join(generatedRoot, 'key_migrations.json'), keyMigrationsEnvelope);
  } else {
    await fs.rm(path.join(generatedRoot, 'key_migrations.json'), { force: true });
  }

  const componentRoot = path.join(generatedRoot, 'component_db');
  await fs.rm(componentRoot, { recursive: true, force: true });
  await fs.mkdir(componentRoot, { recursive: true });
  const componentTypeOutputName = {
    sensor: 'sensors',
    switch: 'switches',
    encoder: 'encoders',
    mcu: 'mcus',
    material: 'materials'
  };
  applyKeyLevelConstraintsToEntities(componentDb, fieldsRuntime);

  // Merge component overrides from _overrides/components/ into compiled output
  const componentOverrideDir = path.join(categoryRoot, '_overrides', 'components');
  const componentOverrides = {};
  try {
    const overrideEntries = await fs.readdir(componentOverrideDir, { withFileTypes: true });
    for (const entry of overrideEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const ovr = JSON.parse(await fs.readFile(path.join(componentOverrideDir, entry.name), 'utf8'));
        if (ovr?.componentType && ovr?.name && isObject(ovr?.properties)) {
          const typeKey = normalizeToken(ovr.componentType);
          if (!componentOverrides[typeKey]) componentOverrides[typeKey] = {};
          componentOverrides[typeKey][normalizeToken(ovr.name)] = ovr.properties;
        }
      } catch { /* skip corrupt override files */ }
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  for (const [componentType, rows] of Object.entries(componentDb)) {
    // Apply overrides to matching entities
    const typeOverrides = componentOverrides[normalizeToken(componentType)] || {};
    for (const entity of rows) {
      const entityKey = normalizeToken(entity.name || '');
      const ovr = typeOverrides[entityKey];
      if (ovr && isObject(entity.properties)) {
        for (const [prop, val] of Object.entries(ovr)) {
          if (val !== undefined && val !== null && val !== '') {
            entity.properties[prop] = val;
            if (!entity.__overridden) entity.__overridden = {};
            entity.__overridden[prop] = true;
          }
        }
      }
    }
    const payload = {
      version: 1,
      category,
      component_type: componentType,
      generated_at: compileTimestamp,
      items: rows
    };
    const outputName = normalizeText(componentTypeOutputName[normalizeToken(componentType)] || componentType) || componentType;
    await writeJsonStable(path.join(componentRoot, `${outputName}.json`), payload);
  }

  const suggestionsRoot = path.join(categoryRoot, '_suggestions');
  await fs.mkdir(suggestionsRoot, { recursive: true });
  const suggestionDefaults = {
    enums: { version: 1, category, suggestions: [] },
    components: { version: 1, category, suggestions: [] },
    lexicon: { version: 1, category, suggestions: [] },
    constraints: { version: 1, category, suggestions: [] }
  };
  for (const [name, payload] of Object.entries(suggestionDefaults)) {
    const filePath = path.join(suggestionsRoot, `${name}.json`);
    if (!(await fileExists(filePath))) {
      await writeJsonStable(filePath, payload);
    }
  }
  await fs.mkdir(path.join(categoryRoot, '_overrides'), { recursive: true });

  await writeJsonStable(path.join(generatedRoot, '_compile_report.json'), compileReport);

  return {
    category,
    compiled: true,
    field_studio_source_path: '',
    field_studio_source_hash: null,
    map_path: resolvedControlMapPath,
    map_hash: mapHash,
    generated_root: generatedRoot,
    field_count: Object.keys(fieldsRuntime).length,
    selected_key_count: keyRows.length,
    warnings: compileReport.warnings,
    errors: [],
    compile_report: compileReport,
    control_plane_version: controlPlaneSnapshot
  };
}

