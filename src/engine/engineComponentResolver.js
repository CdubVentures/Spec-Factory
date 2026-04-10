import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey
} from './engineTextHelpers.js';
import {
  ruleType as parseRuleType,
  ruleUnit as parseRuleUnit
} from './ruleAccessors.js';
import { parseNumberAndUnit, convertUnit, canonicalUnitToken } from './normalizationFunctions.js';

export function simpleSimilarity(left, right) {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (long.includes(short)) {
    return short.length / long.length;
  }
  let matches = 0;
  const set = new Set(short.split(''));
  for (const ch of long) {
    if (set.has(ch)) {
      matches += 1;
    }
  }
  return matches / Math.max(short.length, long.length);
}

/**
 * Resolves a component_ref type field value.
 *
 * Returns:
 *   { ok: false, reason_code, raw_input, attempted_normalizations } — on failure (caller returns this)
 *   { ok: true, value } — on success (caller sets value to result.value)
 *
 * Mutates `attempts` array and `context` arrays (identityObservations, componentReviewQueue, curationQueue).
 */
export function resolveComponentRef(value, {
  rule, fieldKey, rawCandidate,
  lookupComponent,
  fuzzyMatchComponent,
  rules,
  context,
  attempts
}) {
  const dbName = normalizeText(rule?.component_db_ref || rule?.component?.type);
  if (!dbName) {
    return {
      ok: false,
      reason_code: 'component_db_missing',
      raw_input: rawCandidate,
      attempted_normalizations: attempts
    };
  }
  const query = normalizeText(Array.isArray(value) ? value[0] : value);
  const exact = lookupComponent(dbName, query);
  if (exact) {
    attempts.push('component:exact_or_alias');
    if (Array.isArray(context?.identityObservations)) {
      context.identityObservations.push({
        component_type: dbName,
        canonical_name: exact.canonical_name,
        raw_query: query,
        match_type: 'exact_or_alias',
        score: 1.0,
        field_key: fieldKey,
      });
    }
    return { ok: true, value: exact.canonical_name };
  }

  // Property-aware tiered scoring for component resolution
  const componentRule = isObject(rule?.component) ? rule.component : {};
  const matchConfig = isObject(componentRule.match) ? componentRule.match : {};
  const nameWeight = Number.isFinite(Number(matchConfig.name_weight)) ? Number(matchConfig.name_weight) : 0.4;
  const propWeight = Number.isFinite(Number(matchConfig.property_weight)) ? Number(matchConfig.property_weight) : 0.6;
  const propKeys = toArray(matchConfig.property_keys);
  const autoAcceptScore = Number.isFinite(Number(matchConfig.auto_accept_score)) ? Number(matchConfig.auto_accept_score) : 0.95;
  const flagReviewScore = Number.isFinite(Number(matchConfig.flag_review_score)) ? Number(matchConfig.flag_review_score) : 0.65;

  const rawThreshold = Number(matchConfig.fuzzy_threshold);
  const componentThreshold = Number.isFinite(rawThreshold)
    ? Math.max(0, Math.min(1, rawThreshold))
    : 0.75;
  const fuzzy = fuzzyMatchComponent(dbName, query, componentThreshold);

  const nameScore = fuzzy.score || 0;

  // Property similarity
  let propScore = 0;
  if (propKeys.length > 0 && fuzzy.match && isObject(fuzzy.match.properties)) {
    const extractedValues = isObject(context?.extractedValues) ? context.extractedValues : {};
    const variancePolicies = isObject(fuzzy.match.__variance_policies) ? fuzzy.match.__variance_policies : {};
    let totalWeight = 0;
    let matchWeight = 0;
    for (const pk of propKeys) {
      const extracted = extractedValues[pk];
      const known = fuzzy.match.properties[pk];
      if (extracted === undefined || extracted === null || known === undefined || known === null) {
        continue;
      }
      totalWeight += 1;
      const pkRule = rules[normalizeFieldKey(pk)];
      const pkType = pkRule ? parseRuleType(pkRule) : null;
      const pkUnit = pkRule ? parseRuleUnit(pkRule) : '';
      const variance = variancePolicies[pk] || 'authoritative';

      if (pkType === 'number' || pkType === 'integer') {
        const parsedExtracted = parseNumberAndUnit(extracted);
        const parsedKnown = parseNumberAndUnit(known);
        if (parsedExtracted.value === null || parsedKnown.value === null) {
          if (normalizeToken(extracted) === normalizeToken(known)) matchWeight += 1;
          continue;
        }
        let numExtracted = parsedExtracted.value;
        let numKnown = parsedKnown.value;
        const fromUnitExtracted = canonicalUnitToken(parsedExtracted.unit);
        const fromUnitKnown = canonicalUnitToken(parsedKnown.unit);
        if (pkUnit) {
          if (fromUnitExtracted && fromUnitExtracted !== pkUnit) {
            numExtracted = convertUnit(numExtracted, fromUnitExtracted, pkUnit);
          }
          if (fromUnitKnown && fromUnitKnown !== pkUnit) {
            numKnown = convertUnit(numKnown, fromUnitKnown, pkUnit);
          }
        }
        if (pkType === 'integer') {
          numExtracted = Math.round(numExtracted);
          numKnown = Math.round(numKnown);
        }

        if (variance === 'upper_bound') {
          if (numExtracted <= numKnown) { matchWeight += 1; }
          else {
            const ratio = numKnown / Math.max(numExtracted, 1);
            matchWeight += Math.max(0, ratio);
          }
        } else if (variance === 'lower_bound') {
          if (numExtracted >= numKnown) { matchWeight += 1; }
          else {
            const ratio = numExtracted / Math.max(numKnown, 1);
            matchWeight += Math.max(0, ratio);
          }
        } else if (variance === 'range') {
          const tolerance = Math.abs(numKnown) * 0.1;
          if (Math.abs(numExtracted - numKnown) <= tolerance) { matchWeight += 1; }
          else {
            const diff = Math.abs(numExtracted - numKnown);
            matchWeight += Math.max(0, 1 - (diff / Math.max(Math.abs(numKnown), 1)));
          }
        } else {
          if (numExtracted === numKnown) { matchWeight += 1; }
          else {
            const diff = Math.abs(numExtracted - numKnown);
            const base = Math.max(Math.abs(numKnown), 1);
            matchWeight += diff / base <= 0.05 ? 0.9 : Math.max(0, 1 - (diff / base));
          }
        }
      } else {
        if (normalizeToken(extracted) === normalizeToken(known)) {
          matchWeight += 1;
        }
      }
    }
    propScore = totalWeight > 0 ? matchWeight / totalWeight : 0;
  }

  const combinedScore = propKeys.length > 0
    ? (nameScore * nameWeight) + (propScore * propWeight)
    : nameScore;

  if (fuzzy.match && combinedScore >= autoAcceptScore) {
    attempts.push(`component:auto_accept:${combinedScore.toFixed(2)}`);
    if (Array.isArray(context?.identityObservations)) {
      context.identityObservations.push({
        component_type: dbName,
        canonical_name: fuzzy.match.canonical_name,
        raw_query: query,
        match_type: 'fuzzy_auto_accepted',
        score: combinedScore,
        field_key: fieldKey,
      });
    }
    return { ok: true, value: fuzzy.match.canonical_name };
  }

  if (fuzzy.match && combinedScore >= flagReviewScore) {
    attempts.push(`component:flagged_review:${combinedScore.toFixed(2)}`);
    const aiConfig = isObject(componentRule.ai) ? componentRule.ai : {};
    if (Array.isArray(context?.componentReviewQueue)) {
      const productAttrs = {};
      const ev = isObject(context?.extractedValues) ? context.extractedValues : {};
      const keysToCollect = propKeys.length > 0 ? propKeys : Object.keys(ev);
      for (const pk of keysToCollect) {
        if (ev[pk] !== undefined && ev[pk] !== null) productAttrs[pk] = ev[pk];
      }
      context.componentReviewQueue.push({
        field_key: fieldKey,
        raw_query: query,
        matched_component: fuzzy.match.canonical_name,
        name_score: nameScore,
        property_score: propScore,
        combined_score: combinedScore,
        match_type: 'fuzzy_flagged',
        component_type: dbName,
        alternatives: (fuzzy.alternatives || []).slice(0, 5),
        reasoning_note: aiConfig.reasoning_note || '',
        product_attributes: productAttrs,
      });
    }
    return { ok: true, value: fuzzy.match.canonical_name };
  }

  if (componentRule.allow_new_components === true) {
    const newValue = normalizeText(Array.isArray(value) ? value[0] : value);
    attempts.push('component:new_suggestion_flagged');
    const aiConfigNew = isObject(componentRule.ai) ? componentRule.ai : {};
    if (Array.isArray(context?.componentReviewQueue)) {
      const productAttrs = {};
      const ev = isObject(context?.extractedValues) ? context.extractedValues : {};
      const keysToCollect = propKeys.length > 0 ? propKeys : Object.keys(ev);
      for (const pk of keysToCollect) {
        if (ev[pk] !== undefined && ev[pk] !== null) productAttrs[pk] = ev[pk];
      }
      context.componentReviewQueue.push({
        field_key: fieldKey,
        raw_query: query,
        matched_component: null,
        name_score: nameScore,
        property_score: 0,
        combined_score: combinedScore,
        match_type: 'new_component',
        component_type: dbName,
        alternatives: (fuzzy.alternatives || []).slice(0, 5),
        reasoning_note: aiConfigNew.reasoning_note || '',
        product_attributes: productAttrs,
      });
    }
    if (Array.isArray(context?.curationQueue)) {
      context.curationQueue.push({
        field_key: fieldKey,
        raw_value: rawCandidate,
        normalized_value: newValue,
        suggestion_type: 'new_component',
        component_type: dbName
      });
    }
    return { ok: true, value: newValue };
  }

  return {
    ok: false,
    reason_code: 'component_not_found',
    raw_input: rawCandidate,
    attempted_normalizations: attempts
  };
}
