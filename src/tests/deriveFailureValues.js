/**
 * deriveFailureValues.js — Per-key failure value derivation from field contracts.
 *
 * For every configured knob on a field, derive one test value that exercises it.
 * Reject knobs → value that triggers the rejection code.
 * Repair knobs → value that triggers the repair step.
 * One good value that passes the full pipeline.
 *
 * O(1) scaling: adding a field key = zero code changes here.
 * Type-driven: routes by contract.type, not parse.template.
 */

import { shouldBlockUnkPublish } from '../features/publisher/validation/shouldBlockUnkPublish.js';

/**
 * @param {string} fieldKey
 * @param {object} fieldRule
 * @param {object|null} knownValues - { policy, values }
 * @param {object|null} componentDb - { items: [{ name, aliases? }] }
 * @returns {{ rejects: object[], repairs: object[], good: object }}
 */
export function deriveTestValues(fieldKey, fieldRule, knownValues, componentDb) {
  const rejects = [];
  const repairs = [];

  const c = fieldRule?.contract || {};
  const p = fieldRule?.parse || {};
  const e = fieldRule?.enum || {};
  const pri = fieldRule?.priority || {};
  const comp = fieldRule?.component || {};

  const shape = c.shape || 'scalar';
  const type = c.type || fieldRule?.data_type || 'string';
  const unit = c.unit || '';
  const listRules = c.list_rules;
  const rangeConfig = c.range;
  const roundingConfig = c.rounding;
  const enumPolicy = knownValues?.policy || e?.policy;
  const enumValues = knownValues?.values;
  const formatHint = e?.match?.format_hint || null;
  const blockPublishWhenUnk = shouldBlockUnkPublish(fieldRule);
  const unknownToken = null;
  const allowNewComponents = comp?.allow_new_components || false;
  const tokenMap = p.token_map;

  // ── Helpers for generating values that survive to target step ──────────

  function validListItems(count) {
    if (enumValues?.length >= count) return enumValues.slice(0, count);
    if (type === 'number' || type === 'integer') return Array.from({ length: count }, (_, i) => (i + 1) * 100);
    if (type === 'mixed_number_range') return Array.from({ length: count }, (_, i) => (i + 1) * 0.5);
    return Array.from({ length: count }, (_, i) => `test-item-${i}`);
  }

  function validScalar() {
    if (type === 'number' || type === 'integer') {
      const mid = rangeConfig ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2 : 50;
      let v = mid;
      if (roundingConfig?.decimals != null) {
        const f = Math.pow(10, roundingConfig.decimals);
        v = Math.round(v * f) / f;
      }
      return v;
    }
    return 'test-value';
  }

  // ── REJECTIONS — one per reject knob ──────────────────────────────────

  // contract.shape
  if (shape === 'scalar') {
    rejects.push({ value: ['__not_scalar_1__', '__not_scalar_2__'], expectedCode: 'wrong_shape', description: 'array where scalar expected' });
  } else if (shape === 'list') {
    // WHY: Shape check now runs before any coercion — always reachable for lists.
    rejects.push({ value: 42, expectedCode: 'wrong_shape', description: 'scalar where list expected' });
  }

  // contract.unit (wrong suffix)
  if (unit && unit !== 'none' && shape === 'scalar') {
    rejects.push({ value: '100 zzz', expectedCode: 'wrong_unit', description: `wrong unit suffix for "${unit}"` });
  }


  // contract.type
  if ((type === 'number' || type === 'integer') && shape === 'scalar') {
    rejects.push({ value: 'abc-def', expectedCode: 'wrong_type', description: `non-numeric string for ${type} field` });
  }
  if (type === 'boolean' && shape === 'scalar') {
    rejects.push({ value: 'maybe-not-boolean', expectedCode: 'wrong_type', description: 'unrecognized boolean value' });
  }
  if (type === 'date' && shape === 'scalar') {
    rejects.push({ value: 'not-a-date-value', expectedCode: 'wrong_type', description: 'unparseable date' });
  }
  if (type === 'url' && shape === 'scalar') {
    rejects.push({ value: 'not-a-valid-url', expectedCode: 'format_mismatch', description: 'invalid URL format' });
  }

  // enum.match.format_hint
  if (formatHint && type === 'string' && shape === 'scalar') {
    rejects.push({ value: '!!!INVALID_FORMAT!!!', expectedCode: 'format_mismatch', description: `does not match format_hint: ${formatHint}` });
  }

  // enum.policy — closed
  if (enumPolicy === 'closed' && enumValues?.length > 0) {
    const badVal = shape === 'list' ? ['__sf_invalid_enum__'] : '__sf_invalid_enum__';
    rejects.push({ value: badVal, expectedCode: 'enum_value_not_allowed', description: 'invalid value for closed enum' });
  }

  // enum.policy — open_prefer_known
  if (enumPolicy === 'open_prefer_known' && enumValues?.length > 0) {
    const badVal = shape === 'list' ? ['__sf_unknown_enum__'] : '__sf_unknown_enum__';
    rejects.push({ value: badVal, expectedCode: 'unknown_enum_prefer_known', description: 'unknown value for open_prefer_known enum' });
  }

  // contract.range
  if (rangeConfig && shape === 'scalar') {
    const hasMin = typeof rangeConfig.min === 'number' && Number.isFinite(rangeConfig.min);
    const hasMax = typeof rangeConfig.max === 'number' && Number.isFinite(rangeConfig.max);
    if (hasMin || hasMax) {
      const outVal = hasMax ? rangeConfig.max * 2 + 1 : rangeConfig.min - 1000;
      const val = outVal;
      rejects.push({ value: val, expectedCode: 'out_of_range', description: `${outVal} exceeds range` });
    }
  }

  // priority.block_publish_when_unk
  if (blockPublishWhenUnk && shape === 'scalar') {
    rejects.push({ value: unknownToken, expectedCode: 'unk_blocks_publish', description: `${unknownToken} blocks publish` });
  }

  // ── REPAIRS — one per repair knob ─────────────────────────────────────

  // contract.unit — synonym repair (registry resolves synonym → canonical)
  // WHY: Only generates a synonym test when the unit has a known synonym in the registry.
  // This proves the registry is wired end-to-end through the validator.
  const UNIT_SYNONYM_MAP = { g: 'grams', Hz: 'hertz', mm: 'millimeters', ms: 'milliseconds', W: 'watt', '%': 'percent' };
  const UNIT_CONVERSION_MAP = { g: { from: 'lb', factor: 453.592 }, mm: { from: 'in', factor: 25.4 }, Hz: { from: 'kHz', factor: 1000 } };
  if (unit && unit !== 'none' && shape === 'scalar' && UNIT_SYNONYM_MAP[unit]) {
    const synonym = UNIT_SYNONYM_MAP[unit];
    const mid = rangeConfig ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2 : 50;
    let numVal = mid;
    if (roundingConfig?.decimals != null) {
      const f = Math.pow(10, roundingConfig.decimals);
      numVal = Math.round(numVal * f) / f;
    }
    repairs.push({ value: `${numVal} ${synonym}`, expectedRepair: numVal, knob: 'unit', description: `synonym "${synonym}" → strips to number` });
  }

  // contract.unit — conversion repair (registry converts foreign unit → canonical)
  if (unit && unit !== 'none' && shape === 'scalar' && UNIT_CONVERSION_MAP[unit]) {
    const conv = UNIT_CONVERSION_MAP[unit];
    const inputVal = 1;
    const expectedVal = inputVal * conv.factor;
    repairs.push({ value: `${inputVal} ${conv.from}`, expectedRepair: expectedVal, knob: 'unit_convert', description: `conversion ${conv.from}→${unit} via factor ${conv.factor}` });
  }

  // contract.rounding
  if (roundingConfig?.decimals != null && shape === 'scalar' && (type === 'number' || type === 'integer')) {
    const mid = rangeConfig ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2 : 50;
    const excess = mid + 0.123456789;
    const factor = Math.pow(10, roundingConfig.decimals);
    const mode = roundingConfig.mode || 'nearest';
    let expected;
    if (mode === 'floor') expected = Math.floor(excess * factor) / factor;
    else if (mode === 'ceil') expected = Math.ceil(excess * factor) / factor;
    else expected = Math.round(excess * factor) / factor;
    const inputValue = excess;
    repairs.push({ value: inputValue, expectedRepair: expected, knob: 'rounding', description: `rounds to ${roundingConfig.decimals} decimals (${mode})` });
  }

  // contract.list_rules.dedupe
  if (shape === 'list' && listRules?.dedupe) {
    const items = validListItems(2);
    repairs.push({ value: [...items, items[0]], expectedRepair: items, knob: 'dedupe', description: 'deduplicates list items' });
  }

  // contract.list_rules.sort (alpha)
  if (shape === 'list' && listRules?.sort === 'alpha') {
    const items = validListItems(3);
    const sorted = [...items].sort();
    const reversed = [...sorted].reverse();
    repairs.push({ value: reversed, expectedRepair: sorted, knob: 'sort_alpha', description: 'sorts list alphabetically' });
  }

  // parse.token_map
  // WHY: normalize step runs on the whole value (typeof === 'string'), not per-element.
  // Token_map only fires for scalar fields in the current pipeline.
  if (tokenMap && typeof tokenMap === 'object' && shape === 'scalar') {
    const entries = Object.entries(tokenMap);
    if (entries.length > 0) {
      const [inputToken, canonicalValue] = entries[0];
      repairs.push({ value: inputToken, expectedRepair: canonicalValue, knob: 'token_map', description: `token_map: "${inputToken}" → "${canonicalValue}"` });
    }
  }


  // open_prefer_known alias resolution
  const aliasTypeOk = type === 'string' && type !== 'boolean';
  const aliasPolicyOk = enumPolicy && enumPolicy !== 'open';
  if (enumPolicy === 'open_prefer_known' && enumValues?.length > 0 && aliasTypeOk && aliasPolicyOk) {
    const aliasCandidate = findAliasTestValue(enumValues);
    if (aliasCandidate) {
      const val = shape === 'list' ? [aliasCandidate.input] : aliasCandidate.input;
      const exp = shape === 'list' ? [aliasCandidate.canonical] : aliasCandidate.canonical;
      repairs.push({ value: val, expectedRepair: exp, knob: 'alias_resolve', description: `alias resolves "${aliasCandidate.input}" → "${aliasCandidate.canonical}"` });
    }
  }

  // ── GOOD VALUE ────────────────────────────────────────────────────────

  const good = deriveGoodValue(fieldKey, fieldRule, knownValues, componentDb);

  return { rejects, repairs, good };
}

// ── Unique list item generator ─────────────────────────────────────────────

function generateUniqueListItems(type, shape, count) {
  if (type === 'number' || type === 'integer') {
    return Array.from({ length: count }, (_, i) => (i + 1) * 10);
  }
  if (type === 'mixed_number_range') {
    return Array.from({ length: count }, (_, i) => (i + 1) * 0.5);
  }
  return Array.from({ length: count }, (_, i) => `item-${i}`);
}

// ── Alias test value finder ───────────────────────────────────────────────

function simpleNormalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-').replace(/-+/g, '-');
}

function findAliasTestValue(enumValues) {
  if (!enumValues?.length) return null;
  const knownSet = new Set(enumValues);

  for (const canonical of enumValues) {
    if (/^[a-z0-9-]*$/.test(canonical)) continue;

    if (canonical.includes(' ')) {
      const input = canonical.replace(/\s+/g, '--');
      const normalized = simpleNormalize(input);
      if (!knownSet.has(normalized)) return { input, canonical };
    }
    if (canonical.includes('-')) {
      const input = canonical.replace(/-/g, '__');
      const normalized = simpleNormalize(input);
      if (!knownSet.has(normalized)) return { input, canonical };
    }
  }

  return null;
}

// ── Good value derivation ─────────────────────────────────────────────────

function deriveGoodValue(fieldKey, fieldRule, knownValues, componentDb) {
  const type = fieldRule?.contract?.type || fieldRule?.data_type || 'string';
  const shape = fieldRule?.contract?.shape || 'scalar';
  const unit = fieldRule?.contract?.unit || '';
  const range = fieldRule?.contract?.range;
  const rounding = fieldRule?.contract?.rounding;

  if (type === 'boolean') {
    return { value: 'yes', description: 'boolean yes' };
  }

  if (type === 'date') {
    return { value: '2024-06-15', description: 'valid date' };
  }

  if (type === 'url') {
    return { value: 'https://example.com/test', description: 'valid URL' };
  }

  if (shape === 'list') {
    if (knownValues?.values?.length > 0) {
      const items = knownValues.values.slice(0, 2);
      return { value: items, description: `known list items: ${items.join(', ')}` };
    }
    if (type === 'number' || type === 'integer') {
      return { value: [1, 2], description: 'numeric list' };
    }
    if (type === 'mixed_number_range') {
      return { value: [1.2, 2.4], description: 'numeric range list' };
    }
    return { value: ['test-item-1', 'test-item-2'], description: 'valid list' };
  }

  if (type === 'number' || type === 'integer') {
    let mid = range ? ((range.min ?? 0) + (range.max ?? 100)) / 2 : 50;
    if (rounding?.decimals != null) {
      const f = Math.pow(10, rounding.decimals);
      mid = Math.round(mid * f) / f;
    }
    return { value: mid, description: `midpoint: ${mid}` };
  }

  if (knownValues?.values?.length > 0) {
    const raw = knownValues.values[0];
    const normalized = raw.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    return { value: normalized, description: `first known (normalized): ${normalized}` };
  }

  return { value: 'test_value', description: 'default string' };
}
