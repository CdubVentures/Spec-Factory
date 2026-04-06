import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FieldRulesEngine } from '../fieldRulesEngine.js';

const CATEGORIES = ['mouse', 'keyboard', 'monitor'];
const UNKNOWN_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '-']);
const SUPPORTED_TEMPLATES = new Set([
  'boolean_yes_no_unk',
  'component_reference',
  'date_field',
  'integer_field',
  'integer_with_unit',
  'latency_list_modes_ms',
  'list_numbers_or_ranges_with_unit',
  'list_of_numbers_with_unit',
  'list_of_tokens_delimited',
  'number_with_unit',
  'text_field',
  'url_field'
]);
const ENGINE_CACHE = new Map();

async function getEngine(category) {
  if (!ENGINE_CACHE.has(category)) {
    ENGINE_CACHE.set(category, FieldRulesEngine.create(category, {
      config: { categoryAuthorityRoot: 'category_authority' }
    }));
  }
  return ENGINE_CACHE.get(category);
}

function readGenerated(category, name) {
  return JSON.parse(fs.readFileSync(`category_authority/${category}/_generated/${name}`, 'utf8'));
}

function isUnknownToken(value) {
  return UNKNOWN_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getEnumSample(engine, fieldKey) {
  const row = engine.knownValues?.enums?.[fieldKey];
  const values = Array.isArray(row?.values) ? row.values : [];
  for (const entry of values) {
    const candidate = typeof entry === 'string'
      ? entry
      : (entry?.canonical || entry?.value || '');
    if (candidate && !isUnknownToken(candidate)) {
      return String(candidate);
    }
  }
  return null;
}

function pickNumericValue(rule) {
  const range = rule?.contract?.range || {};
  const min = asNumber(range.min);
  const max = asNumber(range.max);
  if (min !== null && max !== null) return Math.min(max, Math.max(min, (min + max) / 2));
  if (min !== null) return min;
  if (max !== null) return Math.min(max, 1);

  const unit = String(rule?.parse?.unit || rule?.contract?.unit || '').trim().toLowerCase();
  const defaultsByUnit = {
    '%': 50,
    deg: 5,
    dpi: 16000,
    g: 50,
    gf: 50,
    h: 20,
    hours: 20,
    hz: 1000,
    in: 27,
    ips: 400,
    kg: 1,
    m: 1,
    mah: 4000,
    mm: 10,
    ms: 1.5,
    nits: 400,
    ppi: 110,
    usd: 100,
    w: 50,
    year: 2024
  };
  return defaultsByUnit[unit] ?? 1;
}

function unitSuffix(rule) {
  const unit = String(rule?.parse?.unit || rule?.contract?.unit || '').trim();
  return unit && unit.toLowerCase() !== 'none' ? ` ${unit}` : '';
}

function chooseRepresentativeSample(engine, fieldKey, rule) {
  const samples = Array.isArray(rule?.field_studio_hints?.dataEntry?.sample_values)
    ? rule.field_studio_hints.dataEntry.sample_values
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    : [];
  const liveSample = samples.find((value) => !isUnknownToken(value));
  if (liveSample) {
    return liveSample;
  }

  const enumSample = getEnumSample(engine, fieldKey);
  const numeric = pickNumericValue(rule);
  const template = String(rule?.parse?.template || '').trim();

  switch (template) {
    case 'boolean_yes_no_unk':
      return 'Yes';
    case 'component_reference':
      return enumSample || 'PAW3395';
    case 'date_field':
      return 'Oct 2024';
    case 'integer_field':
      return enumSample || String(Math.round(numeric) || 1);
    case 'integer_with_unit':
      return `${Math.round(numeric) || 1}${unitSuffix(rule)}`.trim();
    case 'latency_list_modes_ms':
      return '1.1 wired, 1.3 wireless';
    case 'list_numbers_or_ranges_with_unit':
      return `1-3${unitSuffix(rule)}`.trim();
    case 'list_of_numbers_with_unit':
      return String(rule?.parse?.unit || rule?.contract?.unit || '').trim().toLowerCase() === 'hz'
        ? '1k, 2k'
        : `${numeric}${unitSuffix(rule)}, ${numeric + 1}${unitSuffix(rule)}`;
    case 'list_of_tokens_delimited':
      if (fieldKey === 'colors') return 'white+black, gray+black';
      return enumSample ? `${enumSample}, ${enumSample}` : 'sample-a, sample-b';
    case 'number_with_unit':
      return `${numeric}${unitSuffix(rule)}`.trim();
    case 'text_field':
      return enumSample || 'sample';
    case 'url_field':
      return 'example.com/spec';
    default:
      return null;
  }
}

function outputMatchesContract(rule, value) {
  const type = String(rule?.contract?.type || '').trim();
  const shape = String(rule?.contract?.shape || '').trim();
  if (shape === 'list' && !Array.isArray(value)) {
    return false;
  }
  if (shape === 'scalar' && Array.isArray(value)) {
    return false;
  }
  if (type === 'number') {
    const values = Array.isArray(value) ? value : [value];
    return values.every((entry) => typeof entry === 'number');
  }
  if (type === 'object') {
    const values = Array.isArray(value) ? value : [value];
    return values.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
  }
  if (type === 'string') {
    const values = Array.isArray(value) ? value : [value];
    return values.every((entry) => typeof entry === 'string');
  }
  return true;
}

test('live generated field rules expose a complete validation contract surface', () => {
  const issues = [];
  const allowedEnumPolicies = new Set(['open', 'open_prefer_known', 'closed', 'closed_with_curation']);

  for (const category of CATEGORIES) {
    const fieldRules = readGenerated(category, 'field_rules.json').fields || {};
    const uiCatalog = readGenerated(category, 'ui_field_catalog.json');
    const uiFieldKeys = new Set((uiCatalog.fields || []).map((row) => String(row.key || '').trim()));

    for (const [fieldKey, rule] of Object.entries(fieldRules)) {
      const contract = rule?.contract || {};
      const template = String(rule?.parse?.template || '').trim();
      const enumPolicy = String(rule?.enum?.policy || rule?.enum_policy || '').trim();

      if (!contract.type) issues.push(`${category}:${fieldKey} missing contract.type`);
      if (!contract.shape) issues.push(`${category}:${fieldKey} missing contract.shape`);
      if (!template) issues.push(`${category}:${fieldKey} missing parse.template`);
      if (template && !SUPPORTED_TEMPLATES.has(template)) issues.push(`${category}:${fieldKey} unsupported template ${template}`);
      if (!allowedEnumPolicies.has(enumPolicy)) issues.push(`${category}:${fieldKey} invalid enum policy ${enumPolicy || '(empty)'}`);
      if (!uiFieldKeys.has(fieldKey)) issues.push(`${category}:${fieldKey} missing ui_field_catalog entry`);
      if (contract.shape === 'list' && !contract.list_rules) issues.push(`${category}:${fieldKey} missing contract.list_rules`);
      if (contract.type === 'object' && !contract.object_schema) issues.push(`${category}:${fieldKey} missing contract.object_schema`);
    }
  }

  assert.deepEqual(issues, []);
});

test('live generated field samples normalize through the runtime engine across all categories', async () => {
  const failures = [];

  for (const category of CATEGORIES) {
    const engine = await getEngine(category);
    const fieldRules = readGenerated(category, 'field_rules.json').fields || {};

    for (const [fieldKey, rule] of Object.entries(fieldRules)) {
      const sample = chooseRepresentativeSample(engine, fieldKey, rule);
      if (!sample) {
        continue;
      }

      const result = engine.normalizeCandidate(fieldKey, sample, { curationQueue: [] });
      if (!result.ok) {
        failures.push(`${category}:${fieldKey} sample="${sample}" -> ${result.reason_code}`);
        continue;
      }
      if (!outputMatchesContract(rule, result.normalized)) {
        failures.push(`${category}:${fieldKey} sample="${sample}" -> contract mismatch`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
