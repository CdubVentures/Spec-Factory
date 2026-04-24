import path from 'node:path';
import {
  toArray,
  isObject,
  asInt,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  normalizeSourceMode,
  normalizeReviewPriority,
  normalizeReviewAiAssist,
  stableSortStrings,
  orderedUniqueStrings,
  colToIndex,
  parseRange,
  isNumericContractType
} from './compileUtils.js';
import { EG_LOCKED_KEYS as EG_LOCKED_KEYS_LIST } from '../features/studio/contracts/egPresets.js';

// WHY: Variant-generator keys must always promote to product fields even if
// authors mistakenly mark them component_only.
const EG_LOCKED_KEYS = new Set(EG_LOCKED_KEYS_LIST);
const LEGACY_VARIANT_INVENTORY_ACTIVE_MODES = new Set(['default', 'append', 'override']);

// WHY: Walk normalized component_sources, return Set of keys flagged
// component_only — except EG-locked keys which override the flag.
function collectComponentOnlyKeys(componentSheets) {
  const out = new Set();
  for (const row of toArray(componentSheets)) {
    if (!isObject(row)) continue;
    const props = isObject(row.roles) ? toArray(row.roles.properties) : [];
    for (const prop of props) {
      if (!isObject(prop)) continue;
      if (prop.component_only !== true) continue;
      const key = normalizeFieldKey(prop.field_key || prop.key || '');
      if (key && !EG_LOCKED_KEYS.has(key)) out.add(key);
    }
  }
  return out;
}

// WHY: A key marked component_only in component_sources cannot also live in
// selected_keys (they're mutually exclusive intents). Auto-prune with a
// warning so the user knows what happened at compile time.
function pruneComponentOnlySelected(selectedKeys, componentSheets, warnings) {
  const componentOnly = collectComponentOnlyKeys(componentSheets);
  if (componentOnly.size === 0) return selectedKeys;
  const out = [];
  for (const key of selectedKeys) {
    if (componentOnly.has(key)) {
      if (warnings) warnings.push(`selected_keys: '${key}' removed because it is declared component_only in component_sources`);
      continue;
    }
    out.push(key);
  }
  return out;
}

function guessComponentType(sheetName) {
  const token = normalizeToken(sheetName);
  if (token.includes('sensor')) return 'sensor';
  if (token.includes('switch')) return 'switch';
  if (token.includes('encoder')) return 'encoder';
  if (token.includes('mcu')) return 'mcu';
  if (token.includes('material')) return 'material';
  return 'component';
}

const REAL_ENUM_BUCKET_ALLOWLIST = new Set([
  'yes_no', 'connection', 'connectivity', 'form_factor', 'shape', 'hump',
  'front_flare', 'sensor_type', 'mcu', 'switch_type', 'lighting',
  'feet_material', 'lift_notes', 'coating', 'polling'
]);

const ENUM_BUCKET_ALIASES = {
  yesno: 'yes_no', yes_no: 'yes_no',
  switches: 'switch_type', switches_type: 'switch_type',
  polling_rate: 'polling'
};

function normalizeEnumBucketName(value) {
  const token = normalizeFieldKey(value);
  if (!token) return '';
  return ENUM_BUCKET_ALIASES[token] || token;
}

function enumBucketExplicitlyAllowed(row = {}) {
  return row?.allow === true
    || row?.include === true
    || row?.explicit_allow === true
    || row?.whitelisted === true;
}

export function isAllowedEnumBucket(bucket = '') {
  return REAL_ENUM_BUCKET_ALLOWLIST.has(normalizeEnumBucketName(bucket));
}

function shouldKeepEnumBucket({ requestedBucket = '', headerBucket = '', row = {} } = {}) {
  const requested = normalizeEnumBucketName(requestedBucket);
  const header = normalizeEnumBucketName(headerBucket);
  if (enumBucketExplicitlyAllowed(row)) return requested || header;
  if (header && isAllowedEnumBucket(header)) return header;
  if (requested && isAllowedEnumBucket(requested)) return requested;
  return '';
}

function normalizeSheetRoleRow(row = {}) {
  return {
    sheet: normalizeText(row.sheet),
    role: normalizeToken(row.role || 'ignore')
  };
}

// WHY: evidence_required and conflict_policy were retired. Strip from field_overrides
// so control-plane maps don't perpetuate stale keys through save cycles.
// Also strip empty ai_assist blocks that leak from compiled defaults via the
// frontend auto-save round-trip (compiled rules → GET → auto-save → PUT → JSON).
function hasAuthoredVariantInventoryUsage(aiAssist) {
  const raw = aiAssist?.variant_inventory_usage;
  if (!isObject(raw)) return false;
  if (typeof raw.enabled === 'boolean') return true;
  const legacyMode = normalizeToken(raw.mode);
  return legacyMode === 'off' || LEGACY_VARIANT_INVENTORY_ACTIVE_MODES.has(legacyMode);
}

function hasAuthoredPifPriorityImages(aiAssist) {
  const raw = aiAssist?.pif_priority_images;
  if (typeof raw === 'boolean') return true;
  return isObject(raw) && typeof raw.enabled === 'boolean';
}

function stripRetiredEvidenceKnobs(overrides) {
  if (!isObject(overrides)) return overrides;
  const cleaned = {};
  for (const [key, rule] of Object.entries(overrides)) {
    if (!isObject(rule)) { cleaned[key] = rule; continue; }
    const { evidence_required: _er, ...rest } = rule;
    if (isObject(rest.evidence)) {
      const { required: _req, conflict_policy: _cp, ...restEv } = rest.evidence;
      rest.evidence = restEv;
    }
    // WHY: Empty ai_assist blocks (reasoning_note: "") are compiled defaults,
    // not user-authored overrides. Strip them so they don't pollute the
    // source-controlled control-plane map on every save cycle.
    if (
      isObject(rest.ai_assist)
      && !normalizeText(rest.ai_assist.reasoning_note)
      && !hasAuthoredVariantInventoryUsage(rest.ai_assist)
      && !hasAuthoredPifPriorityImages(rest.ai_assist)
    ) {
      delete rest.ai_assist;
    }
    cleaned[key] = rest;
  }
  return cleaned;
}

export function normalizeFieldStudioMap(map = {}, { warnings = null } = {}) {
  const sheetRoles = toArray(map.sheet_roles).map((row) => normalizeSheetRoleRow(row));
  const keySourceRaw = isObject(map.key_source) ? map.key_source : {};
  const keyListRaw = isObject(map.key_list) ? map.key_list : {};
  const keyRange = normalizeText(keyListRaw.range || keySourceRaw.range);
  const parsedKeyRange = parseRange(keyRange);
  const keySourceToken = normalizeToken(
    keyListRaw.source
    || keySourceRaw.source
    || (keyRange ? 'range' : (normalizeText(keyListRaw.named_range || keySourceRaw.named_range) ? 'named_range' : 'column_range'))
  ) || 'column_range';
  const keyColumnFallback = parsedKeyRange?.startColumn || normalizeText(keyListRaw.column || keySourceRaw.column || 'A').toUpperCase();
  const keyRowStartFallback = parsedKeyRange?.startRow || asInt(keyListRaw.row_start || keySourceRaw.row_start || keySourceRaw.start_row, 1);
  const keyRowEndFallback = parsedKeyRange?.endRow || asInt(keyListRaw.row_end || keySourceRaw.row_end || keySourceRaw.end_row, 0);
  const keyList = {
    sheet: normalizeText(keyListRaw.sheet || keySourceRaw.sheet),
    source: keySourceToken === 'table_column' ? 'column_range' : keySourceToken,
    named_range: normalizeText(keyListRaw.named_range || keySourceRaw.named_range),
    range: keyRange,
    column: keyColumnFallback,
    row_start: keyRowStartFallback,
    row_end: keyRowEndFallback
  };
  const hasKeyList = Boolean(keyList.sheet);

  const samplingRaw = isObject(map.sampling) ? map.sampling : {};
  const productRaw = isObject(map.product_table) ? map.product_table : {};
  const productTable = (productRaw.sheet || samplingRaw.sheet)
    ? {
      sheet: normalizeText(productRaw.sheet || samplingRaw.sheet),
      layout: normalizeToken(productRaw.layout || samplingRaw.layout || 'matrix'),
      key_column: normalizeText(productRaw.key_column || samplingRaw.key_column || keyList.column || 'A').toUpperCase(),
      header_row: asInt(productRaw.header_row || samplingRaw.header_row, 1),
      data_row_start: asInt(productRaw.data_row_start || samplingRaw.data_row_start || samplingRaw.first_key_row, 2),
      brand_row: asInt(productRaw.brand_row || samplingRaw.brand_row, 3),
      model_row: asInt(productRaw.model_row || samplingRaw.model_row, 4),
      variant_row: asInt(productRaw.variant_row || samplingRaw.variant_row, 5),
      id_row: asInt(productRaw.id_row, 0),
      identifier_row: asInt(productRaw.identifier_row, 0),
      value_col_start: normalizeText(productRaw.value_col_start || samplingRaw.value_col_start || samplingRaw.value_start_column || 'C').toUpperCase(),
      value_col_end: normalizeText(productRaw.value_col_end || samplingRaw.value_col_end || '').toUpperCase(),
      sample_columns: asInt(productRaw.sample_columns || samplingRaw.sample_columns || samplingRaw.sample_count, 0)
    }
    : null;

  const dataListsRaw = toArray(map.data_lists).filter((row) => isObject(row));
  const enumRowsRaw = dataListsRaw.length > 0
    ? dataListsRaw.filter((row) => normalizeSourceMode(row.mode) === 'sheet')
    : (toArray(map.enum_lists).length > 0 ? toArray(map.enum_lists) : toArray(map.enum_sources));
  const enumLists = [];
  for (const row of enumRowsRaw) {
    if (!isObject(row)) {
      continue;
    }
    const rowSheet = normalizeText(row.sheet);
    const rowStart = asInt(row.row_start || row.start_row, 2);
    const rowEnd = asInt(row.row_end || row.end_row, 0);
    const normalizeMode = normalizeToken(row.normalize || 'lower_trim');
    const delimiter = normalizeText(row.delimiter || '');
    const rowHeader = asInt(row.header_row, 0);
    const rowPriority = normalizeReviewPriority(row.priority);
    const rowAiAssist = normalizeReviewAiAssist(row.ai_assist);
    const pushEnumRow = (bucket, columnRef) => {
      const field = shouldKeepEnumBucket({
        requestedBucket: bucket,
        headerBucket: bucket,
        row
      });
      const valueColumn = normalizeText(columnRef).toUpperCase();
      if (!rowSheet || !field || !valueColumn) {
        return;
      }
      enumLists.push({
        sheet: rowSheet,
        field,
        value_column: valueColumn,
        row_start: rowStart,
        row_end: rowEnd,
        delimiter,
        normalize: normalizeMode,
        header_row: rowHeader,
        priority: rowPriority,
        ai_assist: rowAiAssist
      });
    };
    const columns = toArray(row.columns);
    if (columns.length > 0) {
      for (const item of columns) {
        if (isObject(item)) {
          pushEnumRow(item.bucket || item.field || item.name || item.column, item.column || item.value_column);
        } else {
          const valueColumn = normalizeText(item).toUpperCase();
          pushEnumRow(valueColumn.toLowerCase(), valueColumn);
        }
      }
      continue;
    }
    const bucketMap = isObject(row.buckets) ? row.buckets : {};
    const bucketEntries = Object.entries(bucketMap);
    if (bucketEntries.length > 0) {
      for (const [bucketName, columnRef] of bucketEntries) {
        pushEnumRow(bucketName, columnRef);
      }
      continue;
    }
    pushEnumRow(row.field || row.bucket, row.value_column || row.column || 'A');
  }

  let dataLists = [];
  if (dataListsRaw.length > 0) {
    dataLists = dataListsRaw.map((row) => {
      const field = normalizeFieldKey(row.field || '');
      const rawManualValues = Array.isArray(row.manual_values) ? row.manual_values : (Array.isArray(row.values) ? row.values : []);
      const rowManualValues = orderedUniqueStrings(rawManualValues.map((val) => String(val).trim()).filter(Boolean));
      return {
        field,
        mode: normalizeSourceMode(row.mode),
        sheet: normalizeText(row.sheet),
        value_column: normalizeText(row.value_column || row.column || '').toUpperCase(),
        header_row: asInt(row.header_row, 0),
        row_start: asInt(row.row_start || row.start_row, 2),
        row_end: asInt(row.row_end || row.end_row, 0),
        normalize: normalizeToken(row.normalize || 'lower_trim') || 'lower_trim',
        delimiter: normalizeText(row.delimiter || ''),
        manual_values: rowManualValues,
        priority: normalizeReviewPriority(row.priority),
        ai_assist: normalizeReviewAiAssist(row.ai_assist)
      };
    });
  } else {
    const seenFields = new Set();
    dataLists = enumLists.map((row) => {
      const field = normalizeFieldKey(row.field || '');
      if (field) {
        seenFields.add(field);
      }
      return {
        field,
        mode: 'sheet',
        sheet: row.sheet,
        value_column: row.value_column,
        header_row: asInt(row.header_row, 0),
        row_start: asInt(row.row_start, 2),
        row_end: asInt(row.row_end, 0),
        normalize: normalizeToken(row.normalize || 'lower_trim') || 'lower_trim',
        delimiter: normalizeText(row.delimiter || ''),
        manual_values: [],
        priority: normalizeReviewPriority(row.priority),
        ai_assist: normalizeReviewAiAssist(row.ai_assist)
      };
    });
    for (const row of enumRowsRaw) {
      if (!isObject(row)) continue;
      const field = normalizeFieldKey(row.field || '');
      if (!field || seenFields.has(field)) continue;
      const rowValues = Array.isArray(row.values) ? row.values : (Array.isArray(row.manual_values) ? row.manual_values : []);
      if (!normalizeText(row.sheet)) {
        seenFields.add(field);
        dataLists.push({
          field,
          mode: 'scratch',
          sheet: '',
          value_column: '',
          header_row: 0,
          row_start: 2,
          row_end: 0,
          normalize: normalizeToken(row.normalize || 'lower_trim') || 'lower_trim',
          delimiter: normalizeText(row.delimiter || ''),
          manual_values: orderedUniqueStrings(rowValues.map((val) => String(val).trim()).filter(Boolean)),
          priority: normalizeReviewPriority(row.priority),
          ai_assist: normalizeReviewAiAssist(row.ai_assist)
        });
      }
    }
  }

  const componentRowsRaw = toArray(map.component_sources).length > 0 ? toArray(map.component_sources) : toArray(map.component_sheets);
  const componentSheets = componentRowsRaw.map((row) => {
    const rolesRaw = isObject(row.roles) ? row.roles : {};
    const headerRow = Math.max(1, asInt(row.header_row, 1));
    const firstDataRow = Math.max(1, asInt(
      row.first_data_row || row.row_start || row.start_row,
      Math.max(2, headerRow + 1)
    ));
    const propertyMappingsRaw = Array.isArray(rolesRaw.properties)
      ? rolesRaw.properties
      : toArray(row.property_mappings);
    const propertyMappings = propertyMappingsRaw
      .filter((entry) => isObject(entry))
      .map((entry) => {
        const fieldKey = normalizeFieldKey(entry.field_key || '');
        const legacyKey = normalizeFieldKey(entry.key || entry.property_key || '');
        const propType = ['number', 'integer', 'string'].includes(normalizeToken(entry.type)) ? normalizeToken(entry.type) : 'string';
        const rawPolicy = normalizeToken(entry.variance_policy || 'authoritative');
        const NUMERIC_ONLY = ['upper_bound', 'lower_bound', 'range'];
        const coerced = !isNumericContractType(propType) && NUMERIC_ONLY.includes(rawPolicy);
        const effectivePolicy = coerced ? 'authoritative' : rawPolicy;
        if (coerced && warnings) {
          warnings.push(`component_sources: variance_policy '${entry.variance_policy}' on string property '${fieldKey || legacyKey || '?'}' coerced to 'authoritative' (numeric policies require type 'number' or 'integer')`);
        }
        const normalizedConstraints = Array.isArray(entry.constraints) ? entry.constraints.map((c) => normalizeText(c)) : [];
        const componentOnly = entry.component_only === true;
        const resolvedKey = fieldKey || legacyKey;
        // WHY: component_only + non-empty constraints — the constraints will not
        // be enforced via cross-validation because the field never enters
        // fieldsRuntime. Warn so authors don't expect them to fire.
        if (componentOnly && warnings && normalizedConstraints.length > 0) {
          warnings.push(`component_sources: property '${resolvedKey || '?'}' has component_only=true; constraints '${JSON.stringify(normalizedConstraints)}' will not be enforced in cross-validation`);
        }
        // WHY: EG-locked keys (colors/editions/release_date) are variant
        // generators that must remain product fields. component_only is
        // semantically invalid here — warn but leave promotion behavior intact
        // (the gate in compileComponentHelpers handles the override).
        if (componentOnly && warnings && EG_LOCKED_KEYS.has(resolvedKey)) {
          warnings.push(`component_sources: EG-locked key '${resolvedKey}' cannot be component_only; ignoring flag`);
        }
        const out = {
          key: resolvedKey,
          column: normalizeText(entry.column || entry.col || '').toUpperCase(),
          type: propType,
          unit: normalizeText(entry.unit || ''),
          field_key: fieldKey || undefined,
          variance_policy: effectivePolicy,
          constraints: normalizedConstraints,
        };
        if (componentOnly) out.component_only = true;
        return out;
      })
      .filter((entry) => entry.column || entry.field_key);
    if (propertyMappings.length === 0) {
      for (const col of stableSortStrings(toArray(row.property_columns || row.props_columns).map((entry) => normalizeText(entry).toUpperCase()))) {
        if (!col) continue;
        propertyMappings.push({
          key: normalizeFieldKey(col),
          column: col,
          type: 'string',
          unit: '',
          field_key: undefined,
          variance_policy: 'authoritative',
          constraints: []
        });
      }
    }
    const propertyColumns = stableSortStrings(propertyMappings.map((entry) => entry.column));
    const primaryIdentifierColumn = normalizeText(
      rolesRaw.primary_identifier
      || row.primary_identifier_column
      || row.canonical_name_column
      || row.name_column
      || row.canonical_column
      || 'A'
    ).toUpperCase();
    const makerColumn = normalizeText(
      rolesRaw.maker
      || row.maker_column
      || row.brand_column
      || ''
    ).toUpperCase();
    const aliasColumns = stableSortStrings(
      toArray(rolesRaw.aliases || row.alias_columns || row.alias_cols).map((entry) => normalizeText(entry).toUpperCase())
    );
    const linkColumns = stableSortStrings(
      toArray(rolesRaw.links || row.link_columns || row.links_columns).map((entry) => normalizeText(entry).toUpperCase())
    );
    const stopAfterBlankPrimary = Math.max(1, asInt(row.stop_after_blank_primary || row.stop_after_blank_names, 10));
    const rowPriority = normalizeReviewPriority(row.priority || row.review_priority);
    const rowAiAssist = normalizeReviewAiAssist(row.ai_assist);
    const rowMode = normalizeSourceMode(row.mode);
    return {
      mode: rowMode,
      sheet: normalizeText(row.sheet),
      component_type: normalizeToken(row.component_type || row.type || guessComponentType(row.sheet)),
      primary_identifier_column: primaryIdentifierColumn,
      maker_column: makerColumn,
      canonical_name_column: primaryIdentifierColumn,
      name_column: primaryIdentifierColumn,
      brand_column: makerColumn,
      alias_columns: aliasColumns,
      link_columns: linkColumns,
      property_mappings: propertyMappings,
      property_columns: propertyColumns,
      roles: {
        primary_identifier: primaryIdentifierColumn,
        maker: makerColumn,
        aliases: aliasColumns,
        links: linkColumns,
        properties: propertyMappings
      },
      auto_derive_aliases: row.auto_derive_aliases !== false,
      header_row: headerRow,
      first_data_row: firstDataRow,
      stop_after_blank_primary: stopAfterBlankPrimary,
      stop_after_blank_names: stopAfterBlankPrimary,
      row_end: asInt(row.row_end || row.end_row, 0),
      priority: rowPriority,
      ai_assist: rowAiAssist
    };
  });
  const tooltipSourceRaw = isObject(map.tooltip_source) ? map.tooltip_source : {};
  const tooltipSourcePath = normalizeText(
    tooltipSourceRaw.path
    || map.tooltip_bank_path
    || map.tooltip_file
    || ''
  );
  const tooltipSourceFormat = normalizeToken(
    tooltipSourceRaw.format
    || (tooltipSourcePath ? path.extname(tooltipSourcePath).slice(1) : '')
    || 'auto'
  ) || 'auto';
  return {
    version: asInt(map.version, 1),
    field_studio_source_path: normalizeText(map.field_studio_source_path || ''),
    sheet_roles: sheetRoles.filter((row) => row.sheet),
    key_list: hasKeyList ? keyList : null,
    key_source: hasKeyList
      ? {
        sheet: keyList.sheet,
        source: keyList.source,
        range: keyList.source === 'range' ? keyList.range : `${keyList.column}${keyList.row_start}:${keyList.column}${keyList.row_end}`,
        named_range: keyList.named_range || null,
        column: keyList.column,
        row_start: keyList.row_start,
        row_end: keyList.row_end
      }
      : null,
    product_table: productTable,
    sampling: productTable
      ? {
        sheet: productTable.sheet,
        layout: productTable.layout,
        key_column: productTable.key_column,
        first_key_row: productTable.data_row_start,
        value_start_column: productTable.value_col_start,
        sample_columns: productTable.sample_columns,
        brand_row: productTable.brand_row,
        model_row: productTable.model_row,
        variant_row: productTable.variant_row
      }
      : null,
    data_lists: dataLists,
    enum_lists: enumLists.filter((row) => row.sheet),
    enum_sources: enumLists
      .filter((row) => row.sheet)
      .map((row) => ({
        sheet: row.sheet,
        bucket: row.field,
        column: row.value_column,
        header_row: asInt(row.header_row, 0) || null,
        start_row: row.row_start,
        end_row: row.row_end > 0 ? row.row_end : null,
        delimiter: row.delimiter || '',
        normalize: row.normalize,
        priority: row.priority,
        ai_assist: row.ai_assist
      })),
    component_sheets: [],
    component_sources: componentSheets
      .filter((row) => row.sheet || row.component_type)
      .map((row) => ({
        mode: row.mode,
        sheet: row.sheet,
        type: row.component_type,
        component_type: row.component_type,
        header_row: row.header_row,
        first_data_row: row.first_data_row,
        roles: {
          primary_identifier: row.primary_identifier_column,
          maker: row.maker_column || '',
          aliases: row.alias_columns,
          links: row.link_columns,
          properties: row.property_mappings
        },
        auto_derive_aliases: row.auto_derive_aliases,
        stop_after_blank_primary: row.stop_after_blank_primary,
        start_row: row.first_data_row,
        priority: row.priority,
        ai_assist: row.ai_assist
      })),
    expectations: isObject(map.expectations) ? {
      required_fields: stableSortStrings(toArray(map.expectations.required_fields).map((field) => normalizeFieldKey(field))),
      critical_fields: stableSortStrings(toArray(map.expectations.critical_fields).map((field) => normalizeFieldKey(field))),
      expected_easy_fields: stableSortStrings(toArray(map.expectations.expected_easy_fields).map((field) => normalizeFieldKey(field))),
      expected_sometimes_fields: stableSortStrings(toArray(map.expectations.expected_sometimes_fields).map((field) => normalizeFieldKey(field))),
      deep_fields: stableSortStrings(toArray(map.expectations.deep_fields).map((field) => normalizeFieldKey(field)))
    } : {
      required_fields: [],
      critical_fields: [],
      expected_easy_fields: [],
      expected_sometimes_fields: [],
      deep_fields: []
    },
    selected_keys: pruneComponentOnlySelected(
      orderedUniqueStrings(toArray(map.selected_keys).map((field) => normalizeFieldKey(field))),
      componentSheets,
      warnings,
    ),
    version_note: normalizeText(map.version_note || ''),
    field_overrides: stripRetiredEvidenceKnobs(isObject(map.field_overrides) ? map.field_overrides : {}),
    ui_defaults: isObject(map.ui_defaults) ? map.ui_defaults : {},
    tooltip_source: {
      path: tooltipSourcePath,
      format: tooltipSourceFormat
    },
    identity: isObject(map.identity) ? {
      min_identifiers: asInt(map.identity.min_identifiers, 2),
      anti_merge_rules: toArray(map.identity.anti_merge_rules)
    } : {
      min_identifiers: 2,
      anti_merge_rules: []
    },
    field_groups: Array.isArray(map.field_groups)
      ? orderedUniqueStrings(toArray(map.field_groups).map(g => String(g || '').trim()).filter(Boolean))
      : [],
    // WHY: eg_toggles controls which EG-locked fields are active. Must survive
    // normalization so hash stays stable across migration → compile re-sync cycles.
    // Defaults to {} here; studioRoutes applies EG_DEFAULT_TOGGLES when empty.
    eg_toggles: isObject(map.eg_toggles) ? map.eg_toggles : {},
  };
}

export function validateFieldStudioMap(map = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const rawMap = isObject(map) ? map : {};
  const rawKeyListProvided = isObject(rawMap.key_list) || isObject(rawMap.key_source);
  const normalized = normalizeFieldStudioMap(map, { warnings });
  const sheetNames = new Set(toArray(options.sheetNames).map((name) => normalizeText(name)));
  const checkSheet = (sheet, label) => {
    if (!sheet) {
      return;
    }
    if (sheetNames.size > 0 && !sheetNames.has(sheet)) {
      errors.push(`${label}: unknown sheet '${sheet}'`);
    }
  };

  const normalizedComponentRows = toArray(normalized.component_sources).length > 0
    ? toArray(normalized.component_sources)
    : toArray(normalized.component_sheets);
  const hasSheetBackedComponentRows = normalizedComponentRows.some((row) => normalizeSourceMode(row?.mode) === 'sheet');
  const hasSheetBackedDataLists = toArray(normalized.data_lists).some((row) => {
    const mode = normalizeSourceMode(row?.mode);
    if (mode !== 'sheet') {
      return false;
    }
    return Boolean(normalizeText(row?.sheet));
  });
  const requiresKeyList = Boolean(normalized.product_table?.sheet)
    || Boolean(normalizeText(normalized.field_studio_source_path))
    || hasSheetBackedComponentRows
    || hasSheetBackedDataLists;

  if (!normalized.key_list || !normalized.key_list.sheet) {
    if (rawKeyListProvided || requiresKeyList) {
      errors.push('key_list: sheet is required');
    }
  } else {
    checkSheet(normalized.key_list.sheet, 'key_list');
    const keySource = normalized.key_list.source === 'table_column'
      ? 'column_range'
      : normalized.key_list.source;
    normalized.key_list.source = keySource;
    if (!['column_range', 'range', 'named_range'].includes(keySource)) {
      errors.push(`key_list: unsupported source '${normalized.key_list.source}'`);
    }
    if (keySource === 'range' && !parseRange(normalized.key_list.range)) {
      errors.push('key_list: invalid A1 range');
    }
    if (keySource === 'named_range' && !normalizeText(normalized.key_list.named_range)) {
      errors.push('key_list: named_range is required when source=named_range');
    }
    if (keySource === 'column_range') {
      if (!colToIndex(normalized.key_list.column)) {
        errors.push('key_list: invalid column for column_range');
      }
      if (normalized.key_list.row_start <= 0 || normalized.key_list.row_end < normalized.key_list.row_start) {
        errors.push('key_list: invalid row_start/row_end for column_range');
      }
    }
  }

  if (normalized.product_table && normalized.product_table.sheet) {
    checkSheet(normalized.product_table.sheet, 'product_table');
    if (!['matrix', 'rows'].includes(normalized.product_table.layout)) {
      errors.push(`product_table: unsupported layout '${normalized.product_table.layout}'`);
    }
    if (normalized.product_table.layout === 'matrix' && !colToIndex(normalized.product_table.value_col_start)) {
      errors.push('product_table: value_col_start is required for matrix layout');
    }
  }

  const seenRoles = new Set();
  for (const row of normalized.sheet_roles) {
    checkSheet(row.sheet, 'sheet_roles');
    if (!['product_table', 'field_key_list', 'enum_list', 'component_db', 'notes', 'ignore'].includes(row.role)) {
      errors.push(`sheet_roles: invalid role '${row.role}' for sheet '${row.sheet}'`);
    }
    const key = `${row.sheet}::${row.role}`;
    if (seenRoles.has(key)) {
      warnings.push(`sheet_roles: duplicate role assignment '${row.role}' for '${row.sheet}'`);
    }
    seenRoles.add(key);
  }

  for (const row of normalized.enum_lists) {
    checkSheet(row.sheet, 'enum_lists');
    if (!row.field) {
      errors.push(`enum_lists: field is required for sheet '${row.sheet}'`);
    }
    if (!colToIndex(row.value_column)) {
      errors.push(`enum_lists: invalid value_column '${row.value_column}' for sheet '${row.sheet}'`);
    }
    if (row.row_start <= 0) {
      errors.push(`enum_lists: row_start must be > 0 for sheet '${row.sheet}'`);
    }
  }

  for (const row of normalizedComponentRows) {
    const roles = isObject(row.roles) ? row.roles : {};
    const sheetToken = normalizeText(row.sheet);
    const mode = normalizeSourceMode(row.mode);
    const isSheetBacked = mode === 'sheet';
    const componentType = normalizeFieldKey(row.component_type || row.type || '');
    const primaryIdentifierColumn = normalizeText(
      roles.primary_identifier
      || ''
    ).toUpperCase();
    const makerColumn = normalizeText(roles.maker || '').toUpperCase();
    const aliasColumns = stableSortStrings(toArray(roles.aliases).map((entry) => normalizeText(entry).toUpperCase()));
    const linkColumns = stableSortStrings(toArray(roles.links).map((entry) => normalizeText(entry).toUpperCase()));
    const propertyMappings = toArray(roles.properties).filter((entry) => isObject(entry));
    const propertyColumns = stableSortStrings(propertyMappings.map((entry) => normalizeText(entry.column || '').toUpperCase()));
    const stopAfterBlankPrimary = Math.max(1, asInt(row.stop_after_blank_primary || row.stop_after_blank_names, 10));

    checkSheet(row.sheet, 'component_sources');
    if (isSheetBacked && !sheetToken) {
      errors.push(`component_sources: sheet is required when mode=sheet for type '${componentType || '?'}'`);
    }
    if (!componentType) {
      errors.push(`component_sources: type is required for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && !colToIndex(primaryIdentifierColumn)) {
      errors.push(`component_sources: invalid primary_identifier column '${primaryIdentifierColumn}' for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && row.header_row <= 0) {
      errors.push(`component_sources: header_row must be > 0 for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && row.first_data_row <= 0) {
      errors.push(`component_sources: first_data_row must be > 0 for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && row.first_data_row <= row.header_row) {
      errors.push(`component_sources: first_data_row must be > header_row for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && stopAfterBlankPrimary <= 0) {
      errors.push(`component_sources: stop_after_blank_primary must be > 0 for sheet '${row.sheet}'`);
    }
    if (isSheetBacked && makerColumn && !colToIndex(makerColumn)) {
      errors.push(`component_sources: invalid maker column '${makerColumn}' for sheet '${row.sheet}'`);
    }
    for (const aliasCol of aliasColumns) {
      if (isSheetBacked && !colToIndex(aliasCol)) {
        errors.push(`component_sources: invalid aliases entry '${aliasCol}' for sheet '${row.sheet}'`);
      }
    }
    for (const linkCol of linkColumns) {
      if (isSheetBacked && !colToIndex(linkCol)) {
        errors.push(`component_sources: invalid links entry '${linkCol}' for sheet '${row.sheet}'`);
      }
    }
    for (const propCol of propertyColumns) {
      if (isSheetBacked && !colToIndex(propCol)) {
        errors.push(`component_sources: invalid property column '${propCol}' for sheet '${row.sheet}'`);
      }
    }
    const VALID_VARIANCE_POLICIES = ['authoritative', 'upper_bound', 'lower_bound', 'range', 'override_allowed'];
    for (const prop of propertyMappings) {
      if (!isObject(prop)) {
        errors.push(`component_sources: invalid property mapping in sheet '${row.sheet}'`);
        continue;
      }
      if (!normalizeFieldKey(prop.field_key || prop.key || '')) {
        errors.push(`component_sources: property mapping missing key for sheet '${row.sheet}'`);
      }
      if (isSheetBacked && !colToIndex(prop.column || '')) {
        errors.push(`component_sources: invalid property mapping column '${prop.column}' for sheet '${row.sheet}'`);
      }
      if (prop.type && !['string', 'number', 'integer'].includes(normalizeToken(prop.type))) {
        errors.push(`component_sources: invalid property mapping type '${prop.type}' for sheet '${row.sheet}'`);
      }
      if (prop.variance_policy && !VALID_VARIANCE_POLICIES.includes(normalizeToken(prop.variance_policy))) {
        errors.push(`component_sources: invalid variance_policy '${prop.variance_policy}' for property '${prop.field_key || prop.key || '?'}' in sheet '${row.sheet}'`);
      }
      if (prop.constraints && !Array.isArray(prop.constraints)) {
        errors.push(`component_sources: constraints must be an array for property '${prop.field_key || prop.key || '?'}' in sheet '${row.sheet}'`);
      }
    }
  }

  if (toArray(normalized.selected_keys).length > 0) {
    const invalid = toArray(normalized.selected_keys).filter((field) => !normalizeFieldKey(field));
    if (invalid.length > 0) {
      errors.push('selected_keys: contains invalid field keys');
    }
  } else {
    warnings.push('selected_keys: empty (compiler will include all extracted keys)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized
  };
}
