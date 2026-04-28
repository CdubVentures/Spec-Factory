import { isObject, toArray, normalizeFieldKey, normalizeText } from '../shared/primitives.js';
import { FIELD_PARENT_MAP } from './consumerBadgeRegistry.js';

const SYSTEM_ALIASES = new Map([
  ['seed', 'seed'],
  ['indexlab', 'indexlab'],
  ['idx', 'indexlab'],
  ['review', 'review'],
  ['rev', 'review'],
  ['flag', 'review']
]);

// WHY: FIELD_SYSTEM_MAP derived from the unified consumerBadgeRegistry.
// Maps parent group keys to legacy system names for backward compat with
// resolveConsumerGate / projectFieldRulesForConsumer callers.
const _PARENT_TO_LEGACY = { idx: 'indexlab', eng: null, rev: 'review', flag: 'review', seed: 'seed', comp: null, val: null, pub: null, llm: null };

function _buildFieldSystemMap() {
  const map = {};
  for (const [path, parents] of Object.entries(FIELD_PARENT_MAP)) {
    const systems = parents
      .map((p) => _PARENT_TO_LEGACY[p])
      .filter(Boolean);
    if (systems.length > 0) map[path] = systems;
  }
  return map;
}

export const FIELD_SYSTEM_MAP = _buildFieldSystemMap();

const FIELD_PATH_ALIAS_DELETE_MAP = {
  'contract.type': [['contract', 'type'], ['data_type'], ['type']],
  'contract.shape': [['contract', 'shape'], ['output_shape'], ['shape']],
  'contract.unit': [['contract', 'unit'], ['unit']],
  'contract.range': [['contract', 'range']],
  'contract.list_rules': [['contract', 'list_rules'], ['list_rules']],
  'priority.required_level': [['priority', 'required_level'], ['required_level']],
  'priority.availability': [['priority', 'availability'], ['availability']],
  'priority.difficulty': [['priority', 'difficulty'], ['difficulty']],
  'ai_assist.reasoning_note': [['ai_assist', 'reasoning_note']],
  // WHY: parse.template retired — type+shape is the contract.
  'enum.policy': [['enum', 'policy'], ['enum_policy']],
  'enum.source': [['enum', 'source'], ['enum_source']],
  'enum.match.format_hint': [['enum', 'match', 'format_hint'], ['enum_match_format_hint']],
  'evidence.min_evidence_refs': [['evidence', 'min_evidence_refs'], ['min_evidence_refs']],
  'evidence.tier_preference': [['evidence', 'tier_preference']],
  'search_hints.domain_hints': [['search_hints', 'domain_hints']],
  'search_hints.content_types': [['search_hints', 'content_types']],
  'search_hints.query_terms': [['search_hints', 'query_terms']],
  group: [['group']],
  constraints: [['constraints']],
  'component.type': [['component', 'type'], ['component_db_ref']],
  aliases: [['aliases']],
  product_image_dependent: [['product_image_dependent']],
  'ai_assist.variant_inventory_usage': [['ai_assist', 'variant_inventory_usage']],
  'ui.tooltip_md': [['ui', 'tooltip_md']]
};

export function normalizeConsumerSystem(system) {
  const token = normalizeText(system).toLowerCase();
  if (!token) {
    return null;
  }
  return SYSTEM_ALIASES.get(token) || null;
}

function normalizeFieldPath(fieldPath) {
  return normalizeText(fieldPath);
}

export function normalizeConsumerOverrides(consumers) {
  if (!isObject(consumers)) {
    return null;
  }

  const normalized = {};
  for (const [fieldPathRaw, overrideRowRaw] of Object.entries(consumers)) {
    const fieldPath = normalizeFieldPath(fieldPathRaw);
    if (!fieldPath || !isObject(overrideRowRaw)) {
      continue;
    }

    const overrideRow = {};
    for (const [systemRaw, enabledRaw] of Object.entries(overrideRowRaw)) {
      const system = normalizeConsumerSystem(systemRaw);
      if (!system || typeof enabledRaw !== 'boolean') {
        continue;
      }
      overrideRow[system] = enabledRaw;
    }

    if (Object.keys(overrideRow).length > 0) {
      normalized[fieldPath] = overrideRow;
    }
  }

  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
}

function toPathSegments(pathText = '') {
  return normalizeText(pathText)
    .split('.')
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function cloneRuleValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneRuleValue(item));
  }
  if (!isObject(value)) {
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneRuleValue(child);
  }
  return out;
}

function deletePath(target, pathSegments, depth = 0) {
  if (!isObject(target) || depth >= pathSegments.length) {
    return;
  }
  const key = pathSegments[depth];
  if (!key || !hasOwn(target, key)) {
    return;
  }

  if (depth === pathSegments.length - 1) {
    delete target[key];
    return;
  }

  const child = target[key];
  if (!isObject(child)) {
    return;
  }

  deletePath(child, pathSegments, depth + 1);

  if (Object.keys(child).length === 0) {
    delete target[key];
  }
}

function getPathAliases(fieldPath) {
  if (Array.isArray(FIELD_PATH_ALIAS_DELETE_MAP[fieldPath])) {
    return FIELD_PATH_ALIAS_DELETE_MAP[fieldPath];
  }
  const fallback = toPathSegments(fieldPath);
  return fallback.length > 0 ? [fallback] : [];
}

function collectDisabledPathsForSystem(rule, system) {
  const normalized = normalizeConsumerOverrides(rule?.consumers);
  if (!normalized || !system) {
    return [];
  }
  const disabled = [];
  for (const [fieldPath, row] of Object.entries(normalized)) {
    if (isObject(row) && row[system] === false) {
      disabled.push(fieldPath);
    }
  }
  return disabled;
}

function applyDisabledFieldPathsToRule(rule, disabledFieldPaths = []) {
  const projected = cloneRuleValue(rule);
  for (const fieldPath of disabledFieldPaths) {
    for (const pathSegments of getPathAliases(fieldPath)) {
      deletePath(projected, pathSegments);
    }
  }
  return projected;
}

function getFieldsContainer(payload) {
  if (isObject(payload?.rules?.fields)) {
    return {
      fields: payload.rules.fields,
      write: (nextPayload, fields) => {
        nextPayload.rules = {
          ...(isObject(nextPayload.rules) ? nextPayload.rules : {}),
          fields
        };
      }
    };
  }

  if (isObject(payload?.fields)) {
    return {
      fields: payload.fields,
      write: (nextPayload, fields) => {
        nextPayload.fields = fields;
      }
    };
  }

  return null;
}

function mergeDisabledPathsByField(map, fieldKey, disabledPaths = []) {
  const raw = normalizeText(fieldKey);
  const normalized = normalizeFieldKey(fieldKey);
  const keys = [raw, normalized].filter(Boolean);
  if (keys.length === 0 || disabledPaths.length === 0) {
    return;
  }

  for (const key of keys) {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    const out = map.get(key);
    for (const pathToken of disabledPaths) {
      out.add(pathToken);
    }
  }
}

function isPathDisabled(disabledPathsByField, fieldKey, fieldPath) {
  const raw = normalizeText(fieldKey);
  const normalized = normalizeFieldKey(fieldKey);
  const rawSet = raw ? disabledPathsByField.get(raw) : null;
  const normalizedSet = normalized ? disabledPathsByField.get(normalized) : null;
  return Boolean(rawSet?.has(fieldPath) || normalizedSet?.has(fieldPath));
}

function projectKnownValuesForConsumer(knownValues, disabledPathsByField) {
  if (!isObject(knownValues) || !isObject(knownValues.enums)) {
    return knownValues;
  }

  const nextEnums = {};
  let changed = false;
  for (const [fieldKey, enumRow] of Object.entries(knownValues.enums)) {
    if (isPathDisabled(disabledPathsByField, fieldKey, 'enum.source')) {
      changed = true;
      continue;
    }
    nextEnums[fieldKey] = enumRow;
  }

  if (!changed) {
    return knownValues;
  }
  return {
    ...knownValues,
    enums: nextEnums
  };
}

function projectParseTemplatesForConsumer(parseTemplates, disabledPathsByField) {
  if (!isObject(parseTemplates) || !isObject(parseTemplates.templates)) {
    return parseTemplates;
  }

  const nextTemplates = {};
  let changed = false;
  for (const [fieldKey, templateRow] of Object.entries(parseTemplates.templates)) {
    // WHY: parse.template path retired. Extraction patterns (parse_templates.json) always pass through.
    nextTemplates[fieldKey] = templateRow;
  }

  if (!changed) {
    return parseTemplates;
  }
  return {
    ...parseTemplates,
    templates: nextTemplates
  };
}

function projectCrossValidationRulesForConsumer(crossValidation, disabledPathsByField) {
  if (!Array.isArray(crossValidation)) {
    return crossValidation;
  }
  const filtered = crossValidation.filter((row) => {
    const triggerField = normalizeText(row?.trigger_field || row?.triggerField || '');
    if (!triggerField) {
      return true;
    }
    return !isPathDisabled(disabledPathsByField, triggerField, 'constraints');
  });
  if (filtered.length === crossValidation.length) {
    return crossValidation;
  }
  return filtered;
}

function projectCrossValidationContainerForConsumer(crossValidationContainer, disabledPathsByField) {
  if (!isObject(crossValidationContainer) || !Array.isArray(crossValidationContainer.rules)) {
    return crossValidationContainer;
  }
  const filteredRules = projectCrossValidationRulesForConsumer(crossValidationContainer.rules, disabledPathsByField);
  if (filteredRules === crossValidationContainer.rules) {
    return crossValidationContainer;
  }
  return {
    ...crossValidationContainer,
    rules: filteredRules
  };
}

function resolveOverrideValue({ rule, fieldPath, system }) {
  const normalizedOverrides = normalizeConsumerOverrides(rule?.consumers);
  if (!normalizedOverrides) {
    return {
      hasOverride: false,
      enabled: true
    };
  }

  const fieldOverride = normalizedOverrides[fieldPath];
  if (!isObject(fieldOverride)) {
    return {
      hasOverride: false,
      enabled: true
    };
  }

  if (!Object.prototype.hasOwnProperty.call(fieldOverride, system)) {
    return {
      hasOverride: false,
      enabled: true
    };
  }

  return {
    hasOverride: true,
    enabled: fieldOverride[system] !== false
  };
}

export function resolveConsumerGate(rule, fieldPath, system) {
  const normalizedFieldPath = normalizeFieldPath(fieldPath);
  const normalizedSystem = normalizeConsumerSystem(system);

  if (!normalizedFieldPath || !normalizedSystem) {
    return {
      fieldPath: normalizedFieldPath || normalizeText(fieldPath),
      system: normalizeText(system),
      enabled: true,
      explicit: false
    };
  }

  const resolved = resolveOverrideValue({
    rule,
    fieldPath: normalizedFieldPath,
    system: normalizedSystem
  });

  return {
    fieldPath: normalizedFieldPath,
    system: normalizedSystem,
    enabled: resolved.enabled,
    explicit: resolved.hasOverride
  };
}

export function isConsumerEnabled(rule, fieldPath, system) {
  return resolveConsumerGate(rule, fieldPath, system).enabled;
}

export function projectRuleForConsumer(rule, system) {
  const normalizedSystem = normalizeConsumerSystem(system);
  if (!isObject(rule) || !normalizedSystem) {
    return rule;
  }
  const disabledPaths = collectDisabledPathsForSystem(rule, normalizedSystem);
  if (disabledPaths.length === 0) {
    return cloneRuleValue(rule);
  }
  return applyDisabledFieldPathsToRule(rule, disabledPaths);
}

export function projectFieldRulesForConsumer(payload, system) {
  const normalizedSystem = normalizeConsumerSystem(system);
  if (!isObject(payload) || !normalizedSystem) {
    return payload;
  }

  const fieldsContainer = getFieldsContainer(payload);
  if (!fieldsContainer) {
    return payload;
  }

  const nextPayload = { ...payload };
  const projectedFields = {};
  const disabledPathsByField = new Map();

  for (const [fieldKey, rule] of Object.entries(fieldsContainer.fields)) {
    if (!isObject(rule)) {
      projectedFields[fieldKey] = rule;
      continue;
    }

    const disabledPaths = collectDisabledPathsForSystem(rule, normalizedSystem);
    mergeDisabledPathsByField(disabledPathsByField, fieldKey, disabledPaths);
    projectedFields[fieldKey] = disabledPaths.length > 0
      ? applyDisabledFieldPathsToRule(rule, disabledPaths)
      : cloneRuleValue(rule);
  }
  fieldsContainer.write(nextPayload, projectedFields);

  nextPayload.knownValues = projectKnownValuesForConsumer(nextPayload.knownValues, disabledPathsByField);
  nextPayload.parseTemplates = projectParseTemplatesForConsumer(nextPayload.parseTemplates, disabledPathsByField);
  nextPayload.crossValidation = projectCrossValidationRulesForConsumer(nextPayload.crossValidation, disabledPathsByField);

  if (isObject(nextPayload.crossValidation)) {
    nextPayload.crossValidation = projectCrossValidationContainerForConsumer(
      nextPayload.crossValidation,
      disabledPathsByField
    );
  }

  const hasCrossValidationRules = isObject(nextPayload?.crossValidation?.rules);
  if (hasCrossValidationRules && Array.isArray(nextPayload.crossValidation.rules)) {
    const filtered = projectCrossValidationRulesForConsumer(nextPayload.crossValidation.rules, disabledPathsByField);
    if (filtered !== nextPayload.crossValidation.rules) {
      nextPayload.crossValidation = {
        ...nextPayload.crossValidation,
        rules: filtered
      };
    }
  }

  return nextPayload;
}
