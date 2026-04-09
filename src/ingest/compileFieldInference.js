import {
  DEFAULT_REQUIRED_FIELDS,
  DEFAULT_IDENTITY_FIELDS,
  INSTRUMENTED_HARD_FIELDS,
  toArray,
  isObject,
  asInt,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isNumericContractType
} from './compileUtils.js';

export function normalizeKeyMigrationMap(keyMap = {}) {
  if (!isObject(keyMap)) {
    return {};
  }
  const out = {};
  for (const [rawFrom, rawTo] of Object.entries(keyMap)) {
    const from = normalizeFieldKey(rawFrom || '');
    const to = normalizeFieldKey(rawTo || '');
    if (!from || !to || from === to) {
      continue;
    }
    out[from] = to;
  }
  return out;
}

export function reconcileKeyMigrationsForFieldSet(keyMap = {}, fieldKeys = [], warnings = null) {
  const map = normalizeKeyMigrationMap(keyMap);
  const fieldSet = new Set(
    toArray(fieldKeys)
      .map((value) => normalizeFieldKey(value))
      .filter(Boolean)
  );
  const out = {};
  for (const [from, to] of Object.entries(map)) {
    const fromInFields = fieldSet.has(from);
    const toInFields = fieldSet.has(to);
    if (toInFields) {
      out[from] = to;
      continue;
    }
    if (fromInFields && !toInFields) {
      // Keep migration targets grounded to real generated keys.
      out[to] = from;
      if (Array.isArray(warnings)) {
        warnings.push(`key_migrations: reversed '${from} -> ${to}' to '${to} -> ${from}' because '${to}' is not a generated field key`);
      }
      continue;
    }
    if (Array.isArray(warnings)) {
      warnings.push(`key_migrations: dropped '${from} -> ${to}' because neither key is a generated field key`);
    }
  }
  return out;
}

export function findKeyMigrationCycle(keyMap = {}) {
  const map = normalizeKeyMigrationMap(keyMap);
  const nodes = Object.keys(map);
  if (nodes.length === 0) {
    return null;
  }
  const visiting = new Set();
  const visited = new Set();

  const walk = (node, path = []) => {
    if (visiting.has(node)) {
      const idx = path.indexOf(node);
      if (idx >= 0) {
        return [...path.slice(idx), node];
      }
      return [node, node];
    }
    if (visited.has(node)) {
      return null;
    }
    visiting.add(node);
    const next = map[node];
    const cycle = next ? walk(next, [...path, node]) : null;
    visiting.delete(node);
    visited.add(node);
    return cycle;
  };

  for (const node of nodes) {
    const cycle = walk(node, []);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

export function inferUnitByField(key) {
  const token = normalizeFieldKey(key);
  if (token === 'weight' || token.endsWith('_weight')) return 'g';
  if (token === 'dpi' || token.endsWith('_dpi') || token.endsWith('_cpi')) return 'dpi';
  if (token.includes('polling') || token === 'hz' || token.endsWith('_hz')) return 'hz';
  if (token === 'lngth' || token === 'length' || token === 'width' || token === 'height' || token.endsWith('_length') || token.endsWith('_width') || token.endsWith('_height')) return 'mm';
  if (token.includes('price')) return 'usd';
  if (token.includes('battery') && token.includes('hour')) return 'h';
  return '';
}

export function inferFromSamples(key, samples = []) {
  const normalized = toArray(samples).map((sample) => normalizeText(sample)).filter(Boolean).slice(0, 200);
  const numericCount = normalized.filter((value) => /^-?\d+(\.\d+)?$/.test(value)).length;
  const boolCount = normalized.filter((value) => /^(yes|no|true|false|0|1)$/i.test(value)).length;
  const rangeCount = normalized.filter((value) => /\d+\s*[-to]{1,3}\s*\d+/i.test(value)).length;
  const listCount = normalized.filter((value) => /[,/|;+]/.test(value)).length;

  const ratio = (count) => (normalized.length ? count / normalized.length : 0);
  const numericRatio = ratio(numericCount);
  const boolRatio = ratio(boolCount);
  const rangeRatio = ratio(rangeCount);
  const listRatio = ratio(listCount);

  let type = 'string';
  let shape = 'scalar';
  if (boolRatio >= 0.75) {
    type = 'boolean';
  } else if (rangeRatio >= 0.4) {
    type = 'number';
    shape = 'range';
  } else if (numericRatio >= 0.75) {
    type = 'number';
  } else if (listRatio >= 0.6) {
    type = 'string';
    shape = 'list';
  }

  const keyToken = normalizeFieldKey(key);
  if (keyToken.endsWith('_link') || keyToken.endsWith('_url')) {
    type = 'string';
    shape = 'scalar';
  }
  if (keyToken.includes('date')) {
    type = 'date';
    shape = 'scalar';
  }
  if (keyToken === 'colors' || keyToken.includes('color')) {
    type = 'string';
    shape = 'list';
  }
  if (keyToken === 'polling_rate') {
    type = 'number';
    shape = 'list';
  }
  if (keyToken === 'dpi') {
    type = 'number';
    shape = numericRatio >= 0.8 ? 'scalar' : 'list';
  }
  if (keyToken === 'connection' || keyToken.includes('connect')) {
    type = 'string';
    shape = 'list';
  }

  return {
    type,
    shape
  };
}

export function inferGroup(key) {
  const token = normalizeFieldKey(key);
  if (token.includes('sensor') || token.includes('dpi') || token.includes('polling') || token.includes('acceleration')) return 'performance';
  if (token.includes('weight') || token.includes('length') || token.includes('lngth') || token.includes('width') || token.includes('height') || token.includes('size')) return 'dimensions';
  if (token.includes('connection') || token.includes('wireless') || token.includes('bluetooth')) return 'connectivity';
  if (token.includes('button') || token.includes('switch')) return 'controls';
  if (token.includes('battery') || token.includes('charge')) return 'power';
  if (token.includes('color') || token.includes('rgb')) return 'appearance';
  return 'general';
}

export function inferDifficulty({ type, shape, key }) {
  const token = normalizeFieldKey(key);
  if (INSTRUMENTED_HARD_FIELDS.has(token)) {
    return 'hard';
  }
  if (token.includes('edition') || token.includes('variant')) {
    return 'hard';
  }
  if (shape === 'range' || shape === 'object') {
    return 'hard';
  }
  if (shape === 'list' || type === 'date') {
    return 'medium';
  }
  return 'easy';
}

export function effortFromDifficulty(difficulty) {
  if (difficulty === 'easy') return 3;
  if (difficulty === 'medium') return 6;
  return 9;
}

export function inferRequiredLevel(key, expectations) {
  const token = normalizeFieldKey(key);
  if (expectations.required_fields.includes(token)) return 'required';
  if (expectations.critical_fields.includes(token)) return 'critical';
  if (expectations.expected_easy_fields.includes(token)) return 'expected';
  if (expectations.expected_sometimes_fields.includes(token)) return 'expected';
  if (expectations.deep_fields.includes(token)) return 'rare';
  if (DEFAULT_IDENTITY_FIELDS.has(token)) return 'identity';
  if (DEFAULT_REQUIRED_FIELDS.has(token)) return 'required';
  if (INSTRUMENTED_HARD_FIELDS.has(token)) return 'optional';
  return 'expected';
}

export function inferAvailability(key, expectations) {
  const token = normalizeFieldKey(key);
  if (expectations.expected_easy_fields.includes(token)) return 'expected';
  if (expectations.deep_fields.includes(token)) return 'rare';
  if (DEFAULT_IDENTITY_FIELDS.has(token)) return 'expected';
  if (DEFAULT_REQUIRED_FIELDS.has(token)) return 'expected';
  if (INSTRUMENTED_HARD_FIELDS.has(token)) return 'sometimes';
  return 'sometimes';
}

export function enforceExpectationPriority({ key, rule, expectations }) {
  if (!isObject(rule)) {
    return rule;
  }

  // Keep high-severity expectation buckets deterministic even when stale overrides exist.
  const fieldKey = normalizeFieldKey(key);
  const expectedLevel = inferRequiredLevel(fieldKey, expectations);
  const forceLevel = expectedLevel === 'identity' || expectedLevel === 'required' || expectedLevel === 'critical';
  const priority = isObject(rule.priority) ? { ...rule.priority } : {};
  const currentLevel = normalizeToken(rule.required_level || priority.required_level || '');
  const finalLevel = forceLevel ? expectedLevel : (currentLevel || expectedLevel || 'expected');

  rule.required_level = finalLevel;
  priority.required_level = finalLevel;

  const expectedAvailability = inferAvailability(fieldKey, expectations);
  const currentAvailability = normalizeToken(rule.availability || priority.availability || '');
  const finalAvailability = (
    forceLevel
      ? (expectedAvailability || currentAvailability || 'expected')
      : (currentAvailability || expectedAvailability || 'sometimes')
  );
  rule.availability = finalAvailability;
  priority.availability = finalAvailability;

  const instrumented = INSTRUMENTED_HARD_FIELDS.has(fieldKey);
  const publishGate = (finalLevel === 'identity' || finalLevel === 'required') && !instrumented;
  rule.publish_gate = publishGate;
  priority.publish_gate = publishGate;
  rule.block_publish_when_unk = publishGate;
  priority.block_publish_when_unk = publishGate;
  rule.publish_gate_reason = finalLevel === 'identity'
    ? 'missing_identity'
    : (finalLevel === 'required' ? 'missing_required' : '');
  priority.publish_gate_reason = rule.publish_gate_reason;

  const evidence = isObject(rule.evidence) ? { ...rule.evidence } : {};
  if (typeof evidence.required !== 'boolean') {
    evidence.required = true;
  }
  const defaultMinEvidence = (finalLevel === 'identity' || finalLevel === 'required') ? 2 : 1;
  evidence.min_evidence_refs = asInt(evidence.min_evidence_refs, defaultMinEvidence);
  rule.evidence = evidence;
  rule.evidence_required = evidence.required !== false;
  rule.min_evidence_refs = asInt(rule.min_evidence_refs, evidence.min_evidence_refs);

  rule.priority = priority;
  return rule;
}
