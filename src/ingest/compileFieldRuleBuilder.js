import {
  INSTRUMENTED_HARD_FIELDS,
  toArray,
  isObject,
  asInt,
  asNumber,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isNumericContractType,
  titleFromKey,
  stableSortStrings,
  orderedUniqueStrings,
  sortDeep,
  findComponentSourceRowByType
} from './compileUtils.js';
import { isAllowedEnumBucket } from './compileMapNormalization.js';
import {
  inferFromSamples,
  inferUnitByField,
  inferGroup,
  inferDifficulty,
  effortFromDifficulty,
  inferRequiredLevel,
  inferAvailability,
} from './compileFieldInference.js';
import { normalizeConsumerOverrides } from '../field-rules/consumerGate.js';

export function normalizeValueForm(value, shape = 'scalar') {
  const token = normalizeToken(value);
  const normalizedShape = normalizeToken(shape || 'scalar');
  if (token === 'single' || token === 'scalar') {
    return normalizedShape === 'list' ? 'list' : 'scalar';
  }
  if (token === 'set' || token === 'list') {
    return normalizedShape === 'scalar' ? 'scalar' : 'list';
  }
  if (token === 'range') {
    return (normalizedShape === 'list') ? 'mixed_values_and_ranges' : 'range';
  }
  if (token === 'mixed' || token === 'mixed_values_and_ranges' || token === 'list_ranges') {
    return normalizedShape === 'scalar' ? 'scalar' : 'mixed_values_and_ranges';
  }
  if (token === 'list_of_objects') {
    return 'list_of_objects';
  }
  if (normalizedShape === 'list') return 'list';
  if (normalizedShape === 'range' || normalizedShape === 'object') return 'range';
  return 'scalar';
}

export function parseEnumSource(sourceRaw, fallbackField = '') {
  if (isObject(sourceRaw)) {
    const sourceTypeRaw = normalizeToken(sourceRaw.type);
    const sourceType = sourceTypeRaw === 'component_db_sources' ? 'component_db' : sourceTypeRaw;
    const sourceRef = normalizeText(sourceRaw.ref || fallbackField);
    if (sourceType && sourceRef) {
      if (sourceType === 'enum_buckets' || sourceType === 'known_values' || sourceType === 'datalists' || sourceType === 'data_lists') {
        return {
          type: 'known_values',
          ref: sourceRef
        };
      }
      return {
        type: sourceType,
        ref: sourceRef
      };
    }
    return null;
  }
  const sourceText = normalizeText(sourceRaw);
  if (!sourceText) {
    return null;
  }
  const colonIndex = sourceText.indexOf(':');
  if (colonIndex > 0) {
    const sourceTypeRaw = normalizeToken(sourceText.slice(0, colonIndex));
    const sourceType = sourceTypeRaw === 'component_db_sources' ? 'component_db' : sourceTypeRaw;
    const sourceRef = normalizeText(sourceText.slice(colonIndex + 1));
    if (sourceRef) {
      if (sourceType === 'enum_buckets' || sourceType === 'known_values' || sourceType === 'datalists') {
        return {
          type: 'known_values',
          ref: sourceRef
        };
      }
      if (sourceType === 'component_db') {
        return {
          type: 'component_db',
          ref: sourceRef
        };
      }
    }
  }
  const dotIndex = sourceText.indexOf('.');
  if (dotIndex > 0) {
    const sourceTypeRaw = normalizeToken(sourceText.slice(0, dotIndex));
    const sourceType = sourceTypeRaw === 'component_db_sources' ? 'component_db' : sourceTypeRaw;
    const sourceRef = normalizeText(sourceText.slice(dotIndex + 1));
    if (sourceType && sourceRef) {
      if (sourceType === 'data_lists' || sourceType === 'datalists' || sourceType === 'known_values') {
        return {
          type: 'known_values',
          ref: sourceRef
        };
      }
      return {
        type: sourceType,
        ref: sourceRef
      };
    }
  }
  const standalone = normalizeFieldKey(sourceText);
  if (standalone) {
    if (standalone === 'yes_no' || isAllowedEnumBucket(standalone)) {
      return {
        type: 'known_values',
        ref: standalone
      };
    }
  }
  return null;
}

export function sourceRefToString(source = null) {
  if (!isObject(source)) {
    return null;
  }
  const sourceType = normalizeToken(source.type);
  const sourceRef = normalizeText(source.ref);
  if (!sourceType || !sourceRef) {
    return null;
  }
  if (sourceType === 'known_values') {
    if (sourceRef === 'yes_no') {
      return 'yes_no';
    }
    return `data_lists.${sourceRef}`;
  }
  return `${sourceType}.${sourceRef}`;
}

export function roundTokenToContract(roundToken = '') {
  const token = normalizeToken(roundToken);
  if (token === 'int') {
    return {
      decimals: 0,
      mode: 'nearest'
    };
  }
  if (token === '1dp') {
    return {
      decimals: 1,
      mode: 'nearest'
    };
  }
  if (token === '2dp') {
    return {
      decimals: 2,
      mode: 'nearest'
    };
  }
  return null;
}

export function sampleValueFormFromInternal(valueForm = '', shape = 'scalar') {
  const token = normalizeValueForm(valueForm, shape);
  if (token === 'scalar') return 'scalar';
  if (token === 'list') return 'list';
  if (token === 'range') return 'range';
  if (token === 'list_of_objects') return 'list_of_objects';
  return 'mixed_values_and_ranges';
}

export function buildSearchHints({
  key = '',
  requiredLevel = 'optional',
  availability = 'sometimes',
  difficulty = 'medium',
  componentType = '',
  enumSource = null
} = {}) {
  const fieldLabel = titleFromKey(key);
  const hints = {
    preferred_tiers: ['tier1', 'tier2', 'tier3'],
    query_terms: [fieldLabel],
    domain_hints: ['manufacturer', 'support', 'manual', 'pdf']
  };
  if (componentType) {
    hints.query_terms = [fieldLabel, 'component'];
  }
  return sortDeep(hints);
}

export function flattenSampleStyleOverride(overrideRaw = {}, baseRule = {}) {
  if (!isObject(overrideRaw)) {
    return {};
  }
  const hasNestedShape = (
    isObject(overrideRaw.priority)
    || isObject(overrideRaw.contract)
    || isObject(overrideRaw.parse)
    || isObject(overrideRaw.enum)
    || isObject(overrideRaw.component)
  );
  if (!hasNestedShape) {
    return { ...overrideRaw };
  }
  const out = { ...overrideRaw };
  const priority = isObject(overrideRaw.priority) ? overrideRaw.priority : {};
  const contract = isObject(overrideRaw.contract) ? overrideRaw.contract : {};
  const parse = isObject(overrideRaw.parse) ? overrideRaw.parse : {};
  const enumObj = isObject(overrideRaw.enum) ? overrideRaw.enum : {};
  const evidence = isObject(overrideRaw.evidence) ? overrideRaw.evidence : {};
  const component = isObject(overrideRaw.component) ? overrideRaw.component : {};

  if (!normalizeText(out.required_level) && normalizeText(priority.required_level)) {
    out.required_level = normalizeToken(priority.required_level);
  }
  if (!normalizeText(out.availability) && normalizeText(priority.availability)) {
    out.availability = normalizeToken(priority.availability);
  }
  if (!normalizeText(out.difficulty) && normalizeText(priority.difficulty)) {
    out.difficulty = normalizeToken(priority.difficulty);
  }
  if (out.effort === undefined && priority.effort !== undefined) {
    out.effort = asInt(priority.effort, asInt(baseRule.effort, 5));
  }
  if (out.publish_gate === undefined && priority.publish_gate !== undefined) {
    out.publish_gate = priority.publish_gate === true;
  }
  if (out.block_publish_when_unk === undefined && priority.block_publish_when_unk !== undefined) {
    out.block_publish_when_unk = priority.block_publish_when_unk === true;
  }

  const contractType = normalizeToken(contract.type);
  if (!normalizeText(out.type) && contractType) {
    out.type = contractType;
  }
  const contractShape = normalizeToken(contract.shape);
  if (!normalizeText(out.shape) && contractShape) {
    out.shape = contractShape;
  }
  const contractUnit = normalizeText(contract.unit);
  if (!normalizeText(out.unit) && contractUnit) {
    out.unit = contractUnit;
  }
  if (!normalizeText(out.round) && isObject(contract.rounding)) {
    const decimals = asInt(contract.rounding.decimals, null);
    if (decimals === 0) out.round = 'int';
    else if (decimals === 1) out.round = '1dp';
    else if (decimals === 2) out.round = '2dp';
    else out.round = 'none';
  }
  if (!isObject(out.validate) && isObject(contract.range)) {
    const min = asNumber(contract.range.min);
    const max = asNumber(contract.range.max);
    if (min !== null || max !== null) {
      out.validate = {
        kind: 'number_range',
        ...(min !== null ? { min } : {}),
        ...(max !== null ? { max } : {})
      };
    }
  }
  if (!isObject(out.list_rules) && isObject(contract.list_rules)) {
    out.list_rules = { ...contract.list_rules };
  }
  if (!isObject(out.object_schema) && isObject(contract.object_schema)) {
    out.object_schema = { ...contract.object_schema };
  }

  // WHY: parse_template eliminated — type+shape is the contract. Legacy parse.template in overrides is ignored.
  if (!isObject(out.parse_rules)) {
    out.parse_rules = {};
  }
  if (Array.isArray(parse.delimiters) && parse.delimiters.length > 0) {
    out.parse_rules.delimiters = orderedUniqueStrings(parse.delimiters);
  }
  if (Array.isArray(parse.range_separators) && parse.range_separators.length > 0) {
    out.parse_rules.separators = orderedUniqueStrings(parse.range_separators);
  }
  if (normalizeText(parse.component_type)) {
    out.parse_rules.component_type = normalizeFieldKey(parse.component_type);
  }
  for (const [parseKey, parseValue] of Object.entries(parse)) {
    if (['template', 'delimiters', 'range_separators', 'component_type'].includes(parseKey)) {
      continue;
    }
    if (parseValue !== undefined) {
      out.parse_rules[parseKey] = parseValue;
    }
  }

  if (!normalizeText(out.enum_policy) && normalizeText(enumObj.policy)) {
    out.enum_policy = normalizeToken(enumObj.policy);
  }
  const enumSource = parseEnumSource(enumObj.source, normalizeFieldKey(out.key || ''));
  if (!isObject(out.enum_source) && enumSource) {
    out.enum_source = enumSource;
  }
  if (!isObject(out.new_value_policy) && isObject(enumObj.new_value_policy)) {
    out.new_value_policy = { ...enumObj.new_value_policy };
  }
  if (!isObject(out.vocab)) {
    out.vocab = {};
  }
  if (!normalizeText(out.vocab.mode) && normalizeText(out.enum_policy)) {
    out.vocab.mode = normalizeToken(out.enum_policy);
  }
  if (out.vocab.allow_new === undefined) {
    out.vocab.allow_new = !['closed', 'closed_with_curation'].includes(normalizeToken(out.enum_policy));
  }

  if (component && !isObject(out.enum_source)) {
    const componentSource = parseEnumSource(component.source || `component_db.${component.type || ''}`);
    if (componentSource) {
      out.enum_source = componentSource;
    }
  }
  // WHY: component_reference was a parse_template. Now component detection is handled by contract.type + parse.component_type.
  if (component && component.require_identity_evidence !== undefined) {
    out.require_component_identity_evidence = component.require_identity_evidence === true;
  }

  if (evidence.min_evidence_refs !== undefined && out.min_evidence_refs === undefined) {
    out.min_evidence_refs = asInt(evidence.min_evidence_refs, 1);
  }
  if (!isObject(out.evidence) && isObject(evidence)) {
    out.evidence = { ...evidence };
  }

  const valueFormSource = normalizeText(overrideRaw.value_form);
  const resolvedShape = normalizeToken(out.shape || baseRule.shape || 'scalar');
  const valueFormSeed = valueFormSource || out.value_form || (hasNestedShape ? '' : baseRule.value_form);
  out.value_form = normalizeValueForm(
    valueFormSeed,
    resolvedShape
  );
  return out;
}

export function mergeFieldOverride(baseRule, overrideRaw = {}) {
  if (!isObject(overrideRaw)) {
    return baseRule;
  }
  const override = flattenSampleStyleOverride(overrideRaw, baseRule);
  if (Array.isArray(override.aliases)) {
    override.aliases = stableSortStrings(override.aliases);
  }
  if (isObject(override.ui)) {
    override.ui = {
      ...baseRule.ui,
      ...override.ui
    };
  }
  if (isObject(override.parse_rules)) {
    override.parse_rules = {
      ...baseRule.parse_rules,
      ...override.parse_rules
    };
  }
  if (isObject(override.vocab)) {
    override.vocab = {
      ...baseRule.vocab,
      ...override.vocab
    };
  }
  if (!normalizeText(override.value_form)) {
    override.value_form = normalizeValueForm(baseRule.value_form, normalizeToken(override.shape || baseRule.shape || 'scalar'));
  } else {
    override.value_form = normalizeValueForm(override.value_form, normalizeToken(override.shape || baseRule.shape || 'scalar'));
  }
  const merged = {
    ...baseRule,
    ...override
  };
  // WHY: parse_template eliminated. Strip any legacy value that leaked through from overrides.
  delete merged.parse_template;
  if (isObject(merged.parse)) {
    delete merged.parse.template;
  }
  return merged;
}

// WHY: Type-driven parse defaults. Replaces the old parseRulesForTemplate() switch.
// Adding a type = add one branch here. O(1) scaling.
export function defaultParseRules(type, shape, { unit = '', componentType = '' } = {}) {
  const base = {};
  // WHY: parse.unit* knobs retired — contract.unit is SSOT, Phase 3 registry handles synonyms.
  if (shape === 'list') {
    base.delimiters = [',', '/', '|', ';'];
  }
  if (type === 'boolean') {
    base.true_tokens = ['yes', 'true', '1', 'on'];
    base.false_tokens = ['no', 'false', '0', 'off'];
    base.unknown_tokens = ['unk', 'n/a', 'na', 'unknown'];
  }
  if (type === 'date') {
    base.accepted_formats = ['YYYY-MM-DD', 'YYYY-MM', 'YYYY'];
  }
  if (type === 'url') {
    base.require_scheme = true;
  }
  if (type === 'range' || type === 'mixed_number_range') {
    base.range_separators = ['-', '\u2013'];
  }
  if (componentType) {
    base.component_type = componentType;
  }
  return base;
}

export function buildFieldRuleDraft({
  key,
  label,
  samples = [],
  enumValues = [],
  componentType = '',
  tooltipEntry = null,
  expectations,
  order = 0,
  uiDefaults = {}
}) {
  const inferred = inferFromSamples(key, samples);
  const inferredUnit = inferUnitByField(key);
  const unit = inferredUnit || (inferred.type === 'number' ? 'none' : '');
  const aliases = orderedUniqueStrings([key, label, titleFromKey(key)]).sort((a, b) => a.localeCompare(b));
  const requiredLevel = inferRequiredLevel(key, expectations);
  const availability = inferAvailability(key, expectations);
  const isInstrumentedField = INSTRUMENTED_HARD_FIELDS.has(normalizeFieldKey(key));
  const difficulty = inferDifficulty({
    key,
    type: inferred.type,
    shape: inferred.shape
  });
  const effort = isInstrumentedField ? 9 : effortFromDifficulty(difficulty);
  const enumPolicy = enumValues.length > 0 ? 'open_prefer_known' : 'open';
  const parseRules = defaultParseRules(inferred.type, inferred.shape, { unit, componentType });
  const valueForm = normalizeValueForm('', inferred.shape);

  const validate = {};
  if (inferred.type === 'number') {
    validate.kind = 'number_range';
    if (key === 'weight') {
      validate.min = 1;
      validate.max = 500;
    } else if (key === 'dpi') {
      validate.min = 50;
      validate.max = 100000;
    } else if (key === 'polling_rate') {
      validate.min = 10;
      validate.max = 10000;
    }
  }

  const ui = {
    label: label || titleFromKey(key),
    group: inferGroup(key),
    order,
    tooltip_md: normalizeText(uiDefaults.tooltip_md || tooltipEntry?.markdown || ''),
    short_label: null,
    prefix: null,
    suffix: unit && unit !== 'none' ? unit : null,
    examples: [],
    placeholder: 'unk',
    input_control: inferred.shape === 'list' ? 'list_editor' : 'text',
    tooltip_key: normalizeText(tooltipEntry?.key || '') || null,
    tooltip_source: normalizeText(tooltipEntry?.source || '') || null,
    display_mode: key === 'polling_rate' ? 'high' : 'all',
    display_decimals: inferred.type === 'number' ? 1 : 0
  };

  return {
    key,
    canonical_key: key,
    aliases,
    type: inferred.type,
    shape: inferred.shape,
    value_form: valueForm,
    unit,
    round: inferred.type === 'number' ? 'int' : 'none',
    required_level: requiredLevel,
    availability,
    difficulty,
    effort,
    enum_policy: enumPolicy,
    parse_rules: parseRules,
    array_handling: 'none',
    new_value_policy: {
      accept_if_evidence: true,
      mark_needs_curation: true
    },
    vocab: {
      mode: enumPolicy,
      allow_new: enumPolicy !== 'closed',
      known_values: enumValues
    },
    evidence: {
      min_evidence_refs: requiredLevel === 'identity' || requiredLevel === 'required' ? 2 : 1,
      tier_preference: isInstrumentedField ? ['tier2', 'tier1', 'tier3'] : ['tier1', 'tier2', 'tier3'],
    },
    publish_gate: (requiredLevel === 'identity' || requiredLevel === 'required') && !isInstrumentedField,
    publish_gate_reason: requiredLevel === 'identity' ? 'missing_identity' : (requiredLevel === 'required' ? 'missing_required' : ''),
    block_publish_when_unk: (requiredLevel === 'identity' || requiredLevel === 'required') && !isInstrumentedField,
    ui,
    validate
  };
}

export function fieldTypeForContract(rule = {}) {
  if (rule.shape === 'list') return 'list';
  if (rule.type === 'number' || rule.type === 'integer') return 'number';
  if (rule.type === 'boolean') return 'boolean';
  if (rule.type === 'date') return 'date';
  if (rule.type === 'url') return 'string';
  if (rule.type === 'object') return 'string';
  return 'string';
}

export function buildStudioFieldRule({
  category = '',
  key,
  rule = {},
  row = {},
  map = {},
  samples = [],
  enumLists = {},
  componentDb = {}
} = {}) {
  const priorityBlock = isObject(rule.priority) ? rule.priority : {};
  const requiredLevel = normalizeToken(rule.required_level || priorityBlock.required_level || 'optional');
  const availability = normalizeToken(rule.availability || priorityBlock.availability || 'sometimes');
  const difficulty = normalizeToken(rule.difficulty || priorityBlock.difficulty || 'medium');
  const effort = asInt(
    rule.effort,
    asInt(priorityBlock.effort, 5)
  );
  const publishGate = (
    rule.publish_gate === true
    || (rule.publish_gate === undefined && priorityBlock.publish_gate === true)
  );
  const blockPublishWhenUnk = (
    rule.block_publish_when_unk === true
    || (rule.block_publish_when_unk === undefined && priorityBlock.block_publish_when_unk === true)
  );

  const enumBlock = isObject(rule.enum) ? rule.enum : {};
  const source = parseEnumSource(rule.enum_source || enumBlock.source, key);
  const sourceRef = sourceRefToString(source);
  const policy = normalizeToken(rule.enum_policy || enumBlock.policy || 'open_prefer_known');
  // WHY: parse_template eliminated. contractType drives all behavior.
  // WHY: Fallback chain handles both merge-path objects (rule.type/shape) and
  // studio-output passthrough objects (rule.data_type/output_shape/contract.*).
  const contractType = normalizeToken(rule.type || rule.data_type || rule.contract?.type || 'string');
  const contractShape = normalizeToken(rule.shape || rule.output_shape || rule.contract?.shape || 'scalar');
  const valueForm = sampleValueFormFromInternal(rule.value_form, contractShape);
  const ui = isObject(rule.ui) ? rule.ui : {};
  const vocab = isObject(rule.vocab) ? rule.vocab : {};
  const evidence = isObject(rule.evidence) ? rule.evidence : {};
  const parseRules = isObject(rule.parse_rules) ? rule.parse_rules : {};
  const validate = isObject(rule.validate) ? rule.validate : {};

  const nestedContract = isObject(rule.contract) ? { ...rule.contract } : {};
  nestedContract.unknown_token = normalizeText(
    nestedContract.unknown_token || rule.unknown_token || 'unk'
  ) || 'unk';
  nestedContract.unknown_reason_required = nestedContract.unknown_reason_required !== false;
  nestedContract.type = normalizeToken(nestedContract.type || contractType || 'string') || 'string';
  nestedContract.shape = normalizeToken(nestedContract.shape || contractShape || 'scalar') || 'scalar';
  if (contractType === 'date') {
    nestedContract.format = 'date';
  } else if (contractType === 'url') {
    nestedContract.format = 'uri';
  }
  if (!normalizeText(nestedContract.unit) && normalizeText(rule.unit)) {
    nestedContract.unit = normalizeText(rule.unit);
  }
  const rounding = roundTokenToContract(rule.round || '') || roundTokenToContract(nestedContract.rounding || '');
  if (rounding && !isObject(nestedContract.rounding)) {
    nestedContract.rounding = rounding;
  }
  if (!isObject(nestedContract.range) && validate.kind === 'number_range') {
    const min = asNumber(validate.min);
    const max = asNumber(validate.max);
    if (min !== null || max !== null) {
      nestedContract.range = {
        ...(min !== null ? { min } : {}),
        ...(max !== null ? { max } : {})
      };
    }
  }
  if (nestedContract.shape === 'list' && !isObject(nestedContract.list_rules) && isObject(rule.list_rules)) {
    nestedContract.list_rules = {
      dedupe: rule.list_rules.dedupe !== false,
      sort: normalizeToken(rule.list_rules.sort || 'none') || 'none',
      min_items: asInt(rule.list_rules.min_items, 0),
      max_items: asInt(rule.list_rules.max_items, 100)
    };
  }
  if (nestedContract.shape === 'list' && !isObject(nestedContract.list_rules)) {
    nestedContract.list_rules = {
      dedupe: true,
      sort: 'none',
      min_items: 0,
      max_items: 100
    };
  }
  if (nestedContract.shape === 'object' && !isObject(nestedContract.object_schema) && isObject(rule.object_schema)) {
    nestedContract.object_schema = sortDeep(rule.object_schema);
  }
  if (valueForm === 'mixed') {
    nestedContract.item_union = [
      contractType === 'integer' ? 'integer' : 'number',
      {
        type: 'object',
        schema: {
          min: {
            type: contractType === 'integer' ? 'integer' : 'number'
          },
          max: {
            type: contractType === 'integer' ? 'integer' : 'number'
          }
        }
      }
    ];
  }

  const nestedParse = isObject(rule.parse) ? { ...rule.parse } : {};
  // WHY: parse.template eliminated. Type+shape is the contract. Remove any legacy template from parse object.
  delete nestedParse.template;
  if (Array.isArray(parseRules.delimiters) && parseRules.delimiters.length > 0) {
    nestedParse.delimiters = toArray(parseRules.delimiters).map((value) => normalizeText(value)).filter(Boolean);
  }
  if (Array.isArray(parseRules.separators) && parseRules.separators.length > 0) {
    nestedParse.range_separators = toArray(parseRules.separators).map((value) => normalizeText(value)).filter(Boolean);
  }
  for (const [parseRuleKey, parseRuleValue] of Object.entries(parseRules)) {
    if (['delimiters', 'separators'].includes(parseRuleKey)) {
      continue;
    }
    if (parseRuleValue !== undefined) {
      nestedParse[parseRuleKey] = parseRuleValue;
    }
  }
  if (nestedParse.template === 'date_field' && !Array.isArray(nestedParse.accepted_formats)) {
    nestedParse.accepted_formats = ['YYYY-MM-DD', 'YYYY-MM', 'YYYY'];
  }

  const enumMatch = isObject(enumBlock.match) ? enumBlock.match : {};
  const nestedEnum = {
    policy: policy || 'open_prefer_known',
    source: sourceRef,
    match: {
      strategy: normalizeToken(rule.enum_match_strategy || enumMatch.strategy || 'exact') || 'exact'
    }
  };
  const fuzzy = asNumber(rule.enum_fuzzy_threshold ?? enumMatch.fuzzy_threshold);
  if (fuzzy !== null) {
    nestedEnum.match.fuzzy_threshold = fuzzy;
  }
  if (nestedEnum.policy === 'open' || nestedEnum.policy === 'open_prefer_known') {
    nestedEnum.new_value_policy = isObject(rule.new_value_policy)
      ? sortDeep(rule.new_value_policy)
      : (isObject(enumBlock.new_value_policy)
        ? sortDeep(enumBlock.new_value_policy)
        : {
          accept_if_evidence: true,
          mark_needs_curation: true
        });
  }

  const componentBlock = isObject(rule.component) ? rule.component : {};
  const componentSource = parseEnumSource(componentBlock.source || (componentBlock.type ? `component_db.${componentBlock.type}` : ''), key);
  const effectiveComponentSource = source?.type === 'component_db' ? source : componentSource;
  const nestedComponent = effectiveComponentSource?.type === 'component_db'
    ? {
      type: normalizeText(componentBlock.type || effectiveComponentSource.ref),
      source: sourceRefToString(effectiveComponentSource),
      require_identity_evidence: componentBlock.require_identity_evidence !== false
        && rule.require_component_identity_evidence !== false,
      allow_new_components: componentBlock.allow_new_components !== false
        && rule.allow_new_components !== false
    }
    : {};

  // Extend component block with match, ai, and priority sub-objects if authored
  if (Object.keys(nestedComponent).length > 0) {
    const matchInput = isObject(componentBlock.match) ? componentBlock.match : {};
    const rawFuzzyThreshold = asNumber(matchInput.fuzzy_threshold);
    const rawPropWeight = asNumber(matchInput.property_weight);
    const rawNameWeight = asNumber(matchInput.name_weight);
    const rawAutoAccept = asNumber(matchInput.auto_accept_score);
    const rawFlagReview = asNumber(matchInput.flag_review_score);
    nestedComponent.match = {
      fuzzy_threshold: rawFuzzyThreshold !== null ? Math.max(0, Math.min(1, rawFuzzyThreshold)) : 0.75,
      property_weight: rawPropWeight !== null ? Math.max(0, Math.min(1, rawPropWeight)) : 0.6,
      name_weight: rawNameWeight !== null ? Math.max(0, Math.min(1, rawNameWeight)) : 0.4,
      property_keys: (() => {
        const authored = toArray(matchInput.property_keys).map(k => normalizeFieldKey(k)).filter(Boolean);
        if (authored.length > 0) return authored;
        const cSources = toArray(map?.component_sources).length > 0
          ? toArray(map.component_sources)
          : toArray(map?.component_sheets);
        const cRow = findComponentSourceRowByType(cSources, nestedComponent.type);
        return toArray(isObject(cRow?.roles) ? cRow.roles.properties : [])
          .map(entry => normalizeFieldKey(entry?.field_key || entry?.key || entry?.property_key || ''))
          .filter(Boolean);
      })(),
      auto_accept_score: rawAutoAccept !== null ? Math.max(0, Math.min(1, rawAutoAccept)) : 0.95,
      flag_review_score: rawFlagReview !== null ? Math.max(0, Math.min(1, rawFlagReview)) : 0.65,
    };

    const aiInput = isObject(componentBlock.ai) ? componentBlock.ai : {};
    const validAiModes = ['judge', 'planner', 'advisory', 'off'];
    const validContextLevels = ['name_only', 'properties', 'properties_and_evidence'];
    nestedComponent.ai = {
      mode: validAiModes.includes(normalizeToken(aiInput.mode)) ? normalizeToken(aiInput.mode) : 'off',
      model_strategy: normalizeToken(aiInput.model_strategy || '') || 'auto',
      context_level: validContextLevels.includes(normalizeToken(aiInput.context_level))
        ? normalizeToken(aiInput.context_level) : 'properties',
      reasoning_note: normalizeText(aiInput.reasoning_note || ''),
    };

    const priorityInput = isObject(componentBlock.priority) ? componentBlock.priority : {};
    const validDifficulties = ['easy', 'medium', 'hard'];
    nestedComponent.priority = {
      difficulty: validDifficulties.includes(normalizeToken(priorityInput.difficulty))
        ? normalizeToken(priorityInput.difficulty) : 'medium',
      effort: Math.max(1, Math.min(10, asInt(priorityInput.effort, 5))),
    };
  }

  const nestedEvidence = isObject(rule.evidence) ? { ...rule.evidence } : {};
  nestedEvidence.required = nestedEvidence.required !== false;
  nestedEvidence.min_evidence_refs = asInt(
    nestedEvidence.min_evidence_refs,
    asInt(rule.min_evidence_refs, 1)
  );
  const evidenceTierPreference = toArray(nestedEvidence.tier_preference || ['tier1', 'tier2', 'tier3'])
    .map((value) => normalizeText(value))
    .filter(Boolean);
  nestedEvidence.tier_preference = evidenceTierPreference.length ? evidenceTierPreference : ['tier1', 'tier2', 'tier3'];
  delete nestedEvidence.conflict_policy;

  // Build ai_assist block (auto-derive if not explicitly set)
  const aiAssistInput = isObject(rule.ai_assist) ? rule.ai_assist : {};
  const nestedAiAssist = {
    mode: normalizeToken(aiAssistInput.mode || '') || null,
    model_strategy: normalizeToken(aiAssistInput.model_strategy || '') || 'auto',
    max_calls: asInt(aiAssistInput.max_calls, 0) || null,
    max_tokens: asInt(aiAssistInput.max_tokens, 0) || null,
    reasoning_note: normalizeText(aiAssistInput.reasoning_note || '')
  };

  const uiOut = {
    label: normalizeText(ui.label || titleFromKey(key)),
    group: normalizeText(ui.group || inferGroup(key)),
    order: asInt(ui.order, 1),
    tooltip_md: normalizeText(ui.tooltip_md || ''),
    prefix: normalizeText(ui.prefix || '') || null,
    suffix: normalizeText(ui.suffix || '') || null,
    examples: toArray(ui.examples || []).map((value) => normalizeText(value)).filter(Boolean),
    short_label: normalizeText(ui.short_label || '') || null,
    placeholder: normalizeText(ui.placeholder || 'unk') || 'unk',
    input_control: normalizeText(ui.input_control || 'text') || 'text',
    guidance_md: normalizeText(ui.guidance_md || '') || null,
    tooltip_key: normalizeText(ui.tooltip_key || '') || null,
    tooltip_source: normalizeText(ui.tooltip_source || '') || null,
    display_mode: normalizeToken(ui.display_mode || 'all') || 'all'
  };
  if (ui.display_decimals !== undefined || nestedContract.type === 'number' || nestedContract.type === 'integer') {
    uiOut.display_decimals = asInt(ui.display_decimals, 0);
  }

  const keySheet = normalizeText(map?.key_list?.sheet || '');
  const keyColumn = normalizeText(map?.key_list?.column || '').toUpperCase();
  const keyRow = asInt(row.row, 0);
  const dataEntrySamples = toArray(samples)
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const defaultFieldStudioHints = {
    dataEntry: {
      sheet: keySheet || null,
      key_cell: keySheet && keyColumn && keyRow > 0 ? `${keyColumn}${keyRow}` : null,
      row: keyRow || null,
      sample_values: dataEntrySamples
    }
  };
  const existingFieldStudioHints = isObject(rule.field_studio_hints) ? rule.field_studio_hints : {};
  const existingDataEntryHints = isObject(existingFieldStudioHints.dataEntry) ? existingFieldStudioHints.dataEntry : {};
  const fieldStudioHints = {
    ...defaultFieldStudioHints,
    ...existingFieldStudioHints,
    dataEntry: {
      ...defaultFieldStudioHints.dataEntry,
      ...existingDataEntryHints,
      sample_values: toArray(existingDataEntryHints.sample_values).length
        ? toArray(existingDataEntryHints.sample_values).map((value) => normalizeText(value)).filter(Boolean)
        : dataEntrySamples
    }
  };
  if (source?.type === 'known_values') {
    const enumRow = toArray(map?.enum_lists).find((entry) => normalizeFieldKey(entry?.field || entry?.bucket || '') === normalizeFieldKey(source.ref || key));
    if (enumRow && !isObject(fieldStudioHints.enum_column)) {
      fieldStudioHints.enum_column = {
        sheet: normalizeText(enumRow.sheet || ''),
        header: normalizeFieldKey(enumRow.field || enumRow.bucket || '')
      };
    }
  }
  if (source?.type === 'component_db') {
    const componentRows = toArray(map?.component_sources).length > 0 ? toArray(map.component_sources) : toArray(map?.component_sheets);
    const componentRow = findComponentSourceRowByType(componentRows, normalizeFieldKey(source.ref || ''));
    if (componentRow && !normalizeText(fieldStudioHints.component_sheet || '')) {
      fieldStudioHints.component_sheet = normalizeText(componentRow.sheet || '') || null;
    }
  }

  const defaultSearchHints = buildSearchHints({
    key,
    requiredLevel,
    availability,
    difficulty,
    componentType: nestedParse.component_type || '',
    enumSource: source
  });
  const existingSearchHints = isObject(rule.search_hints) ? rule.search_hints : {};
  const searchHints = {
    ...defaultSearchHints,
    ...existingSearchHints
  };
  if (!toArray(existingSearchHints.query_terms).length) {
    searchHints.query_terms = toArray(defaultSearchHints.query_terms);
  }

  const canonicalValueForm = (
    nestedContract.shape === 'list' && nestedContract.type === 'object'
      ? 'list_of_objects'
      : valueForm
  );
  const normalizedConsumers = normalizeConsumerOverrides(rule.consumers);

  // Build contract block
  const outContract = {
    unknown_token: nestedContract.unknown_token,
    unknown_reason_required: nestedContract.unknown_reason_required !== false,
    type: nestedContract.type,
    shape: nestedContract.shape
  };
  if (normalizeText(nestedContract.unit)) {
    outContract.unit = normalizeText(nestedContract.unit);
  }
  if (normalizeText(nestedContract.value_form)) {
    outContract.value_form = normalizeText(nestedContract.value_form);
  }
  if (isObject(nestedContract.rounding) && Object.keys(nestedContract.rounding).length > 0) {
    outContract.rounding = sortDeep(nestedContract.rounding);
  }
  if (isObject(nestedContract.range) && Object.keys(nestedContract.range).length > 0) {
    outContract.range = sortDeep(nestedContract.range);
  }
  if (nestedContract.shape === 'list') {
    outContract.list_rules = sortDeep(
      isObject(nestedContract.list_rules) && Object.keys(nestedContract.list_rules).length > 0
        ? nestedContract.list_rules
        : { dedupe: true, sort: 'none', min_items: 0, max_items: 100 }
    );
  }
  if ((nestedContract.shape === 'object' || nestedContract.type === 'object') && isObject(nestedContract.object_schema) && Object.keys(nestedContract.object_schema).length > 0) {
    outContract.object_schema = sortDeep(nestedContract.object_schema);
  }
  if (Array.isArray(nestedContract.item_union) && nestedContract.item_union.length > 0) {
    outContract.item_union = sortDeep(nestedContract.item_union);
  }

  // Build parse block — type-driven, no template field emitted
  const outParse = {};
  const maybeCopy = (parseKey) => {
    const parseValue = nestedParse[parseKey];
    if (Array.isArray(parseValue) && parseValue.length > 0) {
      outParse[parseKey] = sortDeep(parseValue);
      return;
    }
    if (isObject(parseValue) && Object.keys(parseValue).length > 0) {
      outParse[parseKey] = sortDeep(parseValue);
      return;
    }
    if (typeof parseValue === 'boolean') {
      outParse[parseKey] = parseValue;
      return;
    }
    if (typeof parseValue === 'string' && parseValue.trim()) {
      outParse[parseKey] = parseValue;
    }
  };
  // WHY: Type-driven parse config. Which keys to emit depends on contract.type and shape.
  const isNumeric = contractType === 'number' || contractType === 'integer' || contractType === 'mixed_number_range' || contractType === 'range';
  // WHY: parse.unit* knobs retired — contract.unit is SSOT. Phase 3 adds system-wide unit registry.
  if (contractShape === 'list') {
    maybeCopy('delimiters');
    // WHY: Delimiters may live in parseRules instead of parse. Ensure deterministic output.
    if (!outParse.delimiters && Array.isArray(parseRules.delimiters) && parseRules.delimiters.length > 0) {
      outParse.delimiters = sortDeep(parseRules.delimiters);
    }
    if (!outParse.delimiters) {
      outParse.delimiters = [',', '/', '|', ';'];
    }
  }
  if (contractType === 'range' || contractType === 'mixed_number_range') {
    maybeCopy('range_separators');
  }
  if (nestedParse.component_type) {
    maybeCopy('component_type');
  }
  maybeCopy('token_map');
  maybeCopy('accepted_formats');
  maybeCopy('mode_aliases');
  maybeCopy('accept_bare_numbers_as_mode');

  // Build output with alphabetically-sorted keys matching canonical format
  const out = {
    ai_assist: nestedAiAssist,
    aliases: orderedUniqueStrings(toArray(rule.aliases || [])),
    availability,
    canonical_key: (() => {
      const candidate = normalizeFieldKey(rule.canonical_key || '');
      return candidate && candidate !== key ? candidate : null;
    })(),
    component: Object.keys(nestedComponent).length ? nestedComponent : null,
    constraints: Array.isArray(rule.constraints) ? rule.constraints.filter(Boolean) : [],
    contract: outContract,
    data_type: nestedContract.type || 'string',
    difficulty,
    display_name: normalizeText(uiOut.label || titleFromKey(key)),
    effort,
    enum: nestedEnum,
    evidence: nestedEvidence,
    field_studio_hints: fieldStudioHints,
    field_key: key,
    group: normalizeFieldKey(uiOut.group || inferGroup(key)),
    key,
    output_shape: nestedContract.shape || 'scalar',
    parse: outParse,
    priority: {
      required_level: requiredLevel,
      availability,
      difficulty,
      effort,
      publish_gate: publishGate,
      block_publish_when_unk: blockPublishWhenUnk
    },
    required_level: requiredLevel,
    search_hints: searchHints,
    ui: uiOut,
    unknown_reason_default: normalizeText(rule.unknown_reason_default || '') || 'not_found_after_search',
    value_form: canonicalValueForm
  };
  const variancePolicy = normalizeToken(rule.variance_policy || '');
  if (variancePolicy) {
    out.variance_policy = variancePolicy;
  }
  if (normalizedConsumers) {
    out.consumers = normalizedConsumers;
  }
  if (isObject(rule.selection_policy) && Object.keys(rule.selection_policy).length > 0) {
    out.selection_policy = sortDeep(rule.selection_policy);
  }
  return sortDeep(out);
}
