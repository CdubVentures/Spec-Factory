import fs from 'node:fs/promises';
import path from 'node:path';
import { loadFieldRules } from '../field-rules/loader.js';
import { applyKeyMigrations as applyMigrationDoc } from '../field-rules/migrations.js';
import { projectFieldRulesForConsumer } from '../field-rules/consumerGate.js';
import {
  NORMALIZATION_FUNCTIONS,
  parseBoolean,
  parseDate,
  parseList,
  parseNumberAndUnit,
  parseBooleanTemplate,
  parseDateField,
  parseIntegerField,
  normalizeUrlField,
  parseNumberListWithUnit,
  parseNumberOrRangeList,
  parseLatencyModeList,
  convertUnit,
  canonicalUnitToken,
  applyNumericRounding
} from './normalizationFunctions.js';
import {
  ruleRequiredLevel as requiredLevel,
  ruleAvailability as availabilityLevel,
  ruleDifficulty as difficultyLevel,
  ruleType as parseRuleType,
  ruleShape as parseRuleShape,
  ruleUnit as parseRuleUnit,
  ruleParseTemplate as parseRuleTemplate
} from './ruleAccessors.js';
import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isUnknownToken,
  safeJsonParse
} from './engineTextHelpers.js';
import { groupKey, buildUiGroupIndex, buildEnumIndex } from './engineEnumIndex.js';
import { auditEvidence as _auditEvidence } from './engineEvidenceAuditor.js';
import {
  validateRange as _validateRange,
  validateShapeAndUnits as _validateShapeAndUnits,
  enforceEnumPolicy as _enforceEnumPolicy
} from './engineFieldValidators.js';
import { simpleSimilarity, resolveComponentRef } from './engineComponentResolver.js';
import { crossValidate as _crossValidate } from './engineCrossValidator.js';
import { evaluateAllConstraints as _evaluateAllConstraints } from './constraintEvaluator.js';

function parseRuleNormalizationFn(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  const parseBlock = isObject(rule.parse) ? rule.parse : {};
  return normalizeToken(
    rule.normalization_fn ||
    contract.normalization_fn ||
    parseBlock.normalization_fn ||
    ''
  );
}

function buildTokenMap(rule = {}) {
  const parseBlock = isObject(rule.parse) ? rule.parse : {};
  const tokenMap = isObject(parseBlock.token_map) ? parseBlock.token_map : {};
  const out = new Map();
  for (const [rawKey, rawValue] of Object.entries(tokenMap)) {
    const key = normalizeToken(rawKey);
    const value = normalizeText(rawValue);
    if (key && value) {
      out.set(key, value);
    }
  }
  return out;
}

function applyTokenMapToString(value, tokenMap) {
  const text = normalizeText(value);
  if (!text || !(tokenMap instanceof Map) || tokenMap.size === 0) {
    return text;
  }
  const parts = text.split('+').map((part) => normalizeText(part));
  const mapped = parts.map((part) => tokenMap.get(normalizeToken(part)) || part);
  return mapped.join('+');
}

export class FieldRulesEngine {
  constructor({
    category,
    loaded,
    keyMigrations = {},
    options = {}
  }) {
    const projectedLoaded = projectFieldRulesForConsumer(loaded || {}, options?.consumerSystem || null);
    this.category = normalizeFieldKey(category);
    this.loaded = projectedLoaded || {};
    this.rules = isObject(projectedLoaded?.rules?.fields) ? projectedLoaded.rules.fields : {};
    this.knownValues = projectedLoaded?.knownValues || {};
    this.parseTemplates = isObject(projectedLoaded?.parseTemplates?.templates) ? projectedLoaded.parseTemplates.templates : {};
    this.crossValidationRules = toArray(projectedLoaded?.crossValidation);
    this.componentDBs = isObject(projectedLoaded?.componentDBs) ? projectedLoaded.componentDBs : {};
    this.uiFieldCatalog = projectedLoaded?.uiFieldCatalog || { fields: [] };
    this.uiGroupByField = buildUiGroupIndex(this.uiFieldCatalog);
    this.uiFieldByKey = new Map(
      toArray(this.uiFieldCatalog?.fields).map((row) => [normalizeFieldKey(row?.key), row])
    );
    this.keyMigrations = isObject(keyMigrations) ? keyMigrations : {};
    this.options = options || {};
    this.enumIndex = buildEnumIndex(this.knownValues);
  }

  static async create(category, options = {}) {
    const loaded = await loadFieldRules(category, options);
    const generatedRoot = loaded?.generatedRoot || '';
    const keyMigrationsPath = generatedRoot
      ? path.join(generatedRoot, 'key_migrations.json')
      : '';
    let keyMigrations = {};
    if (keyMigrationsPath) {
      try {
        const raw = await fs.readFile(keyMigrationsPath, 'utf8');
        keyMigrations = safeJsonParse(raw) || {};
      } catch {
        keyMigrations = {};
      }
    }
    return new FieldRulesEngine({
      category,
      loaded,
      keyMigrations,
      options
    });
  }

  getPublishGate() {
    return this.loaded?.rules?.publish_gate || null;
  }

  // WHY: Exposes core_fields + per-field evidence_tier_minimum for tier-based field classification
  getCoreDeepFieldRules() {
    const rules = this.loaded?.rules || {};
    const coreFields = Array.isArray(rules.core_fields) ? rules.core_fields : [];
    const fields = {};
    for (const [key, rule] of Object.entries(this.rules)) {
      if (!isObject(rule)) continue;
      const evidence = isObject(rule.evidence) ? rule.evidence : {};
      fields[key] = { evidence_tier_minimum: evidence.evidence_tier_minimum ?? 3 };
    }
    return { core_fields: coreFields, fields };
  }

  getAllFieldKeys() {
    return Object.keys(this.rules)
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  getRequiredFields() {
    return this.getAllFieldKeys()
      .filter((field) => ['required', 'identity'].includes(requiredLevel(this.rules[field])))
      .map((field) => ({ key: field, rule: this.rules[field] }));
  }

  getCriticalFields() {
    return this.getAllFieldKeys()
      .filter((field) => requiredLevel(this.rules[field]) === 'critical')
      .map((field) => ({ key: field, rule: this.rules[field] }));
  }

  resolveFieldGroup(fieldKey) {
    const key = normalizeFieldKey(fieldKey);
    if (!key) {
      return 'general';
    }
    if (this.uiGroupByField.has(key)) {
      return this.uiGroupByField.get(key);
    }
    return groupKey(this.rules[key]);
  }

  getFieldsByGroup(group) {
    const wanted = normalizeFieldKey(group);
    return this.getAllFieldKeys()
      .filter((field) => this.resolveFieldGroup(field) === wanted)
      .map((field) => ({ key: field, rule: this.rules[field] }));
  }

  getFieldsByRequiredLevel(level) {
    const wanted = normalizeToken(level);
    return this.getAllFieldKeys()
      .filter((field) => requiredLevel(this.rules[field]) === wanted)
      .map((field) => ({ key: field, rule: this.rules[field] }));
  }

  getFieldsByAvailability(availability) {
    const wanted = normalizeToken(availability);
    return this.getAllFieldKeys()
      .filter((field) => availabilityLevel(this.rules[field]) === wanted)
      .map((field) => ({ key: field, rule: this.rules[field] }));
  }

  getFieldsForRound(roundNumber = 1) {
    const round = Math.max(1, Number.parseInt(String(roundNumber || 1), 10) || 1);
    const required = this.getAllFieldKeys().filter((field) => {
      const level = requiredLevel(this.rules[field]);
      if (round === 1) {
        return level === 'required' || level === 'critical' || level === 'identity';
      }
      if (round === 2) {
        return level === 'expected' && difficultyLevel(this.rules[field]) === 'easy';
      }
      return level === 'expected' || level === 'optional';
    });
    return {
      targetFields: required,
      maxEffort: round === 1 ? 4 : (round === 2 ? 7 : 10)
    };
  }

  getParseTemplate(fieldKey) {
    const key = normalizeFieldKey(fieldKey);
    return isObject(this.parseTemplates[key]) ? this.parseTemplates[key] : null;
  }

  getAllParseTemplates() {
    return this.parseTemplates;
  }

  getAllRules() {
    return this.rules;
  }

  getFieldRule(fieldKey) {
    const key = normalizeFieldKey(fieldKey);
    return this.rules[key] || null;
  }

  getUiField(fieldKey) {
    const key = normalizeFieldKey(fieldKey);
    return this.uiFieldByKey.get(key) || null;
  }

  applyParseTemplate(fieldKey, text) {
    const template = this.getParseTemplate(fieldKey);
    if (!template) {
      return { matched: false };
    }
    for (const pattern of toArray(template.patterns)) {
      const regex = normalizeText(pattern?.regex || '');
      if (!regex) {
        continue;
      }
      const groupIndex = Number.parseInt(String(pattern?.group || pattern?.group_index || 1), 10) || 1;
      try {
        const match = String(text ?? '').match(new RegExp(regex, 'i'));
        if (!match) {
          continue;
        }
        return {
          matched: true,
          value: match[groupIndex] ?? match[0],
          pattern_used: regex
        };
      } catch {
        continue;
      }
    }
    return { matched: false };
  }

  _resolveDbKey(dbName) {
    const key = normalizeFieldKey(dbName);
    if (!key) return null;
    return isObject(this.componentDBs[key]) ? key : null;
  }

  lookupComponent(dbName, query) {
    const dbKey = this._resolveDbKey(dbName);
    if (!dbKey) {
      return null;
    }
    const token = normalizeToken(query);
    if (!token) {
      return null;
    }
    const db = this.componentDBs[dbKey];
    return db.__index?.get(token) || db.__index?.get(token.replace(/\s+/g, '')) || null;
  }

  fuzzyMatchComponent(dbName, query, threshold = 0.75) {
    const dbKey = this._resolveDbKey(dbName);
    if (!dbKey) {
      return { match: null, score: 0, alternatives: [] };
    }
    const entries = Object.values(this.componentDBs[dbKey].entries || {});
    let best = null;
    let bestScore = 0;
    const alternatives = [];
    for (const entry of entries) {
      const score = simpleSimilarity(query, entry.canonical_name);
      alternatives.push({
        canonical_name: entry.canonical_name,
        score
      });
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    alternatives.sort((a, b) => b.score - a.score || a.canonical_name.localeCompare(b.canonical_name));
    return {
      match: bestScore >= threshold ? best : null,
      score: bestScore,
      alternatives: alternatives.slice(0, 5)
    };
  }

  _roundNumericForDisplay(fieldKey, value) {
    const uiField = this.getUiField(fieldKey);
    const decimals = Number(uiField?.display_decimals);
    if (!Number.isFinite(decimals)) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => (
        typeof entry === 'number' ? applyNumericRounding(entry, decimals) : entry
      ));
    }
    return typeof value === 'number' ? applyNumericRounding(value, decimals) : value;
  }

  _applyTemplateNormalization(fieldKey, rule, value) {
    const template = parseRuleTemplate(rule);
    const parseBlock = isObject(rule.parse) ? rule.parse : {};
    const contract = isObject(rule.contract) ? rule.contract : {};

    if (!template) {
      return { applied: false, value };
    }

    switch (template) {
      case 'boolean_yes_no_unk': {
        const normalized = parseBooleanTemplate(value);
        if (!normalized) {
          return { ok: false, reason_code: 'boolean_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:boolean_yes_no_unk'] };
      }
      case 'date_field': {
        const normalized = parseDateField(value);
        if (!normalized) {
          return { ok: false, reason_code: 'date_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:date_field'] };
      }
      case 'url_field': {
        const normalized = normalizeUrlField(value);
        if (!normalized) {
          return { ok: false, reason_code: 'url_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:url_field'] };
      }
      case 'integer_field': {
        const normalized = parseIntegerField(value);
        if (normalized === null) {
          return { ok: false, reason_code: 'number_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:integer_field'] };
      }
      case 'integer_with_unit': {
        const normalized = parseIntegerField(value);
        if (normalized === null) {
          return { ok: false, reason_code: 'number_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:integer_with_unit'] };
      }
      case 'list_of_tokens_delimited': {
        const normalized = parseList(value).map((entry) => normalizeText(entry)).filter(Boolean);
        return { applied: true, value: normalized, attempts: ['template:list_of_tokens_delimited'] };
      }
      case 'list_of_numbers_with_unit': {
        const normalized = parseNumberListWithUnit(value, {
          unit: parseBlock.unit || contract.unit,
          unitAccepts: parseBlock.unit_accepts,
          decimals: Number(this.getUiField(fieldKey)?.display_decimals ?? 0)
        });
        if (!normalized) {
          return { ok: false, reason_code: 'number_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:list_of_numbers_with_unit'] };
      }
      case 'list_numbers_or_ranges_with_unit': {
        const normalized = parseNumberOrRangeList(value, {
          unit: parseBlock.unit || contract.unit,
          unitAccepts: parseBlock.unit_accepts,
          rangeSeparators: parseBlock.range_separators,
          decimals: Number(this.getUiField(fieldKey)?.display_decimals ?? 0)
        });
        if (!normalized) {
          return { ok: false, reason_code: 'number_required' };
        }
        return { applied: true, value: normalized, attempts: ['template:list_numbers_or_ranges_with_unit'] };
      }
      case 'latency_list_modes_ms': {
        const decimals = Number(contract?.object_schema?.ms?.rounding?.decimals ?? 2);
        const normalized = parseLatencyModeList(value, {
          modeAliases: parseBlock.mode_aliases,
          defaultMode: parseBlock.accept_bare_numbers_as_mode || 'unknown',
          decimals
        });
        if (!normalized) {
          return { ok: false, reason_code: 'shape_mismatch' };
        }
        return { applied: true, value: normalized, attempts: ['template:latency_list_modes_ms'] };
      }
      default:
        return { applied: false, value };
    }
  }

  validateRange(fieldKey, numericValue) {
    return _validateRange(fieldKey, numericValue, { rules: this.rules });
  }

  validateShapeAndUnits(fieldKey, normalized) {
    return _validateShapeAndUnits(fieldKey, normalized, { rules: this.rules });
  }

  enforceEnumPolicy(fieldKey, normalized) {
    return _enforceEnumPolicy(fieldKey, normalized, { rules: this.rules, enumIndex: this.enumIndex });
  }

  auditEvidence(fieldKey, value, provenance = {}, context = {}) {
    return _auditEvidence(fieldKey, value, provenance, context);
  }

  buildUnknown(fieldKey, unknownReason = 'not_found_after_search', attemptTrace = null) {
    const key = normalizeFieldKey(fieldKey);
    const rule = this.rules[key] || {};
    return {
      value: 'unk',
      unknown_reason: normalizeToken(unknownReason) || 'not_found_after_search',
      field_key: key,
      required_level: requiredLevel(rule),
      difficulty: difficultyLevel(rule),
      attempt_trace: attemptTrace || null,
      field_metadata: {
        data_type: parseRuleType(rule),
        output_shape: parseRuleShape(rule),
        group: this.resolveFieldGroup(key)
      }
    };
  }

  applyKeyMigrations(record = {}) {
    return applyMigrationDoc(record, this.keyMigrations);
  }

  normalizeCandidate(fieldKey, rawCandidate, context = {}) {
    const key = normalizeFieldKey(fieldKey);
    const rule = this.rules[key];
    if (!rule) {
      return {
        ok: false,
        reason_code: 'field_not_found',
        raw_input: rawCandidate,
        attempted_normalizations: []
      };
    }
    const attempts = [];
    if (rawCandidate === null || rawCandidate === undefined || isUnknownToken(rawCandidate)) {
      return {
        ok: false,
        reason_code: 'empty_value',
        raw_input: rawCandidate,
        attempted_normalizations: attempts
      };
    }

    const type = parseRuleType(rule);
    const shape = parseRuleShape(rule);
    const unit = parseRuleUnit(rule);
    const template = parseRuleTemplate(rule);
    const normalizationFnName = parseRuleNormalizationFn(rule);
    const tokenMap = buildTokenMap(rule);
    let value = rawCandidate;
    let usedExplicitNormalizer = false;

    const templateHandlesList = new Set([
      'list_of_tokens_delimited',
      'list_of_numbers_with_unit',
      'list_numbers_or_ranges_with_unit',
      'latency_list_modes_ms'
    ]);

    if (shape === 'list') {
      if (!Array.isArray(value) && !templateHandlesList.has(template)) {
        value = parseList(rawCandidate);
        attempts.push('shape:list');
      }
    } else if (Array.isArray(value)) {
      const meaningfulValues = value.filter((entry) => !isUnknownToken(entry));
      if (meaningfulValues.length !== 1 || Array.isArray(meaningfulValues[0]) || isObject(meaningfulValues[0])) {
        return {
          ok: false,
          reason_code: 'shape_mismatch',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      value = meaningfulValues[0];
      attempts.push('shape:scalar_from_singleton_array');
    }

    if (normalizationFnName) {
      const fn = NORMALIZATION_FUNCTIONS[normalizationFnName];
      if (typeof fn === 'function') {
        try {
          const normalizedValue = fn(value, {
            field_key: key,
            rule,
            shape,
            type,
            unit
          });
          if (normalizedValue === null || normalizedValue === undefined) {
            return {
              ok: false,
              reason_code: 'normalization_fn_failed',
              raw_input: rawCandidate,
              attempted_normalizations: attempts
          };
        }
        value = normalizedValue;
        usedExplicitNormalizer = true;
        attempts.push(`fn:${normalizationFnName}`);
      } catch {
        return {
            ok: false,
            reason_code: 'normalization_fn_failed',
            raw_input: rawCandidate,
            attempted_normalizations: attempts
          };
        }
      }
    }

    if (!usedExplicitNormalizer) {
      const templateResult = this._applyTemplateNormalization(key, rule, value);
      if (templateResult.ok === false) {
        return {
          ok: false,
          reason_code: templateResult.reason_code || 'normalize_failed',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      if (templateResult.applied) {
        value = templateResult.value;
        attempts.push(...(templateResult.attempts || []));
      }
    }

    if (type === 'object') {
      const objectList = shape === 'list' && Array.isArray(value) && value.every((entry) => isObject(entry));
      const objectScalar = shape === 'scalar' && isObject(value);
      if (!objectList && !objectScalar) {
        return {
          ok: false,
          reason_code: 'shape_mismatch',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
    } else if (type === 'number' || type === 'integer') {
      if (Array.isArray(value)) {
        const normalizedList = [];
        for (const entry of value) {
          const parsed = parseNumberAndUnit(entry);
          if (parsed.value === null) {
            return {
              ok: false,
              reason_code: 'number_required',
              raw_input: rawCandidate,
              attempted_normalizations: attempts
            };
          }
          let numeric = parsed.value;
          const fromUnit = canonicalUnitToken(parsed.unit);
          if (unit && fromUnit && fromUnit !== unit) {
            numeric = convertUnit(numeric, fromUnit, unit);
            attempts.push(`unit:${fromUnit}->${unit}`);
          }
          if (type === 'integer') {
            numeric = Math.round(numeric);
            attempts.push('round:integer');
          }
          normalizedList.push(Number.parseFloat(numeric.toFixed(6)));
        }
        value = this._roundNumericForDisplay(key, normalizedList);
      } else {
        const parsed = parseNumberAndUnit(value);
        if (parsed.value === null) {
          return {
            ok: false,
            reason_code: 'number_required',
            raw_input: rawCandidate,
            attempted_normalizations: attempts
          };
        }
        let numeric = parsed.value;
        const fromUnit = canonicalUnitToken(parsed.unit);
        if (unit && fromUnit && fromUnit !== unit) {
          numeric = convertUnit(numeric, fromUnit, unit);
          attempts.push(`unit:${fromUnit}->${unit}`);
        }
        if (type === 'integer') {
          numeric = Math.round(numeric);
          attempts.push('round:integer');
        }
        value = this._roundNumericForDisplay(key, Number.parseFloat(numeric.toFixed(6)));
      }
    } else if (type === 'boolean') {
      const boolValue = parseBoolean(value);
      if (boolValue === null) {
        return {
          ok: false,
          reason_code: 'boolean_required',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      value = boolValue;
    } else if (type === 'date') {
      const dateValue = parseDate(value);
      if (!dateValue) {
        return {
          ok: false,
          reason_code: 'date_required',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      value = dateValue;
    } else if (type === 'url') {
      const urlValue = normalizeText(value);
      if (!urlValue) {
        return {
          ok: false,
          reason_code: 'url_required',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      try {
        // URL constructor throws on invalid URL text.
        // eslint-disable-next-line no-new
        new URL(urlValue);
      } catch {
        return {
          ok: false,
          reason_code: 'url_required',
          raw_input: rawCandidate,
          attempted_normalizations: attempts
        };
      }
      value = urlValue;
    } else if (
      type === 'component_ref'
      || template === 'component_reference'
      || normalizeText(rule?.component_db_ref || rule?.component?.type || rule?.parse?.component_type)
    ) {
      const componentResult = resolveComponentRef(value, {
        rule, fieldKey: key, rawCandidate,
        lookupComponent: (db, q) => this.lookupComponent(db, q),
        fuzzyMatchComponent: (db, q, t) => this.fuzzyMatchComponent(db, q, t),
        rules: this.rules,
        context,
        attempts
      });
      if (!componentResult.ok) {
        return componentResult;
      }
      value = componentResult.value;
    } else {
      if (Array.isArray(value)) {
        value = value.map((item) => applyTokenMapToString(item, tokenMap)).filter(Boolean);
        attempts.push('type:string_list');
      } else {
        if (isObject(value)) {
          return {
            ok: false,
            reason_code: 'shape_mismatch',
            raw_input: rawCandidate,
            attempted_normalizations: attempts
          };
        }
        value = applyTokenMapToString(value, tokenMap);
      }
    }

    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      value = value.map((item) => applyTokenMapToString(item, tokenMap)).filter(Boolean);
    } else if (typeof value === 'string') {
      value = applyTokenMapToString(value, tokenMap);
    }

    const shapeCheck = this.validateShapeAndUnits(key, value);
    if (!shapeCheck.ok) {
      return {
        ok: false,
        reason_code: shapeCheck.reason_code || 'shape_mismatch',
        raw_input: rawCandidate,
        attempted_normalizations: attempts
      };
    }

    if (type === 'number' || type === 'integer') {
      const numericValues = Array.isArray(value) ? value : [value];
      for (const numericValue of numericValues) {
        const range = this.validateRange(key, numericValue);
        if (!range.ok) {
          return {
            ok: false,
            reason_code: range.reason_code || 'out_of_range',
            raw_input: rawCandidate,
            attempted_normalizations: attempts
          };
        }
      }
    }

    const enumCheck = this.enforceEnumPolicy(key, value);
    if (!enumCheck.ok) {
      return {
        ok: false,
        reason_code: enumCheck.reason_code || 'enum_value_not_allowed',
        raw_input: rawCandidate,
        attempted_normalizations: attempts
      };
    }

    if (enumCheck.needs_curation && Array.isArray(context?.curationQueue)) {
      context.curationQueue.push({
        field_key: key,
        raw_value: rawCandidate,
        normalized_value: enumCheck.canonical_value
      });
    }

    // Candidate-level list_rules: dedupe only (sort + limits applied in runtimeGate)
    let finalValue = enumCheck.canonical_value;
    if (Array.isArray(finalValue)) {
      const listRules = rule?.contract?.list_rules;
      if (listRules && listRules.dedupe !== false) {
        const seen = new Set();
        const deduped = [];
        for (const item of finalValue) {
          const dedupeKey = isObject(item)
            ? JSON.stringify(item)
            : (typeof item === 'number'
              ? String(item)
              : normalizeToken(String(item)));
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            deduped.push(item);
          }
        }
        if (deduped.length !== finalValue.length) {
          attempts.push('list_rules:dedupe');
        }
        finalValue = deduped;
      }
    }

    return {
      ok: true,
      normalized: finalValue,
      applied_rules: attempts
    };
  }

  crossValidate(fieldKey, value, allFields = {}) {
    return _crossValidate(fieldKey, value, allFields, {
      crossValidationRules: this.crossValidationRules,
      rules: this.rules,
      lookupComponent: (db, q) => this.lookupComponent(db, q)
    });
  }

  evaluateConstraints(allFields = {}) {
    const mappings = this.getAllFieldKeys().map((fieldKey) => ({
      field_key: fieldKey,
      constraints: Array.isArray(this.rules[fieldKey]?.constraints)
        ? this.rules[fieldKey].constraints
        : []
    }));
    return _evaluateAllConstraints(mappings, {}, allFields);
  }

  validateFullRecord(record = {}) {
    const normalized = this.applyKeyMigrations(record);
    const errors = [];
    const warnings = [];
    for (const field of this.getAllFieldKeys()) {
      const value = normalized[field];
      if (value === undefined || isUnknownToken(value)) {
        continue;
      }
      const shapeCheck = this.validateShapeAndUnits(field, value);
      if (!shapeCheck.ok) {
        errors.push(`${field}:${shapeCheck.reason_code}`);
      }
      const enumCheck = this.enforceEnumPolicy(field, value);
      if (!enumCheck.ok) {
        errors.push(`${field}:${enumCheck.reason_code}`);
      }
      const type = parseRuleType(this.rules[field]);
      if (type === 'number' || type === 'integer') {
        const range = this.validateRange(field, value);
        if (!range.ok) {
          errors.push(`${field}:${range.reason_code}`);
        }
      }
      const cross = this.crossValidate(field, value, normalized);
      if (!cross.ok) {
        for (const violation of cross.violations) {
          (violation.severity === 'error' ? errors : warnings).push(`${field}:${violation.rule}`);
        }
      }
    }
    for (const result of this.evaluateConstraints(normalized)) {
      if (result.pass || result.skipped) {
        continue;
      }
      errors.push(`${result.propertyKey}:constraint_failed`);
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  normalizeFullRecord(rawRecord = {}, context = {}) {
    const input = this.applyKeyMigrations(rawRecord);
    const normalized = {};
    const failures = [];
    const unknowns = [];
    const provenanceByField = isObject(context.provenanceByField) ? context.provenanceByField : {};

    for (const field of this.getAllFieldKeys()) {
      const rawValue = input[field];
      const candidate = this.normalizeCandidate(field, rawValue, context);
      if (!candidate.ok) {
        const unknown = this.buildUnknown(field, candidate.reason_code || 'not_found_after_search');
        normalized[field] = unknown;
        unknowns.push(unknown);
        failures.push({
          field_key: field,
          reason_code: candidate.reason_code || 'normalize_failed'
        });
        continue;
      }

      const evidence = this.auditEvidence(field, candidate.normalized, provenanceByField[field], context);
      if (!evidence.ok) {
        const unknown = this.buildUnknown(field, 'evidence_missing');
        normalized[field] = unknown;
        unknowns.push(unknown);
        failures.push({
          field_key: field,
          reason_code: 'evidence_missing'
        });
        continue;
      }

      normalized[field] = candidate.normalized;
    }

    for (const field of Object.keys(normalized)) {
      const value = normalized[field];
      if (isObject(value) && value.value === 'unk') {
        continue;
      }
      const cross = this.crossValidate(field, value, normalized);
      if (!cross.ok) {
        for (const violation of cross.violations) {
          if (violation.severity === 'error') {
            const unknown = this.buildUnknown(field, 'cross_validation_failed');
            normalized[field] = unknown;
            unknowns.push(unknown);
            failures.push({
              field_key: field,
              reason_code: 'cross_validation_failed',
              rule: violation.rule
            });
          } else {
            failures.push({
              field_key: field,
              reason_code: 'cross_validation_warning',
              rule: violation.rule
            });
          }
        }
      }
    }

    for (const result of this.evaluateConstraints(normalized)) {
      if (result.pass || result.skipped) {
        continue;
      }
      const field = normalizeFieldKey(result.propertyKey);
      if (!field || (isObject(normalized[field]) && normalized[field].value === 'unk')) {
        continue;
      }
      const unknown = this.buildUnknown(field, 'constraint_failed');
      normalized[field] = unknown;
      unknowns.push(unknown);
      failures.push({
        field_key: field,
        reason_code: 'constraint_failed',
        rule: result.expr
      });
    }

    return {
      normalized,
      failures,
      unknowns
    };
  }
}

export async function createFieldRulesEngine(category, options = {}) {
  return FieldRulesEngine.create(category, options);
}
