import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../shared/primitives.js';
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
  enforceExpectationPriority
} from './compileFieldInference.js';
import {
  buildPropertyConstraintsFromMap,
  resolveComponentPropertyMetaFromMap,
  resolveComponentIdentityProjectionMetaFromMap,
  applyKeyLevelConstraintsToEntities,
  buildComponentSourceSummary,
  declaredComponentPropertyKeysFromMap,
  declaredComponentTypesFromMap
} from './compileComponentHelpers.js';
import {
  mergeFieldOverride,
  defaultParseRules,
  buildFieldRuleDraft,
  buildStudioFieldRule,
  BOOLEAN_ENUM_VALUES,
  createBooleanEnumSource
} from './compileFieldRuleBuilder.js';
import {
  buildParseTemplateCatalog,
  buildCompileValidation
} from './compileValidation.js';
import {
  writeJsonStable,
  writeCanonicalFieldRulesPair,
  diffFieldRuleSets,
  readJsonIfExists,
  resolveControlPlaneMapPaths,
  loadFieldStudioMap,
  saveFieldStudioMap,
  normalizeKnownValuesFieldsDoc,
  loadGeneratedComponentDbForCompile,
  buildFallbackKeyRows
} from './compileFileIo.js';
import { writeCompileOutput } from './compileOutputWriter.js';
import { assembleCompileOutput } from './compileAssembler.js';
import { loadCompileContext } from './compileContextLoader.js';

// Re-export loadFieldStudioMap and saveFieldStudioMap for backward compatibility
export { loadFieldStudioMap, saveFieldStudioMap };

function enforceBooleanEnumContract(rule, enumLists = {}) {
  const typeCandidates = [
    rule?.contract?.type,
    rule?.type,
    rule?.data_type,
  ].map((value) => normalizeToken(value)).filter(Boolean);
  if (!typeCandidates.includes('boolean')) return;
  enumLists.yes_no = stableSortStrings([
    ...toArray(enumLists.yes_no),
    ...BOOLEAN_ENUM_VALUES
  ]);
  rule.type = 'boolean';
  rule.shape = 'scalar';
  rule.value_form = 'scalar';
  rule.unit = '';
  rule.round = 'none';
  rule.contract = {
    ...(isObject(rule.contract) ? rule.contract : {}),
    type: 'boolean',
    shape: 'scalar'
  };
  delete rule.contract.unit;
  delete rule.contract.range;
  delete rule.contract.rounding;
  delete rule.contract.list_rules;
  rule.enum_policy = 'closed';
  rule.enum_source = createBooleanEnumSource();
  rule.vocab = {
    ...(rule.vocab || {}),
    mode: 'closed',
    allow_new: false,
    known_values: [...BOOLEAN_ENUM_VALUES]
  };
  rule.new_value_policy = null;
}

const KEY_MATCHED_ENUM_POLICIES = new Set(['closed', 'closed_with_curation', 'open_prefer_known']);

function enumSourceIsComponentDb(rule) {
  const nestedSource = typeof rule?.enum?.source === 'string' ? rule.enum.source : '';
  if (nestedSource.startsWith('component_db.')) return true;
  const flatSource = rule?.enum_source;
  if (typeof flatSource === 'string') return flatSource.startsWith('component_db.');
  return isObject(flatSource) && normalizeToken(flatSource.type) === 'component_db';
}

function setNestedEnumSource(rule, source) {
  rule.enum = {
    ...(isObject(rule.enum) ? rule.enum : {}),
    source,
  };
}

function enforceKeyMatchedEnumSource(rule, fieldKey) {
  const policy = normalizeToken(rule?.enum_policy || rule?.enum?.policy || '');
  if (!policy) return;
  if (policy === 'open') {
    if (enumSourceIsComponentDb(rule)) {
      rule.enum_policy = 'open_prefer_known';
      rule.enum = {
        ...(isObject(rule.enum) ? rule.enum : {}),
        policy: 'open_prefer_known',
      };
      return;
    }
    rule.enum_source = null;
    setNestedEnumSource(rule, null);
    return;
  }
  if (!KEY_MATCHED_ENUM_POLICIES.has(policy) || enumSourceIsComponentDb(rule)) return;
  const enumRef = normalizeFieldKey(fieldKey);
  if (!enumRef) return;
  rule.enum_source = {
    type: 'known_values',
    ref: enumRef,
  };
  rule.enum = {
    ...(isObject(rule.enum) ? rule.enum : {}),
    policy,
    source: `data_lists.${enumRef}`,
  };
}

function registerRuleKnownValues(rule, fallbackField, knownValues) {
  if (!isObject(rule.enum_source) || normalizeToken(rule.enum_source.type) !== 'known_values') return;
  const enumRef = normalizeFieldKey(rule.enum_source.ref || fallbackField) || fallbackField;
  rule.enum_source = {
    type: 'known_values',
    ref: enumRef
  };
  if (!Object.prototype.hasOwnProperty.call(knownValues, enumRef)) {
    knownValues[enumRef] = [];
  }
  const inlineKnownValues = stableSortStrings(toArray(rule.vocab?.known_values));
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

export async function compileCategoryFieldStudio({
  category,
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  workbookMap = null,
  config = {},
  mapPath = null,
  forceSourceExtraction = false
}) {
  const ctx = await loadCompileContext({
    category, fieldStudioSourcePath, fieldStudioMap, workbookMap, config, mapPath, forceSourceExtraction,
  });
  if (ctx.earlyReturn) return ctx.earlyReturn;

  const {
    categoryRoot, controlPlaneRoot, generatedRoot,
    controlPlaneFieldStudioMapPath, resolvedControlMapPath,
    map, mapWarnings, mapHash,
    resolvedFieldStudioSourcePath, fieldStudioSourceHash,
    compileMode, compileTimestamp,
    baselineFieldRules, baselineFieldOverrides, effectiveFieldOverrides, mapFieldOverrides, draftFieldOverrides,
    previousCompileReport, previousGeneratedFieldRules,
    keyRows, samples, enumLists,
    componentDb, componentSourceAssertions, componentSourceStats,
    tooltipEntries, expectations,
  } = ctx;

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
    // WHY: Phase 4 — match the field key against component types declared in
    // EITHER the generated componentDb OR the field_studio_map.component_sources.
    // The map declaration alone is enough to mark a field as a component parent
    // and stamp enum.source = component_db.<type>; previously we required a
    // seeded componentDb entry, which left newly-declared components without
    // their self-lock and tripped INV-1 at compile time.
    const declaredFromMap = declaredComponentTypesFromMap(map);
    const candidateTypes = new Set([
      ...Object.keys(componentDb || {}),
      ...declaredFromMap,
    ]);
    const componentTypeMatch = [...candidateTypes].find((type) => {
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
    const componentIdentityProjectionMeta = resolveComponentIdentityProjectionMetaFromMap(map, outputField);
    if (
      isObject(baselineRule)
      && !isObject(editedOverride)
      && !isObject(mapOverride)
      && !componentPropertyMeta
      && !componentIdentityProjectionMeta
    ) {
      const passthrough = JSON.parse(JSON.stringify(baselineRule));
      passthrough.key = outputField;
      if (outputField !== field) {
        keyMigrations[field] = outputField;
      }
      const passthroughCanonical = normalizeFieldKey(passthrough.canonical_key || '');
      if (passthroughCanonical && passthroughCanonical !== outputField && passthroughCanonical !== field) {
        keyMigrations[outputField] = passthroughCanonical;
      }
      enforceBooleanEnumContract(passthrough, enumLists);
      enforceKeyMatchedEnumSource(passthrough, outputField);
      registerRuleKnownValues(passthrough, outputField, knownValues);
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
        placeholder: normalizeText(passUi.placeholder || '') || '',
        tooltip_key: normalizeText(passUi.tooltip_key || '') || null,
        tooltip_source: normalizeText(passUi.tooltip_source || '') || null,
        guidance_md: normalizeText(passUi.guidance_md || '') || null,
        display_mode: normalizeToken(passUi.display_mode || 'all') || 'all',
        display_decimals: asInt(passUi.display_decimals, 0),
        array_handling: normalizeToken(passUi.array_handling || passthrough.array_handling || 'none') || 'none',
        examples: orderedUniqueStrings(toArray(passUi.examples || [])),
        required_level: normalizeToken(passPriority.required_level || passthrough.required_level || 'non_mandatory') || 'non_mandatory',
        availability: normalizeToken(passPriority.availability || passthrough.availability || 'sometimes') || 'sometimes',
        difficulty: normalizeToken(passPriority.difficulty || passthrough.difficulty || 'medium') || 'medium',
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
    if (componentIdentityProjectionMeta) {
      merged.type = componentIdentityProjectionMeta.type;
      merged.shape = 'scalar';
      merged.value_form = 'scalar';
      merged.unit = '';
      merged.round = 'none';
      merged.contract = {
        ...(isObject(merged.contract) ? merged.contract : {}),
        type: componentIdentityProjectionMeta.type,
        shape: 'scalar',
      };
      if (componentIdentityProjectionMeta.type === 'url') {
        merged.enum_policy = 'open';
        merged.enum_source = null;
        merged.enum = {
          ...(isObject(merged.enum) ? merged.enum : {}),
          policy: 'open',
          source: null,
        };
      } else {
        merged.enum_policy = componentIdentityProjectionMeta.enum_policy;
        merged.enum_source = {
          type: 'known_values',
          ref: outputField,
        };
        merged.enum = {
          ...(isObject(merged.enum) ? merged.enum : {}),
          policy: componentIdentityProjectionMeta.enum_policy,
          source: `data_lists.${outputField}`,
        };
      }
      merged.vocab = {
        ...(isObject(merged.vocab) ? merged.vocab : {}),
        mode: componentIdentityProjectionMeta.type === 'url' ? 'open' : (merged.vocab?.mode || componentIdentityProjectionMeta.enum_policy),
        allow_new: true,
        known_values: stableSortStrings(toArray(merged.vocab?.known_values || [])),
      };
      merged.new_value_policy = isObject(merged.new_value_policy)
        ? merged.new_value_policy
        : {
          accept_if_evidence: true,
          mark_needs_curation: true,
        };
      merged.parse_rules = {
        ...defaultParseRules(componentIdentityProjectionMeta.type, 'scalar'),
        ...(isObject(merged.parse_rules) ? merged.parse_rules : {}),
      };
      merged.component_identity_projection = {
        component_type: componentIdentityProjectionMeta.component_type,
        facet: componentIdentityProjectionMeta.facet,
      };
      merged.field_studio_hints = {
        ...(isObject(merged.field_studio_hints) ? merged.field_studio_hints : {}),
        related_to: componentIdentityProjectionMeta.component_type,
        component_identity_facet: componentIdentityProjectionMeta.facet,
      };
      merged.ui = {
        ...(isObject(merged.ui) ? merged.ui : {}),
        label: componentIdentityProjectionMeta.label,
        group: normalizeText(merged.ui?.group || '') || componentIdentityProjectionMeta.group,
      };
    }
    if (!Array.isArray(merged.constraints)) {
      merged.constraints = buildPropertyConstraintsFromMap(map, outputField);
    }

    if (componentType) {
      merged.enum_source = {
        type: 'component_db',
        ref: componentType
      };
      merged.parse_rules = defaultParseRules(merged.type || 'string', merged.shape || 'scalar', { componentType });
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
    enforceKeyMatchedEnumSource(merged, outputField);
    enforceBooleanEnumContract(merged, enumLists);
    // WHY: latency_list_modes_ms template retired. Latency fields split into scalar keys in Phase 3.
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
          : true
      };
    }

    const mergedType = normalizeToken(merged.type || merged.contract?.type || 'string') || 'string';
    const mergedShape = normalizeToken(merged.shape || merged.contract?.shape || 'scalar') || 'scalar';
    const mergedEnumValues = stableSortStrings([
      ...toArray(enumLists[outputField]),
      ...toArray(enumLists[normalizeFieldKey(label)])
    ]);
    // WHY: Type-driven — no parse_template inference or reconciliation.
    // Type+shape is the contract. parse_template is not emitted.
    delete merged.parse_template;
    if (!isObject(merged.parse)) {
      merged.parse = {};
    }
    delete merged.parse.template;
    if (!isObject(merged.parse_rules)) {
      merged.parse_rules = {};
    }
    if (mergedShape === 'list') {
      const existingListRules = isObject(merged.list_rules) ? merged.list_rules : {};
      merged.list_rules = {
        dedupe: existingListRules.dedupe !== false,
        sort: normalizeToken(existingListRules.sort || 'none') || 'none'
      };
      // WHY: Default delimiters for list fields — ensures deterministic output across compile cycles.
      const defaultDelimiters = [',', '/', '|', ';'];
      if (toArray(merged.parse_rules.delimiters).length === 0) {
        merged.parse_rules.delimiters = defaultDelimiters;
      }
      if (!isObject(merged.parse)) merged.parse = {};
      if (toArray(merged.parse.delimiters).length === 0) {
        merged.parse.delimiters = [...merged.parse_rules.delimiters];
      }
    }

    if (isObject(merged.selection_policy) && Object.keys(merged.selection_policy).length > 0 && !normalizeText(merged.selection_policy.source_field)) {
      merged.selection_policy = {
        ...merged.selection_policy,
        source_field: field
      };
    }
    registerRuleKnownValues(merged, outputField, knownValues);

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
      placeholder: normalizeText(merged.ui?.placeholder || '') || '',
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
      type: merged.type,
      shape: merged.shape,
      unit: merged.unit || '',
      surfaces: (isObject(merged.surfaces) && Object.keys(merged.surfaces).length > 0)
        ? merged.surfaces
        : (isObject(draft.surfaces) ? draft.surfaces : {})
    });
    order += 1;
  }
  const {
    earlyReturn: assemblyEarlyReturn,
    fieldRulesCanonical,
    uiFieldCatalog,
    knownValuesArtifact,
    compileReport,
    validation,
  } = assembleCompileOutput({
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
  });
  if (assemblyEarlyReturn) return assemblyEarlyReturn;

  const { controlPlaneSnapshot, earlyReturn: writeEarlyReturn } = await writeCompileOutput({
    controlPlaneRoot,
    controlPlaneFieldStudioMapPath,
    resolvedControlMapPath,
    generatedRoot,
    categoryRoot,
    map,
    fieldRulesCanonical,
    uiFieldCatalog,
    knownValuesArtifact,
    compileReport,
    validation,
    componentDb,
    fieldsRuntime,
    keyMigrations,
    category,
    compileTimestamp,
    resolvedFieldStudioSourcePath,
    fieldStudioSourceHash,
    mapHash,
    keyRows,
  });
  if (writeEarlyReturn) return writeEarlyReturn;

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
