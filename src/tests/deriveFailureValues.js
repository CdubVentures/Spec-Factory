/**
 * deriveFailureValues.js — Per-key failure value derivation from field contracts.
 *
 * Pure function. Reads contract rules → returns bad values (one per applicable
 * failure point) + repair values + one good value per field key.
 *
 * O(1) scaling: adding a field key = zero code changes here.
 */

import { DISPATCHED_TEMPLATE_KEYS } from '../features/publish-pipeline/validation/templateDispatch.js';
import { FORMAT_REGISTRY } from '../features/publish-pipeline/validation/formatRegistry.js';

/**
 * Derive test values for a single field key from its contract rules.
 *
 * @param {string} fieldKey
 * @param {object} fieldRule - from field_rules.fields[fieldKey]
 * @param {object|null} knownValues - from known_values.enums[fieldKey] ({ policy, values })
 * @param {object|null} componentDb - { items: [{ name, aliases? }] }
 * @returns {{
 *   rejects: { value: *, expectedCode: string, description: string }[],
 *   repairs: { value: *, expectedRepair: *, knob: string, description: string }[],
 *   good: { value: *, description: string }
 * }}
 */
export function deriveTestValues(fieldKey, fieldRule, knownValues, componentDb) {
  const rejects = [];
  const repairs = [];

  const contract = fieldRule?.contract || {};
  const parse = fieldRule?.parse || {};
  const enumBlock = fieldRule?.enum || {};
  const priority = fieldRule?.priority || {};
  const component = fieldRule?.component || {};

  const shape = contract.shape || 'scalar';
  const type = contract.type || fieldRule?.data_type || 'string';
  const unit = contract.unit || '';
  const template = parse.template || 'text_field';
  const isDispatched = DISPATCHED_TEMPLATE_KEYS.has(template);
  const listRules = contract.list_rules;
  const rangeConfig = contract.range;
  const roundingConfig = contract.rounding;
  const enumPolicy = knownValues?.policy || enumBlock?.policy;
  const enumValues = knownValues?.values;
  const matchStrategy = enumBlock?.match?.strategy || 'exact';
  const formatHint = enumBlock?.match?.format_hint || null;
  const blockPublishWhenUnk = priority?.block_publish_when_unk || false;
  const unknownToken = contract.unknown_token || 'unk';
  const allowNewComponents = component?.allow_new_components || false;
  const tokenMap = parse.token_map;
  const unitAccepts = parse.unit_accepts;
  const unitConversions = parse.unit_conversions;

  // ── REJECTIONS ──────────────────────────────────────────────────────────

  // 1. wrong_shape — short-circuits on failure
  // WHY: Dispatched list normalizers (e.g., normalizeColorList) convert ANY input to arrays,
  // so wrong_shape is unreachable for dispatched list templates — skip them.
  if (shape === 'list' && !isDispatched) {
    rejects.push({ value: 42, expectedCode: 'wrong_shape', description: 'scalar where list expected' });
  } else if (shape === 'record') {
    rejects.push({ value: 'not-a-record', expectedCode: 'wrong_shape', description: 'string where record expected' });
  } else if (shape === 'scalar') {
    rejects.push({ value: [1, 2], expectedCode: 'wrong_shape', description: 'array where scalar expected' });
  }

  // 2. wrong_unit (wrong suffix) — unit + non-dispatched
  // WHY: Use letters-only suffix so UNIT_REGEX matches and checkUnit rejects the wrong unit
  if (unit && !isDispatched) {
    rejects.push({
      value: '100 zzz',
      expectedCode: 'wrong_unit',
      description: `wrong unit suffix "zzz" for expected "${unit}"`,
    });
  }

  // 3. wrong_unit (bare number) — strict_unit_required + unit + non-dispatched
  if (parse.strict_unit_required && unit && !isDispatched) {
    rejects.push({
      value: 42,
      expectedCode: 'wrong_unit',
      description: `bare number missing required unit ${unit}`,
    });
  }

  // 4. wrong_type — non-dispatched number/integer fields
  if (!isDispatched && (type === 'number' || type === 'integer')) {
    rejects.push({
      value: 'abc-def',
      expectedCode: 'wrong_type',
      description: 'non-numeric string for number field',
    });
  }

  // 5. format_mismatch — url_field (not dispatched, in FORMAT_REGISTRY)
  if (template === 'url_field') {
    rejects.push({
      value: 'not-a-valid-url',
      expectedCode: 'format_mismatch',
      description: 'invalid URL format',
    });
  }

  // 5b. format_mismatch — custom format_hint (non-dispatched string fields)
  if (formatHint && !isDispatched && type === 'string') {
    rejects.push({
      value: '!!!INVALID_FORMAT!!!',
      expectedCode: 'format_mismatch',
      description: `does not match format_hint: ${formatHint}`,
    });
  }

  // 6. min_items_violation — list shape + min_items + dispatched (so value reaches step 7)
  if (shape === 'list' && listRules?.min_items && isDispatched) {
    rejects.push({
      value: [],
      expectedCode: 'min_items_violation',
      description: `empty list below min_items=${listRules.min_items}`,
    });
  }

  // 7. enum_value_not_allowed — closed enum policy
  if (enumPolicy === 'closed' && enumValues?.length > 0) {
    const badVal = shape === 'list' ? ['__sf_invalid_enum__'] : '__sf_invalid_enum__';
    rejects.push({
      value: badVal,
      expectedCode: 'enum_value_not_allowed',
      description: 'invalid value for closed enum',
    });
  }

  // 8. unknown_enum_prefer_known — open_prefer_known policy
  if (enumPolicy === 'open_prefer_known' && enumValues?.length > 0) {
    const badVal = shape === 'list' ? ['__sf_unknown_enum__'] : '__sf_unknown_enum__';
    rejects.push({
      value: badVal,
      expectedCode: 'unknown_enum_prefer_known',
      description: 'unknown value for open_prefer_known enum',
    });
  }

  // 9. out_of_range — numeric with range (non-dispatched)
  if (rangeConfig && !isDispatched) {
    const hasMin = typeof rangeConfig.min === 'number' && Number.isFinite(rangeConfig.min);
    const hasMax = typeof rangeConfig.max === 'number' && Number.isFinite(rangeConfig.max);
    if (hasMin || hasMax) {
      const outVal = hasMax ? rangeConfig.max * 2 + 1 : rangeConfig.min - 1000;
      if (parse.strict_unit_required && unit) {
        rejects.push({
          value: `${outVal} ${unit}`,
          expectedCode: 'out_of_range',
          description: `${outVal} ${unit} exceeds range`,
        });
      } else {
        rejects.push({
          value: outVal,
          expectedCode: 'out_of_range',
          description: `${outVal} exceeds range [${rangeConfig.min ?? '—'}, ${rangeConfig.max ?? '—'}]`,
        });
      }
    }
  }

  // 10. not_in_component_db — component_reference + !allow_new
  if (template === 'component_reference' && componentDb?.items?.length > 0 && !allowNewComponents) {
    rejects.push({
      value: '__sf_nonexistent_component__',
      expectedCode: 'not_in_component_db',
      description: 'unknown component name',
    });
  }

  // 11. unk_blocks_publish
  if (blockPublishWhenUnk) {
    rejects.push({
      value: unknownToken,
      expectedCode: 'unk_blocks_publish',
      description: `${unknownToken} value blocks publish`,
    });
  }

  // ── REPAIRS ─────────────────────────────────────────────────────────────

  // 1. rounding — numeric fields with contract.rounding (non-dispatched)
  if (roundingConfig?.decimals != null && !isDispatched) {
    const mid = rangeConfig
      ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2
      : 50;
    const excess = mid + 0.123456789;
    const factor = Math.pow(10, roundingConfig.decimals);
    const mode = roundingConfig.mode || 'nearest';
    let expected;
    if (mode === 'floor') expected = Math.floor(excess * factor) / factor;
    else if (mode === 'ceil') expected = Math.ceil(excess * factor) / factor;
    else expected = Math.round(excess * factor) / factor;

    // WHY: strict_unit_required fields need value as string with unit suffix
    const inputValue = (parse.strict_unit_required && unit)
      ? `${excess} ${unit}`
      : excess;

    repairs.push({
      value: inputValue,
      expectedRepair: expected,
      knob: 'rounding',
      description: `rounds to ${roundingConfig.decimals} decimals (${mode})`,
    });
  }

  // 2. dedupe — list fields with list_rules.dedupe (dispatched only)
  if (shape === 'list' && listRules?.dedupe && isDispatched) {
    repairs.push({
      value: ['a', 'b', 'a'],
      expectedRepair: ['a', 'b'],
      knob: 'dedupe',
      description: 'deduplicates list items',
    });
  }

  // 3. sort_alpha — list fields with list_rules.sort = 'alpha' (dispatched only)
  if (shape === 'list' && listRules?.sort === 'alpha' && isDispatched) {
    repairs.push({
      value: ['c', 'a', 'b'],
      expectedRepair: ['a', 'b', 'c'],
      knob: 'sort_alpha',
      description: 'sorts list alphabetically',
    });
  }

  // 4. max_items — list fields with list_rules.max_items (dispatched only)
  if (shape === 'list' && listRules?.max_items && isDispatched) {
    const overSize = Array.from({ length: listRules.max_items + 5 }, (_, i) => `item-${i}`);
    const truncated = overSize.slice(0, listRules.max_items);
    repairs.push({
      value: overSize,
      expectedRepair: truncated,
      knob: 'max_items',
      description: `truncates to max_items=${listRules.max_items}`,
    });
  }

  // 5. token_map — string fields with parse.token_map (non-dispatched)
  if (tokenMap && typeof tokenMap === 'object' && !isDispatched) {
    const entries = Object.entries(tokenMap);
    if (entries.length > 0) {
      const [inputToken, canonicalValue] = entries[0];
      repairs.push({
        value: inputToken,
        expectedRepair: canonicalValue,
        knob: 'token_map',
        description: `token_map: "${inputToken}" → "${canonicalValue}"`,
      });
    }
  }

  // 6. unit_accepts — fields with alternate unit forms (non-dispatched)
  if (unitAccepts?.length > 0 && unit && !isDispatched) {
    // WHY: Find an accepted alternate form that differs from the canonical unit
    const alternate = unitAccepts.find(u => u.toLowerCase() !== unit.toLowerCase());
    if (alternate) {
      const mid = rangeConfig
        ? ((rangeConfig.min ?? 0) + (rangeConfig.max ?? 100)) / 2
        : 50;
      // WHY: Round to field's precision so rounding step doesn't change the expected value
      let numVal = mid;
      if (roundingConfig?.decimals != null) {
        const factor = Math.pow(10, roundingConfig.decimals);
        numVal = Math.round(numVal * factor) / factor;
      }
      repairs.push({
        value: `${numVal} ${alternate}`,
        expectedRepair: numVal,
        knob: 'unit_accepts',
        description: `accepts alternate unit form: "${alternate}" → strips to number`,
      });
    }
  }

  // 7. unit_conversions — fields with conversion factors (non-dispatched)
  if (unitConversions && typeof unitConversions === 'object' && unit && !isDispatched) {
    const convEntries = Object.entries(unitConversions);
    if (convEntries.length > 0) {
      const [sourceUnit, factor] = convEntries[0];
      if (typeof factor === 'number' && Number.isFinite(factor)) {
        repairs.push({
          value: `1 ${sourceUnit}`,
          expectedRepair: factor,
          knob: 'unit_conversions',
          description: `converts 1 ${sourceUnit} → ${factor} ${unit}`,
        });
      }
    }
  }

  // 8. alias_resolve — enum fields with alias match strategy
  if (matchStrategy === 'alias' && enumValues?.length > 0 && shape === 'scalar') {
    // WHY: Use mixed-case version of first known value to trigger case-insensitive alias repair
    const firstKnown = enumValues[0];
    const mixedCase = firstKnown.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
    // Only add if mixed case differs from original (otherwise exact match, no repair)
    if (mixedCase !== firstKnown) {
      repairs.push({
        value: mixedCase,
        expectedRepair: firstKnown,
        knob: 'alias_resolve',
        description: `alias resolves "${mixedCase}" → "${firstKnown}"`,
      });
    }
  }

  // 9. allow_new_components — component fields that accept unknown
  if (template === 'component_reference' && allowNewComponents && componentDb?.items?.length > 0) {
    repairs.push({
      value: '__sf_brand_new_component__',
      expectedRepair: '__sf_brand_new_component__',
      knob: 'allow_new_components',
      description: 'unknown component accepted when allow_new=true',
    });
  }

  // ── GOOD VALUE ──────────────────────────────────────────────────────────

  const good = deriveGoodValue(fieldKey, fieldRule, knownValues, componentDb);

  return { rejects, repairs, good };
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
    // WHY: Fall through to enum if compDb unavailable (e.g., switch_type has compDb under "switches" key)
    if (firstName) {
      return { value: firstName, description: `first DB item: ${firstName}` };
    }
    if (knownValues?.values?.length > 0) {
      return { value: knownValues.values[0], description: `first known: ${knownValues.values[0]}` };
    }
    return { value: 'test-component', description: 'fallback component' };
  }

  if (template === 'date_field') {
    return { value: '2024-06-15', description: 'valid date' };
  }

  if (template === 'url_field') {
    return { value: 'https://example.com/test', description: 'valid URL' };
  }

  if (type === 'number' || type === 'integer') {
    let mid = range
      ? ((range.min ?? 0) + (range.max ?? 100)) / 2
      : 50;

    // WHY: Pre-round so the good value doesn't trigger a rounding repair
    if (rounding?.decimals != null) {
      const factor = Math.pow(10, rounding.decimals);
      mid = Math.round(mid * factor) / factor;
    }

    if (strictUnit && unit) {
      return { value: `${mid} ${unit}`, description: `midpoint with unit: ${mid} ${unit}` };
    }
    return { value: mid, description: `midpoint: ${mid}` };
  }

  if (shape === 'list') {
    // WHY: For enum list fields, use known values to avoid enum rejection
    if (knownValues?.values?.length > 0) {
      const items = knownValues.values.slice(0, 2);
      return { value: items, description: `known list items: ${items.join(', ')}` };
    }
    return { value: ['test-item-1', 'test-item-2'], description: 'valid list' };
  }

  // Prefer first known enum value
  if (knownValues?.values?.length > 0) {
    return { value: knownValues.values[0], description: `first known: ${knownValues.values[0]}` };
  }

  return { value: 'test_value', description: 'default string' };
}
