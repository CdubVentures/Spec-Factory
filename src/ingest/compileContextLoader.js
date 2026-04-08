// WHY: Extracted from categoryCompile.js — setup and data-loading phase.
// Handles path resolution, map loading/normalization, baseline loading,
// previous state loading, enum/tooltip loading, key row extraction.

import path from 'node:path';
import { nowIso } from '../shared/primitives.js';
import {
  toArray,
  isObject,
  normalizeText,
  normalizeFieldKey,
  titleFromKey,
  orderedUniqueStrings,
  hashJson,
  fileExists,
} from './compileUtils.js';
import { normalizeFieldStudioMap } from './compileMapNormalization.js';
import { loadTooltipLibrary } from './compileTooltipParser.js';
import {
  readJsonIfExists,
  resolveControlPlaneMapPaths,
  loadFieldStudioMap,
  normalizeKnownValuesFieldsDoc,
  loadGeneratedComponentDbForCompile,
  buildFallbackKeyRows,
} from './compileFileIo.js';
import { declaredComponentPropertyKeysFromMap } from './compileComponentHelpers.js';
import { EG_LOCKED_KEYS, getEgPresetForKey, preserveEgEditablePaths } from '../features/studio/index.js';

export async function loadCompileContext({
  category,
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  workbookMap = null,
  config = {},
  mapPath = null,
  forceSourceExtraction = false,
}) {
  if (!normalizeText(category)) {
    throw new Error('category_required');
  }
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
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
      earlyReturn: {
        category,
        compiled: false,
        field_studio_source_path: resolvedFieldStudioSourcePath,
        field_studio_source_hash: null,
        map_path: resolvedControlMapPath,
        map_hash: hashJson(mapValidation.normalized),
        errors: mapValidation.errors,
        warnings: mapValidation.warnings
      },
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
    { source: 'generated', path: path.join(generatedRoot, 'field_rules.json') }
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

  // WHY: Ensure EG-locked defaults always appear in compiled output, even if
  // the category's field_studio_map was created before this default existed.
  // O(1): derived from EG_PRESET_REGISTRY — new registry entries auto-compile.
  // Read live color names from the color_registry JSON so the compiled
  // reasoning_note reflects the current registry (not an empty list).
  const colorRegistryDoc = await readJsonIfExists(path.join(helperRoot, '_global', 'color_registry.json'));
  const compileColorNames = (colorRegistryDoc && typeof colorRegistryDoc.colors === 'object')
    ? Object.keys(colorRegistryDoc.colors)
    : [];
  const egCtx = compileColorNames.length > 0 ? { colorNames: compileColorNames } : undefined;
  // WHY: EG-locked fields always use the current preset as SSOT. If the saved
  // map has a stale override (e.g., enum_policy was 'open' before registry close),
  // the preset must win. Editable paths (ui.aliases, search_hints) are preserved.
  for (const k of EG_LOCKED_KEYS) {
    const preset = getEgPresetForKey(k, egCtx);
    const current = effectiveFieldOverrides[k];
    if (current && preset) {
      effectiveFieldOverrides[k] = preserveEgEditablePaths(current, preset);
    } else {
      effectiveFieldOverrides[k] = preset;
    }
  }

  const previousUiFieldCatalog = await readJsonIfExists(path.join(generatedRoot, 'ui_field_catalog.json'));
  // WHY: no carry-forward of previous known_values — only current map sources are authoritative.
  const extractedKeyRows = buildFallbackKeyRows({
    map,
    baselineFieldRules,
    baselineUiFieldCatalog: previousUiFieldCatalog
  });
  const selectedKeySet = new Set(toArray(map.selected_keys).map((field) => normalizeFieldKey(field)).filter(Boolean));
  // WHY: Ensure EG-locked keys are always in the selected set for compile.
  for (const k of EG_LOCKED_KEYS) { selectedKeySet.add(k); }
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
  // WHY: EG-locked keys must appear in candidateKeyRows so the selectedKeySet
  // filter keeps them. Without this, they're in the selected set but absent
  // from candidates, so the filter drops them.
  const egKeyRows = EG_LOCKED_KEYS
    .filter((k) => !extractedKeySet.has(k) && !componentPropertyKeySet.has(k))
    .map((k) => ({ row: 0, label: titleFromKey(k), key: k }));
  const candidateKeyRows = [...extractedKeyRows, ...declaredOnlyKeyRows, ...egKeyRows];
  const keyRows = selectedKeySet.size > 0
    ? candidateKeyRows.filter((row) => (
      selectedKeySet.has(normalizeFieldKey(row.key))
      || componentPropertyKeySet.has(normalizeFieldKey(row.key))
    ))
    : candidateKeyRows;
  if (!keyRows.length) {
    return {
      earlyReturn: {
        category,
        compiled: false,
        field_studio_source_path: resolvedFieldStudioSourcePath,
        field_studio_source_hash: fieldStudioSourceHash,
        map_path: resolvedControlMapPath,
        map_hash: mapHash,
        errors: [selectedKeySet.size > 0 ? 'selected_keys_filtered_all_extracted_keys' : 'no_keys_extracted_from_key_list'],
        warnings: mapValidation.warnings
      },
    };
  }

  const samples = {
    byField: {},
    columns: []
  };
  const enumLists = {};
  // Merge manual_enum_values into pulled enum lists
  const manualEnumValues2 = isObject(map.manual_enum_values) ? map.manual_enum_values : {};
  for (const [field, values] of Object.entries(manualEnumValues2)) {
    const nf = normalizeFieldKey(field);
    if (!nf) continue;
    const existing = toArray(enumLists[nf]);
    const manual = toArray(values).map((v) => String(v).trim()).filter(Boolean);
    enumLists[nf] = orderedUniqueStrings([...existing, ...manual]);
  }
  // WHY: Color registry is a closed vocabulary. Inject all registered names
  // into enumLists so the compile chain generates closed known_values.
  if (compileColorNames.length > 0) {
    enumLists['colors'] = orderedUniqueStrings([
      ...toArray(enumLists['colors']),
      ...compileColorNames,
    ]);
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

  return {
    earlyReturn: null,
    helperRoot,
    categoryRoot,
    controlPlaneRoot,
    generatedRoot,
    controlPlaneFieldStudioMapPath,
    resolvedControlMapPath,
    map,
    mapWarnings,
    mapHash,
    resolvedFieldStudioSourcePath,
    fieldStudioSourceHash,
    compileMode,
    compileTimestamp,
    baselineFieldRules,
    baselineFieldOverrides,
    effectiveFieldOverrides,
    mapFieldOverrides,
    draftFieldOverrides,
    previousCompileReport,
    previousGeneratedFieldRules,
    keyRows,
    samples,
    enumLists,
    componentDb,
    componentSourceAssertions,
    componentSourceStats,
    tooltipEntries,
    expectations,
  };
}
