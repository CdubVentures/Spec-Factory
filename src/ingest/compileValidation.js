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
  inferComponentTypeForField
} from './compileComponentHelpers.js';
import {
  normalizeValueForm,
  parseEnumSource
} from './compileFieldRuleBuilder.js';
import {
  canonicalParseTemplate
} from './compileFieldInference.js';

export function buildParseTemplateCatalog() {
  return {
    boolean_yes_no_unk: {
      description: "Parse yes/no/true/false/1/0 tokens. Output boolean or 'unk'.",
      tests: [
        { raw: 'Yes', expected: true },
        { raw: 'no', expected: false },
        { raw: 'unk', expected: 'unk' }
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
  const validParseTemplates = new Set([
    'text_field',
    'string',
    'enum_string',
    'boolean_yes_no_unk',
    'boolean_yes_no_unknown',
    'number_with_unit',
    'integer_with_unit',
    'list_of_tokens_delimited',
    'list_of_numbers_with_unit',
    'list_numbers_or_ranges_with_unit',
    'latency_list_modes_ms',
    'mode_tagged_list',
    'mode_tagged_values',
    'range_number',
    'url_field',
    'date_field',
    'component_reference',
    'price_range_string',
    'year_field',
    'integer_field'
  ]);

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
    const resolvedEffort = asInt(rule.effort, asInt(priority.effort, 0));
    const resolvedEnumPolicy = normalizeToken(rule.enum_policy || enumObj.policy || 'open_prefer_known');
    const resolvedParseTemplate = canonicalParseTemplate(rule.parse_template || parse.template);
    const resolvedUnit = normalizeText(rule.unit || contract.unit || parse.unit || '');
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
    const resolvedStrictUnitRequired = (
      typeof rule.strict_unit_required === 'boolean'
        ? rule.strict_unit_required
        : (typeof parse.strict_unit_required === 'boolean' ? parse.strict_unit_required : undefined)
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
    const resolvedPublishGate = (
      typeof rule.publish_gate === 'boolean'
        ? rule.publish_gate
        : (typeof priority.publish_gate === 'boolean' ? priority.publish_gate : false)
    );
    const resolvedBlockPublishWhenUnk = (
      typeof rule.block_publish_when_unk === 'boolean'
        ? rule.block_publish_when_unk
        : (typeof priority.block_publish_when_unk === 'boolean' ? priority.block_publish_when_unk : undefined)
    );
    const resolvedEvidenceRequired = (
      rule.evidence_required !== undefined
        ? rule.evidence_required !== false
        : (evidence.required !== false)
    );
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
    if (!['number', 'integer', 'string', 'boolean', 'date', 'url', 'object'].includes(resolvedType)) {
      errors.push(`field ${fieldKey}: invalid type '${resolvedType || rule.type}'`);
    }
    if (!['scalar', 'list', 'range', 'object'].includes(resolvedShape)) {
      errors.push(`field ${fieldKey}: invalid shape '${resolvedShape || rule.shape}'`);
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
    if (!['identity', 'required', 'critical', 'expected', 'optional', 'rare'].includes(resolvedRequiredLevel)) {
      errors.push(`field ${fieldKey}: invalid required_level '${resolvedRequiredLevel || rule.required_level}'`);
    }
    if (!['expected', 'sometimes', 'rare'].includes(resolvedAvailability)) {
      errors.push(`field ${fieldKey}: invalid availability '${resolvedAvailability || rule.availability}'`);
    }
    if (!['easy', 'medium', 'hard'].includes(resolvedDifficulty)) {
      errors.push(`field ${fieldKey}: invalid difficulty '${resolvedDifficulty || rule.difficulty}'`);
    }
    const effort = resolvedEffort;
    if (effort < 1 || effort > 10) {
      errors.push(`field ${fieldKey}: effort must be 1..10`);
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
    const parseTemplate = resolvedParseTemplate;
    if (!parseTemplate) {
      errors.push(`field ${fieldKey}: parse_template is required`);
    } else if (!validParseTemplates.has(parseTemplate)) {
      errors.push(`field ${fieldKey}: unsupported parse_template '${parseTemplate}'`);
    }
    if (normalizeToken(resolvedShape) === 'list') {
      if (!isObject(resolvedListRules) || Object.keys(resolvedListRules).length === 0) {
        errors.push(`field ${fieldKey}: list shape requires list_rules`);
      }
    }
    if (normalizeToken(resolvedShape) === 'object') {
      if (!isObject(resolvedObjectSchema) || Object.keys(resolvedObjectSchema).length === 0) {
        errors.push(`field ${fieldKey}: object shape requires object_schema`);
      }
    }
    if (parseTemplate === 'number_with_unit' || parseTemplate === 'integer_with_unit' || parseTemplate === 'list_of_numbers_with_unit' || parseTemplate === 'range_number' || parseTemplate === 'list_numbers_or_ranges_with_unit') {
      if (!normalizeText(resolvedUnit)) {
        errors.push(`field ${fieldKey}: unit required for ${parseTemplate}`);
      }
    } else if (parseTemplate === 'latency_list_modes_ms') {
      if (normalizeToken(resolvedShape) !== 'list') {
        errors.push(`field ${fieldKey}: latency_list_modes_ms requires shape=list`);
      }
      if (normalizeToken(resolvedType) !== 'object') {
        errors.push(`field ${fieldKey}: latency_list_modes_ms requires type=object`);
      }
      if (!normalizeText(resolvedUnit)) {
        errors.push(`field ${fieldKey}: latency_list_modes_ms requires unit (ms)`);
      }
      const objectSchema = isObject(resolvedObjectSchema) ? resolvedObjectSchema : {};
      if (!isObject(objectSchema) || Object.keys(objectSchema).length === 0) {
        errors.push(`field ${fieldKey}: latency_list_modes_ms requires object_schema`);
      }
    } else if (
      (resolvedType === 'number' || resolvedType === 'integer')
      && !normalizeText(resolvedUnit)
      && !['integer_field', 'price_range_string', 'year_field'].includes(parseTemplate)
    ) {
      errors.push(`field ${fieldKey}: numeric fields must declare unit`);
    }
    const listTemplates = new Set([
      'list_of_tokens_delimited',
      'list_of_numbers_with_unit',
      'mode_tagged_list',
      'mode_tagged_values',
      'latency_list_modes_ms',
      'list_numbers_or_ranges_with_unit'
    ]);
    if (listTemplates.has(parseTemplate) && normalizeToken(resolvedShape) !== 'list') {
      errors.push(`field ${fieldKey}: parse_template '${parseTemplate}' requires shape=list`);
    }
    if (parseTemplate === 'component_reference') {
      const parsedEnumSourceForComponent = resolvedEnumSource;
      const inferredComponentType = inferComponentTypeForField(fieldKey, componentTypes);
      const hasComponentSource = normalizeToken(parsedEnumSourceForComponent?.type || '') === 'component_db'
        || (isObject(rule.component) && normalizeToken(parseEnumSource(rule.component.source || `component_db.${rule.component.type || ''}`)?.type || '') === 'component_db')
        || Boolean(inferredComponentType);
      if (!hasComponentSource) {
        errors.push(`field ${fieldKey}: component_reference requires component_db source`);
      }
    }
    if ((resolvedType === 'number' || resolvedType === 'integer') && ['text_field', 'string', 'enum_string'].includes(parseTemplate)) {
      errors.push(`field ${fieldKey}: numeric field parse_template '${parseTemplate}' is incompatible`);
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
    if (resolvedPublishGate && typeof resolvedBlockPublishWhenUnk !== 'boolean') {
      errors.push(`field ${fieldKey}: block_publish_when_unk boolean required when publish_gate=true`);
    }
    if (resolvedEvidenceRequired && resolvedMinEvidenceRefs <= 0) {
      errors.push(`field ${fieldKey}: min_evidence_refs must be >= 1 when evidence is required`);
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
    if ((resolvedShape === 'list') && parseTemplate !== 'list_of_tokens_delimited' && parseTemplate !== 'list_of_numbers_with_unit' && parseTemplate !== 'mode_tagged_list' && parseTemplate !== 'mode_tagged_values' && parseTemplate !== 'latency_list_modes_ms' && parseTemplate !== 'list_numbers_or_ranges_with_unit') {
      warnings.push(`field ${fieldKey}: list shape with parse template '${parseTemplate}' may be inconsistent`);
    }
    if (resolvedShape === 'list' && ['list_of_tokens_delimited', 'list_of_numbers_with_unit', 'mode_tagged_list', 'mode_tagged_values', 'latency_list_modes_ms', 'list_numbers_or_ranges_with_unit'].includes(parseTemplate)) {
      const delimiters = toArray(parseRules?.delimiters || parse?.delimiters);
      if (delimiters.length === 0 && parseTemplate !== 'mode_tagged_list' && parseTemplate !== 'mode_tagged_values') {
        errors.push(`field ${fieldKey}: list parse template requires parse_rules.delimiters`);
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
