/**
 * deriveFailureValues.js — Per-key failure value derivation from field contracts.
 *
 * For every configured knob on a field, derive one test value that exercises it.
 * Reject knobs → value that triggers the rejection code.
 * Repair knobs → value that triggers the repair step.
 * One good value that passes the full pipeline.
 *
 * O(1) scaling: adding a field key = zero code changes here.
 */

import { DISPATCHED_TEMPLATE_KEYS } from '../features/publisher/validation/templateDispatch.js';

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
  const template = p.template || 'text_field';
  const isDispatched = DISPATCHED_TEMPLATE_KEYS.has(template);
  const listRules = c.list_rules;
  const rangeConfig = c.range;
  const roundingConfig = c.rounding;
  const enumPolicy = knownValues?.policy || e?.policy;
  const enumValues = knownValues?.values;
  const matchStrategy = e?.match?.strategy || 'exact';
  const formatHint = e?.match?.format_hint || null;
  const blockPublishWhenUnk = pri?.block_publish_when_unk || false;
  const unknownToken = c.unknown_token || 'unk';
  const allowNewComponents = comp?.allow_new_components || false;
  const tokenMap = p.token_map;
  const unitAccepts = p.unit_accepts;
  const strictUnit = p.strict_unit_required || false;

  // ── Helpers for generating values that survive to target step ──────────

  // WHY: To test a later step, the value must pass all earlier steps.
  // For dispatched templates, use template-native values.
  // For non-dispatched, use raw values matching shape + type + unit.

  function validListItems(count) {
    if (enumValues?.length >= count) return enumValues.slice(0, count);
    if (template === 'latency_list_modes_ms') return Array.from({ length: count }, (_, i) => `${i + 1} wired`);
    if (template === 'list_of_numbers_with_unit') return Array.from({ length: count }, (_, i) => (i + 1) * 100);
    if (template === 'list_numbers_or_ranges_with_unit') return Array.from({ length: count }, (_, i) => (i + 1) * 0.5);
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
      return strictUnit && unit ? `${v} ${unit}` : v;
    }
    return 'test-value';
  }

  // ── REJECTIONS — one per reject knob ──────────────────────────────────

  // contract.shape
  if (shape === 'scalar') {
    // WHY: Use string array that no dispatched normalizer can convert to scalar.
    // [1,2] fails because parseDate('1,2') produces valid date on some platforms.
    rejects.push({ value: ['__not_scalar_1__', '__not_scalar_2__'], expectedCode: 'wrong_shape', description: 'array where scalar expected' });
  } else if (shape === 'list' && !isDispatched) {
    // WHY: Dispatched list normalizers (normalizeColorList, parsePollingList, etc.) convert
    // ANY input to an array — wrong_shape is physically unreachable for dispatched lists.
    rejects.push({ value: 42, expectedCode: 'wrong_shape', description: 'scalar where list expected' });
  } else if (shape === 'record') {
    rejects.push({ value: 'not-a-record', expectedCode: 'wrong_shape', description: 'string where record expected' });
  }

  // contract.unit (wrong suffix)
  if (unit && unit !== 'none') {
    if (shape === 'scalar' && !isDispatched) {
      rejects.push({ value: '100 zzz', expectedCode: 'wrong_unit', description: `wrong unit suffix for "${unit}"` });
    }
  }

  // parse.strict_unit_required (bare number)
  if (strictUnit && unit && !isDispatched) {
    rejects.push({ value: 42, expectedCode: 'wrong_unit', description: `bare number missing required unit ${unit}` });
  }

  // contract.type
  if (type === 'number' || type === 'integer') {
    if (!isDispatched && shape === 'scalar') {
      rejects.push({ value: 'abc-def', expectedCode: 'wrong_type', description: `non-numeric string for ${type} field` });
    }
  } else if (type === 'string') {
    // WHY: For dispatched string templates (boolean, date, list_of_tokens),
    // the normalizer handles type. For non-dispatched string, type check always passes.
    // String type can't produce wrong_type — skip.
  }

  // enum.match.format_hint
  if (formatHint && type === 'string' && shape === 'scalar') {
    rejects.push({ value: '!!!INVALID_FORMAT!!!', expectedCode: 'format_mismatch', description: `does not match format_hint: ${formatHint}` });
  }

  // format_mismatch via template regex (url_field)
  if (template === 'url_field') {
    rejects.push({ value: 'not-a-valid-url', expectedCode: 'format_mismatch', description: 'invalid URL format' });
  }

  // contract.list_rules.min_items
  if (shape === 'list' && listRules?.min_items && listRules.min_items > 0) {
    rejects.push({ value: [], expectedCode: 'min_items_violation', description: `empty list below min_items=${listRules.min_items}` });
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
  if (rangeConfig && !isDispatched && shape === 'scalar') {
    const hasMin = typeof rangeConfig.min === 'number' && Number.isFinite(rangeConfig.min);
    const hasMax = typeof rangeConfig.max === 'number' && Number.isFinite(rangeConfig.max);
    if (hasMin || hasMax) {
      const outVal = hasMax ? rangeConfig.max * 2 + 1 : rangeConfig.min - 1000;
      const val = strictUnit && unit ? `${outVal} ${unit}` : outVal;
      rejects.push({ value: val, expectedCode: 'out_of_range', description: `${outVal} exceeds range` });
    }
  }

  // component.type — not_in_component_db (only when !allow_new)
  if (template === 'component_reference' && componentDb?.items?.length > 0 && !allowNewComponents) {
    rejects.push({ value: '__sf_nonexistent_component__', expectedCode: 'not_in_component_db', description: 'unknown component name' });
  }

  // priority.block_publish_when_unk
  if (blockPublishWhenUnk && shape === 'scalar') {
    rejects.push({ value: unknownToken, expectedCode: 'unk_blocks_publish', description: `${unknownToken} blocks publish` });
  }

  // ── REPAIRS — one per repair knob ─────────────────────────────────────

  // contract.rounding
  // WHY: Rounding only applies to numeric values. Skip for string-typed fields
  // (e.g., native_colors with type=string but rounding configured — config mismatch).
  if (roundingConfig?.decimals != null && !isDispatched && shape === 'scalar' && (type === 'number' || type === 'integer')) {
    const mid = rangeConfig ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2 : 50;
    const excess = mid + 0.123456789;
    const factor = Math.pow(10, roundingConfig.decimals);
    const mode = roundingConfig.mode || 'nearest';
    let expected;
    if (mode === 'floor') expected = Math.floor(excess * factor) / factor;
    else if (mode === 'ceil') expected = Math.ceil(excess * factor) / factor;
    else expected = Math.round(excess * factor) / factor;
    const inputValue = strictUnit && unit ? `${excess} ${unit}` : excess;
    repairs.push({ value: inputValue, expectedRepair: expected, knob: 'rounding', description: `rounds to ${roundingConfig.decimals} decimals (${mode})` });
  }

  // contract.list_rules.dedupe
  // WHY: parsePollingList already dedupes internally — list_rules.dedupe has nothing to do.
  // Only generate test when the normalizer doesn't self-dedupe.
  const selfDedupeTemplates = new Set(['list_of_numbers_with_unit']);
  if (shape === 'list' && listRules?.dedupe && !selfDedupeTemplates.has(template)) {
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

  // contract.list_rules.max_items
  if (shape === 'list' && listRules?.max_items) {
    const maxN = listRules.max_items;
    // WHY: Items must be unique (dedupe runs first) and survive the normalizer.
    // Generate unique items appropriate to the template type.
    const overSize = generateUniqueListItems(template, maxN + 5);
    if (overSize) {
      repairs.push({ value: overSize, expectedRepair: overSize.slice(0, maxN), knob: 'max_items', description: `truncates to max_items=${maxN}` });
    }
  }

  // parse.token_map
  if (tokenMap && typeof tokenMap === 'object' && !isDispatched) {
    const entries = Object.entries(tokenMap);
    if (entries.length > 0) {
      const [inputToken, canonicalValue] = entries[0];
      repairs.push({ value: inputToken, expectedRepair: canonicalValue, knob: 'token_map', description: `token_map: "${inputToken}" → "${canonicalValue}"` });
    }
  }

  // parse.unit_accepts
  // WHY: Only pick alternates that UNIT_REGEX can parse (alpha + %° only, no slashes or special chars).
  const UNIT_SAFE = /^[a-zA-Z%°]+$/;
  if (unitAccepts?.length > 0 && unit && unit !== 'none' && !isDispatched && shape === 'scalar') {
    const alternate = unitAccepts.find(u => u.toLowerCase() !== unit.toLowerCase() && UNIT_SAFE.test(u));
    if (alternate) {
      const mid = rangeConfig ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2 : 50;
      let numVal = mid;
      if (roundingConfig?.decimals != null) {
        const f = Math.pow(10, roundingConfig.decimals);
        numVal = Math.round(numVal * f) / f;
      }
      repairs.push({ value: `${numVal} ${alternate}`, expectedRepair: numVal, knob: 'unit_accepts', description: `accepts "${alternate}" → strips to number` });
    }
  }

  // enum.match.strategy (alias) — deterministic alias resolution
  // WHY: Alias only fires when enum check rejects/flags an unknown value.
  // 'open' policy accepts all values → alias never runs.
  // Skip for number/integer types (string test value fails type check)
  // and boolean templates (format check rejects non-boolean values).
  const aliasTypeOk = type === 'string' && template !== 'boolean_yes_no_unk';
  const aliasPolicyOk = enumPolicy && enumPolicy !== 'open';
  if (matchStrategy === 'alias' && enumValues?.length > 0 && aliasTypeOk && aliasPolicyOk) {
    const aliasCandidate = findAliasTestValue(enumValues);
    if (aliasCandidate) {
      const val = shape === 'list' ? [aliasCandidate.input] : aliasCandidate.input;
      const exp = shape === 'list' ? [aliasCandidate.canonical] : aliasCandidate.canonical;
      repairs.push({ value: val, expectedRepair: exp, knob: 'alias_resolve', description: `alias resolves "${aliasCandidate.input}" → "${aliasCandidate.canonical}"` });
    }
  }

  // component.allow_new_components
  if (template === 'component_reference' && allowNewComponents && componentDb?.items?.length > 0) {
    repairs.push({ value: '__sf_brand_new_component__', expectedRepair: '__sf_brand_new_component__', knob: 'allow_new_components', description: 'unknown component accepted when allow_new=true' });
  }

  // ── Knobs that are configured but untestable with current data ────────
  // (reported for transparency but no check generated)
  // - contract.shape on dispatched list: normalizer always produces array
  // - enum.match.strategy when all known values are single-word lowercase
  // - contract.list_rules.dedupe on self-deduping normalizers (parsePollingList)

  // ── GOOD VALUE ────────────────────────────────────────────────────────

  const good = deriveGoodValue(fieldKey, fieldRule, knownValues, componentDb);

  return { rejects, repairs, good };
}

// ── Unique list item generator ─────────────────────────────────────────────
// WHY: max_items test needs N unique items that survive the template normalizer.
// Dedupe runs before max_items, so repeated items get collapsed.

function generateUniqueListItems(template, count) {
  if (template === 'list_of_tokens_delimited') {
    // WHY: Must match format regex /^[a-z][a-z0-9-]*$/
    return Array.from({ length: count }, (_, i) => `item-${i}`);
  }
  if (template === 'latency_list_modes_ms') {
    return Array.from({ length: count }, (_, i) => `${i + 1} wired`);
  }
  if (template === 'list_of_numbers_with_unit') {
    return Array.from({ length: count }, (_, i) => (i + 1) * 10);
  }
  if (template === 'list_numbers_or_ranges_with_unit') {
    return Array.from({ length: count }, (_, i) => (i + 1) * 0.5);
  }
  return Array.from({ length: count }, (_, i) => `item-${i}`);
}

// ── Alias test value finder ───────────────────────────────────────────────
// WHY: Normalize (step 5) does trim → lowercase → spaces→hyphens → underscores→hyphens → collapse.
// Alias (step 9) does normForCompare: collapse [-_\s]+ to single space.
// Only generate a test when the post-normalize form does NOT exact-match any known value,
// but normForCompare CAN resolve it.

function simpleNormalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-').replace(/-+/g, '-');
}

function findAliasTestValue(enumValues) {
  if (!enumValues?.length) return null;
  const knownSet = new Set(enumValues);

  for (const canonical of enumValues) {
    // Skip values already in fully normalized form — normalize handles them
    if (/^[a-z0-9-]*$/.test(canonical)) continue;

    // Value has non-normalized chars (uppercase, spaces, underscores, special).
    // Generate input where normalize produces a DIFFERENT string than the canonical,
    // but alias normForCompare can still resolve.
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
  const template = fieldRule?.parse?.template || 'text_field';
  const type = fieldRule?.contract?.type || fieldRule?.data_type || 'string';
  const shape = fieldRule?.contract?.shape || 'scalar';
  const unit = fieldRule?.contract?.unit || '';
  const range = fieldRule?.contract?.range;
  const rounding = fieldRule?.contract?.rounding;
  const strictUnit = fieldRule?.parse?.strict_unit_required || false;

  if (template === 'boolean_yes_no_unk') {
    return { value: 'yes', description: 'boolean yes' };
  }

  if (template === 'component_reference') {
    const firstName = componentDb?.items?.[0]?.name;
    if (firstName) return { value: firstName, description: `first DB item: ${firstName}` };
    if (knownValues?.values?.length > 0) return { value: knownValues.values[0], description: `first known: ${knownValues.values[0]}` };
    return { value: 'test-component', description: 'fallback component' };
  }

  if (template === 'date_field') {
    return { value: '2024-06-15', description: 'valid date' };
  }

  if (template === 'url_field') {
    return { value: 'https://example.com/test', description: 'valid URL' };
  }

  if (shape === 'list') {
    if (knownValues?.values?.length > 0) {
      const items = knownValues.values.slice(0, 2);
      return { value: items, description: `known list items: ${items.join(', ')}` };
    }
    if (template === 'latency_list_modes_ms') {
      return { value: ['1 wired', '2 wireless'], description: 'latency list' };
    }
    if (template === 'list_of_numbers_with_unit') {
      return { value: [1000, 500], description: 'numeric list' };
    }
    if (template === 'list_numbers_or_ranges_with_unit') {
      return { value: [1.2, 2.4], description: 'numeric range list' };
    }
    if (type === 'number' || type === 'integer') {
      return { value: [1, 2], description: 'numeric list' };
    }
    return { value: ['test-item-1', 'test-item-2'], description: 'valid list' };
  }

  if (type === 'number' || type === 'integer') {
    let mid = range ? ((range.min ?? 0) + (range.max ?? 100)) / 2 : 50;
    if (rounding?.decimals != null) {
      const f = Math.pow(10, rounding.decimals);
      mid = Math.round(mid * f) / f;
    }
    if (strictUnit && unit) {
      return { value: `${mid} ${unit}`, description: `midpoint with unit: ${mid} ${unit}` };
    }
    return { value: mid, description: `midpoint: ${mid}` };
  }

  // WHY: Use pre-normalized known value so it survives normalize step (lowercase + hyphens).
  if (knownValues?.values?.length > 0) {
    const raw = knownValues.values[0];
    const normalized = raw.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    return { value: normalized, description: `first known (normalized): ${normalized}` };
  }

  return { value: 'test_value', description: 'default string' };
}
