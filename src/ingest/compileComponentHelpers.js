import {
  toArray,
  isObject,
  asInt,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  normalizeSourceMode,
  isNumericContractType,
  stableSortStrings
} from './compileUtils.js';

export function buildPropertyConstraintsFromMap(map, fieldKey) {
  const meta = resolveComponentPropertyMetaFromMap(map, fieldKey);
  if (!meta) {
    return [];
  }
  return meta.constraints;
}

export function resolveComponentPropertyMetaFromMap(map, fieldKey) {
  const normalizedFieldKey = normalizeFieldKey(fieldKey);
  if (!normalizedFieldKey) {
    return null;
  }
  const numericOnlyPolicies = new Set(['upper_bound', 'lower_bound', 'range']);
  const sources = toArray(map?.component_sources).length > 0
    ? toArray(map.component_sources)
    : toArray(map?.component_sheets);
  for (const row of sources) {
    if (!isObject(row)) continue;
    const rolesBlock = isObject(row.roles) ? row.roles : {};
    for (const entry of toArray(rolesBlock.properties)) {
      if (!isObject(entry)) continue;
      const entryKey = normalizeFieldKey(entry.field_key || entry.key || entry.property_key || '');
      if (entryKey !== normalizedFieldKey) {
        continue;
      }
      const entryTypeToken = normalizeToken(entry.type);
      const type = ['number', 'integer', 'string'].includes(entryTypeToken)
        ? entryTypeToken
        : 'string';
      const rawPolicy = normalizeToken(entry.variance_policy || 'authoritative') || 'authoritative';
      const variancePolicy = !isNumericContractType(type) && numericOnlyPolicies.has(rawPolicy)
        ? 'authoritative'
        : rawPolicy;
      return {
        type,
        unit: normalizeText(entry.unit || ''),
        variance_policy: variancePolicy,
        constraints: Array.isArray(entry.constraints) ? entry.constraints.filter(Boolean) : [],
      }
    }
  }
  return null;
}

export function applyKeyLevelConstraintsToEntities(componentDb, fieldsRuntime) {
  for (const rows of Object.values(componentDb)) {
    for (const entity of toArray(rows)) {
      if (!isObject(entity?.properties)) continue;
      for (const propKey of Object.keys(entity.properties)) {
        const fieldDef = fieldsRuntime[propKey];
        if (!isObject(fieldDef)) continue;
        const keyConstraints = Array.isArray(fieldDef.constraints) ? fieldDef.constraints.filter(Boolean) : [];
        if (keyConstraints.length === 0) continue;
        if (!entity.__constraints) entity.__constraints = {};
        entity.__constraints[propKey] = keyConstraints;
      }
    }
  }
}

export function buildComponentSourceSummary({
  map,
  componentDb,
  sourceStats,
  fieldsRuntime
} = {}) {
  const fr = isObject(fieldsRuntime) ? fieldsRuntime : {};
  const out = {};
  const sourceRows = toArray(map?.component_sources).length > 0 ? toArray(map.component_sources) : toArray(map?.component_sheets);
  for (const row of sourceRows) {
    if (!isObject(row)) {
      continue;
    }
    const componentType = normalizeFieldKey(row.component_type || row.type || '');
    if (!componentType) {
      continue;
    }
    const rolesBlock = isObject(row.roles) ? row.roles : {};
    const propertyMappings = toArray(rolesBlock.properties)
      .filter((entry) => isObject(entry))
      .map((entry) => {
        const fieldKey = normalizeFieldKey(entry.field_key || '');
        const legacyKey = normalizeFieldKey(entry.key || entry.property_key || '');
        const resolvedKey = fieldKey || legacyKey;
        const keyLevelConstraints = Array.isArray(fr[resolvedKey]?.constraints) ? fr[resolvedKey].constraints.filter(Boolean) : null;
        const mapConstraints = Array.isArray(entry.constraints) ? entry.constraints.map((c) => normalizeText(c)) : [];
        return {
          key: resolvedKey,
          column: normalizeText(entry.column || entry.col || '').toUpperCase(),
          type: ['number', 'string'].includes(normalizeToken(entry.type)) ? normalizeToken(entry.type) : 'string',
          unit: normalizeText(entry.unit || ''),
          field_key: fieldKey || undefined,
          variance_policy: normalizeToken(entry.variance_policy || 'authoritative'),
          constraints: keyLevelConstraints !== null ? keyLevelConstraints : mapConstraints
        };
      })
      .filter((entry) => entry.column);
    const primaryIdentifier = normalizeText(
      rolesBlock.primary_identifier
      || ''
    );
    const makerColumn = normalizeText(
      rolesBlock.maker || ''
    ) || null;
    const sourceBlock = {
      mode: normalizeSourceMode(row.mode),
      sheet: normalizeText(row.sheet),
      header_row: asInt(row.header_row, 1),
      first_data_row: asInt(row.first_data_row || row.row_start, 2),
      primary_identifier_column: primaryIdentifier,
      alias_columns: stableSortStrings(toArray(rolesBlock.aliases)),
      auto_derive_aliases: row.auto_derive_aliases !== false,
      maker_column: makerColumn,
      link_columns: stableSortStrings(toArray(rolesBlock.links)),
      property_columns: stableSortStrings(propertyMappings.map((entry) => entry.column)),
      property_mappings: propertyMappings,
      stop_after_blank_primary: Math.max(1, asInt(row.stop_after_blank_primary || row.stop_after_blank_names, 10)),
      stop_after_blank_names: Math.max(1, asInt(row.stop_after_blank_primary || row.stop_after_blank_names, 10))
    };
    const entries = toArray(componentDb?.[componentType]);
    const sampleEntities = entries
      .map((rowValue) => normalizeText(rowValue?.name || rowValue?.canonical_name || ''))
      .filter(Boolean)
      .slice(0, 10);
    const stats = isObject(sourceStats?.[componentType]) ? sourceStats[componentType] : {};
    const previewStats = {
      scanned_rows: asInt(stats.scanned_rows, 0),
      entity_count: asInt(stats.entity_count, entries.length),
      non_blank_names: asInt(stats.non_blank_names, entries.length),
      numeric_only_names: asInt(stats.numeric_only_names, 0),
      numeric_only_ratio: Number(stats.numeric_only_ratio ?? 0),
      first_20_names: toArray(stats.first_20_names).slice(0, 20),
      first_20_all_numeric: Boolean(stats.first_20_all_numeric),
      stop_after_blank_primary: Math.max(1, asInt(stats.stop_after_blank_primary, sourceBlock.stop_after_blank_primary)),
      stop_after_blank_names: Math.max(1, asInt(stats.stop_after_blank_names, sourceBlock.stop_after_blank_names))
    };

    out[componentType] = {
      type: componentType,
      sheet: sourceBlock.sheet,
      roles: {
        primary_identifier: sourceBlock.primary_identifier_column || null,
        maker: sourceBlock.maker_column,
        aliases: sourceBlock.alias_columns,
        links: sourceBlock.link_columns,
        properties: sourceBlock.property_mappings
      },
      name_column: sourceBlock.primary_identifier_column || null,
      field_studio: sourceBlock,
      entity_count: entries.length,
      sample_entities: sampleEntities,
      preview_stats: previewStats
    };
  }
  return out;
}

export function declaredComponentTypesFromMap(map = {}) {
  const rows = toArray(map?.component_sources).length > 0
    ? toArray(map.component_sources)
    : toArray(map?.component_sheets);
  return new Set(
    rows
      .map((row) => normalizeFieldKey(row?.component_type || row?.type || ''))
      .filter(Boolean)
  );
}

export function declaredComponentPropertyKeysFromMap(map = {}) {
  const rows = toArray(map?.component_sources).length > 0
    ? toArray(map.component_sources)
    : toArray(map?.component_sheets);
  const out = new Set();
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const roles = isObject(row.roles) ? row.roles : {};
    for (const prop of toArray(roles.properties)) {
      if (!isObject(prop)) {
        continue;
      }
      const key = normalizeFieldKey(prop.field_key || prop.key || prop.property_key || '');
      if (key) {
        out.add(key);
      }
    }
  }
  return out;
}

export function inferComponentTypeForField(fieldKey = '', componentTypes = new Set()) {
  const keyToken = normalizeFieldKey(fieldKey);
  if (!keyToken) return '';
  for (const typeToken of componentTypes) {
    const normalizedType = normalizeFieldKey(typeToken);
    if (!normalizedType) continue;
    const singularType = normalizedType.endsWith('s') ? normalizedType.slice(0, -1) : normalizedType;
    if (keyToken === normalizedType || keyToken === singularType) {
      return normalizedType;
    }
  }
  return '';
}
