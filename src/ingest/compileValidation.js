import {
  toArray,
  isObject,
  asInt,
  asNumber,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isDateLikeFieldKey,
  parseSerialDate
} from './compileUtils.js';
import {
  declaredComponentTypesFromMap,
  declaredComponentPropertyKeysFromMap,
  inferComponentTypeForField
} from './compileComponentHelpers.js';
import {
  normalizeValueForm,
  parseEnumSource
} from './compileFieldRuleBuilder.js';
import { VALID_TYPES, VALID_SHAPES, validateTypeShapeCombo } from '../field-rules/typeCoercionRegistry.js';

export function buildParseTemplateCatalog() {
  return {
    boolean_yes_no_unk: {
      description: "Parse yes/no/true/false/1/0 tokens. Output boolean or null.",
      tests: [
        { raw: 'Yes', expected: true },
        { raw: 'no', expected: false },
        { raw: 'unk', expected: null }
      ]
    },
    number_with_unit: {
      description: 'Parse a single number with optional unit. Convert to target unit when allowed.',
      tests: [
        { raw: '120 mm', expected_mm: 120 },
        { raw: '12 cm', expected_mm: 120 },
        { raw: '4.5 in', expected_mm: 114.3 }
      ]
    },
    list_of_tokens_delimited: {
      description: 'Parse delimited tokens into list<string> with optional token_map normalization.',
      tests: [
        { raw: 'white, black', expected: ['white', 'black'] },
        { raw: 'gray+black', expected: ['gray', 'black'] },
        { raw: '  Red / Blue  ', expected: ['red', 'blue'] }
      ]
    },
    list_numbers_or_ranges_with_unit: {
      description: "Parse mixed lists containing numbers and ranges (e.g. '1-3, 4'). Canonical output is list of intervals {min,max}.",
      tests: [
        { raw: '4', expected: [{ min: 4, max: 4 }] },
        { raw: '1-3', expected: [{ min: 1, max: 3 }] },
        { raw: '1-3, 4', expected: [{ min: 1, max: 3 }, { min: 4, max: 4 }] }
      ]
    },
    list_of_numbers_with_unit: {
      description: 'Parse list of numbers with optional unit into list<number> (or list<int>) in target unit.',
      tests: [
        { raw: '125, 500, 1000 Hz', expected: [125, 500, 1000] },
        { raw: '1000', expected: [1000] },
        { raw: '1k, 2k', expected: [1000, 2000] }
      ]
    },
    url_field: {
      description: 'Parse and validate URL. Normalize by trimming and ensuring scheme.',
      tests: [
        { raw: 'https://example.com/spec', expected: 'https://example.com/spec' },
        { raw: 'example.com/spec', expected: 'https://example.com/spec' }
      ]
    },
    date_field: {
      description: 'Parse date strings to ISO-8601 (YYYY-MM-DD) when possible.',
      tests: [
        { raw: '2024-10-01', expected: '2024-10-01' },
        { raw: 'Oct 2024', expected: '2024-10-01' }
      ]
    },
    component_reference: {
      description: 'Match a component entity name/alias against a component_db type; output canonical component name.',
      tests: [
        { raw: 'PAW 3395', expected: 'PAW3395' },
        { raw: 'Kailh GM 8.0', expected: 'Kailh GM 8.0' }
      ]
    }
  };
}

// WHY: Phase 4 — INV-1/2/3 invariants on the component model.
// INV-1: every component_sources[] row has a matching field rule self-locked
//   to component_db.<type>.
// INV-2: every field rule with enum.source = component_db.<X> must have X === key
//   (self-lock) AND a matching component_sources[X] row.
// INV-3: every component_sources[X].roles.properties[].field_key must be a real
//   field rule.
//
// Extracted as a standalone helper so the migration script
// (scripts/audits/component-orphan-check.js) can run the same checks against
// raw {fields, map} pairs without invoking the full compile validation surface.
export function runComponentInvariantChecks({ fields, map }) {
  const errors = [];
  const warnings = [];
  const fieldsObj = isObject(fields) ? fields : {};
  const componentSourcesByType = new Map();
  const sourceRows = isObject(map) && Array.isArray(map.component_sources) && map.component_sources.length > 0
    ? toArray(map.component_sources)
    : (isObject(map) ? toArray(map.component_sheets) : []);
  for (const row of sourceRows) {
    if (!isObject(row)) continue;
    const type = normalizeFieldKey(row.component_type || row.type || '');
    if (!type) continue;
    if (!componentSourcesByType.has(type)) componentSourcesByType.set(type, row);
  }

  // INV-1: every component_sources[] entry has a matching self-locked field rule.
  for (const [type] of componentSourcesByType) {
    const rule = fieldsObj[type];
    if (!isObject(rule)) {
      errors.push(`component_sources[${type}]: matching field rule "${type}" missing or has wrong enum.source (expected "component_db.${type}")`);
      continue;
    }
    const enumBlock = isObject(rule.enum) ? rule.enum : {};
    const nestedSource = typeof enumBlock.source === 'string' ? enumBlock.source : '';
    const flatSource = typeof rule.enum_source === 'string'
      ? rule.enum_source
      : (isObject(rule.enum_source) && rule.enum_source.type === 'component_db'
        ? `component_db.${normalizeFieldKey(rule.enum_source.ref || '')}`
        : '');
    const expected = `component_db.${type}`;
    if (nestedSource !== expected && flatSource !== expected) {
      errors.push(`component_sources[${type}]: matching field rule "${type}" missing or has wrong enum.source (expected "${expected}")`);
    }
  }

  // INV-2 (self-lock + orphan rule): every rule with enum.source = component_db.<X>
  // must have X === fieldKey AND a matching component_sources entry.
  for (const [fieldKey, rule] of Object.entries(fieldsObj)) {
    if (!isObject(rule)) continue;
    const enumBlock = isObject(rule.enum) ? rule.enum : {};
    const candidates = [];
    if (typeof enumBlock.source === 'string' && enumBlock.source.startsWith('component_db.')) {
      candidates.push(enumBlock.source.slice('component_db.'.length));
    }
    if (typeof rule.enum_source === 'string' && rule.enum_source.startsWith('component_db.')) {
      candidates.push(rule.enum_source.slice('component_db.'.length));
    } else if (isObject(rule.enum_source) && rule.enum_source.type === 'component_db') {
      candidates.push(normalizeFieldKey(rule.enum_source.ref || ''));
    }
    for (const refRaw of candidates) {
      const ref = normalizeFieldKey(refRaw);
      if (!ref) continue;
      if (ref !== fieldKey) {
        errors.push(`field ${fieldKey}: enum_source = component_db.${ref} must self-lock (ref must equal field key)`);
        continue;
      }
      if (!componentSourcesByType.has(ref)) {
        errors.push(`field ${fieldKey}: enum_source = component_db.${ref} but no component_sources entry for "${ref}"`);
      }
    }
  }

  // INV-3: every property field_key declared under component_sources must be a
  // real field rule. Skips component_only properties (they intentionally do
  // NOT promote into product fields).
  const propertyKeys = declaredComponentPropertyKeysFromMap(map);
  for (const propertyKey of propertyKeys) {
    if (!fieldsObj[propertyKey]) {
      errors.push(`component_sources: property field_key "${propertyKey}" has no matching field rule`);
    }
  }

  return { errors, warnings };
}

export function buildCompileValidation({ fields, knownValues, enumLists, componentDb, map = null }) {
  const errors = [];
  const warnings = [];
  const seenKeys = new Set();
  const knownValueFields = new Set([
    ...Object.keys(knownValues || {}),
    ...Object.keys(enumLists || {})
  ]);
  const componentTypes = new Set([
    ...Object.keys(componentDb || {}).map((type) => normalizeFieldKey(type)).filter(Boolean),
    ...declaredComponentTypesFromMap(map),
  ]);
  // WHY: Type/shape validation uses VALID_TYPES and VALID_SHAPES from typeCoercionRegistry.
  // No more validParseTemplates — parse.template is eliminated.

  for (const [fieldKey, rule] of Object.entries(fields || {})) {
    const priority = isObject(rule.priority) ? rule.priority : {};
    const contract = isObject(rule.contract) ? rule.contract : {};
    const parse = isObject(rule.parse) ? rule.parse : {};
    const enumObj = isObject(rule.enum) ? rule.enum : {};
    const evidence = isObject(rule.evidence) ? rule.evidence : {};
    const parseRules = isObject(rule.parse_rules) ? rule.parse_rules : {};

    const resolvedType = normalizeToken(rule.type || contract.type || '');
    const resolvedShape = normalizeToken(rule.shape || contract.shape || '');
    const resolvedValueForm = normalizeValueForm(rule.value_form, resolvedShape || 'scalar');
    const resolvedRequiredLevel = normalizeToken(rule.required_level || priority.required_level || '');
    const resolvedAvailability = normalizeToken(rule.availability || priority.availability || '');
    const resolvedDifficulty = normalizeToken(rule.difficulty || priority.difficulty || '');
    const resolvedEnumPolicy = normalizeToken(rule.enum_policy || enumObj.policy || 'open_prefer_known');
    // WHY: parse_template eliminated. Type+shape is the contract.
    const resolvedUnit = normalizeText(rule.unit || contract.unit || '');
    const resolvedRound = normalizeToken(
      rule.round
      || (() => {
        const decimals = asInt(contract?.rounding?.decimals, null);
        if (decimals === 0) return 'int';
        if (decimals === 1) return '1dp';
        if (decimals === 2) return '2dp';
        return '';
      })()
    );
    const resolvedListRules = isObject(rule.list_rules)
      ? rule.list_rules
      : (isObject(contract.list_rules) ? contract.list_rules : null);
    const resolvedObjectSchema = isObject(rule.object_schema)
      ? rule.object_schema
      : (isObject(contract.object_schema) ? contract.object_schema : null);
    const resolvedEnumSource = parseEnumSource(rule.enum_source || enumObj.source, fieldKey);
    const resolvedNewValuePolicy = isObject(rule.new_value_policy)
      ? rule.new_value_policy
      : (isObject(enumObj.new_value_policy) ? enumObj.new_value_policy : null);
    const resolvedMinEvidenceRefs = (
      rule.min_evidence_refs !== undefined
        ? asInt(rule.min_evidence_refs, 0)
        : asInt(evidence.min_evidence_refs, 1)
    );

    if (seenKeys.has(fieldKey)) {
      errors.push(`duplicate field key: ${fieldKey}`);
    }
    seenKeys.add(fieldKey);
    if (!rule.key || normalizeFieldKey(rule.key) !== fieldKey) {
      errors.push(`field ${fieldKey}: missing/invalid key`);
    }
    if (!VALID_TYPES.has(resolvedType)) {
      errors.push(`field ${fieldKey}: invalid type '${resolvedType || rule.type}'`);
    }
    if (!VALID_SHAPES.has(resolvedShape)) {
      errors.push(`field ${fieldKey}: invalid shape '${resolvedShape || rule.shape}'`);
    }
    const typeShapeCheck = validateTypeShapeCombo(resolvedType, resolvedShape);
    if (!typeShapeCheck.valid) {
      errors.push(`field ${fieldKey}: ${typeShapeCheck.reason}`);
    }
    const valueForm = resolvedValueForm;
    if (!['scalar', 'list', 'range', 'mixed_values_and_ranges', 'list_of_objects'].includes(valueForm)) {
      errors.push(`field ${fieldKey}: invalid value_form '${rule.value_form}'`);
    }
    if (valueForm === 'scalar' && resolvedShape !== 'scalar') {
      errors.push(`field ${fieldKey}: value_form=scalar requires shape=scalar`);
    }
    if (valueForm === 'list' && resolvedShape !== 'list') {
      errors.push(`field ${fieldKey}: value_form=list requires shape=list`);
    }
    if (valueForm === 'range' && !['range', 'object'].includes(resolvedShape)) {
      errors.push(`field ${fieldKey}: value_form=range requires shape=range|object`);
    }
    if (valueForm === 'mixed_values_and_ranges' && resolvedShape !== 'list') {
      errors.push(`field ${fieldKey}: value_form=mixed_values_and_ranges requires shape=list`);
    }
    if (valueForm === 'list_of_objects' && resolvedShape !== 'list') {
      errors.push(`field ${fieldKey}: value_form=list_of_objects requires shape=list`);
    }
    if (!['mandatory', 'non_mandatory'].includes(resolvedRequiredLevel)) {
      errors.push(`field ${fieldKey}: invalid required_level '${resolvedRequiredLevel || rule.required_level}'`);
    }
    if (!['always', 'sometimes', 'rare'].includes(resolvedAvailability)) {
      errors.push(`field ${fieldKey}: invalid availability '${resolvedAvailability || rule.availability}'`);
    }
    if (!['easy', 'medium', 'hard', 'very_hard'].includes(resolvedDifficulty)) {
      errors.push(`field ${fieldKey}: invalid difficulty '${resolvedDifficulty || rule.difficulty}'`);
    }
    if (!['open', 'open_prefer_known', 'closed', 'closed_with_curation'].includes(resolvedEnumPolicy)) {
      errors.push(`field ${fieldKey}: enum_policy must be open|open_prefer_known|closed|closed_with_curation`);
    }
    if (!isObject(rule.ui)) {
      errors.push(`field ${fieldKey}: ui object is required`);
    } else {
      if (!normalizeText(rule.ui.label)) {
        errors.push(`field ${fieldKey}: ui.label is required`);
      }
      if (!normalizeText(rule.ui.group)) {
        errors.push(`field ${fieldKey}: ui.group is required`);
      }
      if (asInt(rule.ui.order, 0) <= 0) {
        errors.push(`field ${fieldKey}: ui.order must be > 0`);
      }
      const hasTooltipMdKey = Object.prototype.hasOwnProperty.call(rule.ui, 'tooltip_md');
      const hasTooltipKey = normalizeText(rule.ui.tooltip_key);
      if (!hasTooltipMdKey && !hasTooltipKey) {
        errors.push(`field ${fieldKey}: ui.tooltip_md key or ui.tooltip_key is required`);
      }
    }
    // WHY: Type-driven validation — no parse_template checks.
    if (normalizeToken(resolvedShape) === 'list') {
      if (!isObject(resolvedListRules) || Object.keys(resolvedListRules).length === 0) {
        errors.push(`field ${fieldKey}: list shape requires list_rules`);
      }
    }
    // Unit required for numeric types (except integer without unit context)
    if ((resolvedType === 'number' || resolvedType === 'integer' || resolvedType === 'mixed_number_range' || resolvedType === 'range') && !normalizeText(resolvedUnit)) {
      // WHY: Allow unitless integers (e.g., key_count, button_count) — only warn, don't error
      if (resolvedType !== 'integer') {
        warnings.push(`field ${fieldKey}: numeric type '${resolvedType}' without unit declared`);
      }
    }
    const enumSource = resolvedEnumSource;
    const hasInlineKnownValues = toArray(rule.vocab?.known_values).length > 0;
    if ((resolvedEnumPolicy === 'closed' || resolvedEnumPolicy === 'closed_with_curation') && !enumSource && !hasInlineKnownValues) {
      errors.push(`field ${fieldKey}: enum_source is required for ${resolvedEnumPolicy}`);
    }
    if (enumSource) {
      const sourceType = normalizeToken(enumSource.type);
      const sourceRef = normalizeText(enumSource.ref);
      if (sourceType === 'known_values') {
        if ((resolvedEnumPolicy === 'closed' || resolvedEnumPolicy === 'closed_with_curation')
          && !knownValueFields.has(sourceRef || fieldKey)
          && !hasInlineKnownValues) {
          warnings.push(`field ${fieldKey}: enum_source known_values ref '${sourceRef || fieldKey}' not found`);
        }
      } else if (sourceType === 'component_db') {
        const normalizedSourceRef = normalizeFieldKey(sourceRef);
        if (!normalizedSourceRef || !componentTypes.has(normalizedSourceRef)) {
          errors.push(`field ${fieldKey}: enum_source component_db ref '${sourceRef}' not found`);
        }
      } else {
        errors.push(`field ${fieldKey}: invalid enum_source type '${sourceType}'`);
      }
    }
    if (resolvedEnumPolicy === 'open') {
      if (!isObject(resolvedNewValuePolicy)) {
        errors.push(`field ${fieldKey}: new_value_policy is required for ${resolvedEnumPolicy}`);
      } else {
        if (typeof resolvedNewValuePolicy.accept_if_evidence !== 'boolean') {
          errors.push(`field ${fieldKey}: new_value_policy.accept_if_evidence boolean required`);
        }
        if (typeof resolvedNewValuePolicy.mark_needs_curation !== 'boolean') {
          errors.push(`field ${fieldKey}: new_value_policy.mark_needs_curation boolean required`);
        }
      }
    }
    if (isObject(rule.selection_policy) && Object.keys(rule.selection_policy).length > 0) {
      const sourceField = normalizeFieldKey(rule.selection_policy.source_field || '');
      if (!sourceField) {
        errors.push(`field ${fieldKey}: selection_policy.source_field is required when selection_policy is set`);
      }
      if (rule.selection_policy.tolerance_ms !== undefined) {
        const tolerance = asNumber(rule.selection_policy.tolerance_ms);
        if (tolerance === null || tolerance < 0) {
          errors.push(`field ${fieldKey}: selection_policy.tolerance_ms must be >= 0`);
        }
      }
      if (rule.selection_policy.mode_preference !== undefined && !Array.isArray(rule.selection_policy.mode_preference)) {
        errors.push(`field ${fieldKey}: selection_policy.mode_preference must be an array when provided`);
      }
    }
    // WHY: Delimiter check for list fields — extraction may need delimiters for parsing
    if (resolvedShape === 'list') {
      const delimiters = toArray(parseRules?.delimiters || parse?.delimiters);
      if (delimiters.length === 0 && resolvedType === 'string') {
        warnings.push(`field ${fieldKey}: string list without delimiters configured`);
      }
    }
    if (isObject(rule.surfaces)) {
      const surfaceEnabled = ['hub_cards', 'xxl', 'filters', 'versus', 'radar', 'spec_table'].some((key) => Boolean(rule.surfaces[key]));
      if (surfaceEnabled && !normalizeText(rule.ui?.label)) {
        warnings.push(`field ${fieldKey}: surfaces enabled but ui.label missing`);
      }
    }
    if (resolvedEnumPolicy === 'open' && (!isObject(parseRules) || Object.keys(parseRules).length === 0) && (!isObject(parse) || Object.keys(parse).length === 0)) {
      warnings.push(`field ${fieldKey}: enum_policy=open but parse_rules is empty`);
    }
  }
  // ── Component invariants (INV-1/2/3) ─────────────────────────────────
  // Bidirectional check between field_rules and field_studio_map.component_sources.
  const invariantResult = runComponentInvariantChecks({ fields, map });
  errors.push(...invariantResult.errors);
  warnings.push(...invariantResult.warnings);

  // ── Component DB data quality validation ─────────────────────────────
  for (const [componentType, items] of Object.entries(componentDb || {})) {
    if (!Array.isArray(items) || items.length === 0) continue;

    // Collect all property keys across entities
    const allPropKeys = new Set();
    for (const entity of items) {
      if (isObject(entity.properties)) {
        for (const k of Object.keys(entity.properties)) allPropKeys.add(k);
      }
    }

    // Summarize property coverage to avoid high-volume per-entity warning spam.
    for (const pk of allPropKeys) {
      let presentCount = 0;
      let missingCount = 0;
      const missingExamples = [];
      for (const entity of items) {
        const entityProps = isObject(entity.properties) ? entity.properties : {};
        const val = entityProps[pk];
        const hasValue = !(val === undefined || val === null || val === '');
        if (hasValue) {
          presentCount += 1;
          continue;
        }
        missingCount += 1;
        if (missingExamples.length < 3) {
          missingExamples.push(entity.name || '?');
        }
      }
      if (missingCount === 0) {
        continue;
      }
      if (presentCount === 0) {
        warnings.push(`component_db.${componentType}: property "${pk}" has no populated values across ${items.length} entities`);
        continue;
      }
      const coveragePct = Number(((presentCount / items.length) * 100).toFixed(1));
      warnings.push(
        `component_db.${componentType}: property "${pk}" coverage ${presentCount}/${items.length} (${coveragePct}%), missing ${missingCount}; examples: ${missingExamples.join(', ')}`
      );
    }

    // Check for serial dates (5-digit numbers) in date-like properties
    const dateProps = [...allPropKeys].filter((k) => isDateLikeFieldKey(k));
    for (const entity of items) {
      const entityProps = isObject(entity.properties) ? entity.properties : {};
      for (const dp of dateProps) {
        const val = entityProps[dp];
        if (val !== undefined && val !== null && val !== '') {
          const s = String(val).trim();
          const serialDate = parseSerialDate(s);
          if (serialDate !== null) {
            warnings.push(`component_db.${componentType}: "${entity.name || '?'}" property "${dp}" looks like a serial date (${s}) – convert to ISO date`);
          }
        }
      }
    }

    // Check for entities with no properties at all
    for (const entity of items) {
      if (!isObject(entity.properties) || Object.keys(entity.properties).length === 0) {
        if (allPropKeys.size > 0) {
          warnings.push(`component_db.${componentType}: "${entity.name || '?'}" has no properties (other entities have ${allPropKeys.size})`);
        }
      }
    }
  }

  return {
    errors,
    warnings
  };
}
