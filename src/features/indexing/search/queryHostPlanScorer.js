import { clean, toArray } from './queryIdentityNormalizer.js';
import { compileQuery, compileQueryBatch } from '../discovery/queryCompiler.js';

const INTENT_TO_FILETYPE = {
  datasheet: 'pdf',
  manual: 'pdf',
  // WHY: spec/specification removed — spec pages are HTML product pages, not PDFs.
  // Only manuals and datasheets are actually served as PDF documents.
  firmware: 'zip',
};

const V2_SCORING_WEIGHTS = Object.freeze({
  base_score: 12,
  needset_coverage: 3.5,
  field_affinity: 2.5,
  diversity: 1.5,
  host_health: 1.5,
  operator_risk: 1.0,
});

const TIER_BONUS_BY_NUMERIC = Object.freeze({
  1: 1.5,
  2: 1.0,
  3: 0.5,
  4: 0.2,
  5: 0.1,
});

/**
 * Build logical query plans from an EffectiveHostPlan.
 * Each searchable host gets a logical plan shaped for QueryCompiler input.
 */
export function buildLogicalPlansFromHostPlan(effectiveHostPlan, identity, focusFields, { resolvedTerms } = {}) {
  if (!effectiveHostPlan || effectiveHostPlan.blocked) return [];

  const searchableGroups = (effectiveHostPlan.host_groups || []).filter(g => g.searchable);
  const product = clean(`${identity?.brand || ''} ${identity?.model || ''}`);
  if (!product.trim()) return [];

  const caps = effectiveHostPlan.provider_caps || {};
  const supportsSite = caps.supports_site || false;
  const supportsFiletype = caps.supports_filetype || false;

  const intents = effectiveHostPlan.content_intents || [];
  const docHint = intents.length > 0 ? intents[0] : '';
  const filetype = supportsFiletype && intents.length > 0
    ? (INTENT_TO_FILETYPE[intents[0]] || null)
    : null;

  // WHY: resolvedTerms come from field rule query_terms (human-readable).
  // focusFields are raw field keys used for coverage scoring only.
  const cleanTerms = (toArray(resolvedTerms).filter(Boolean).length > 0
    ? toArray(resolvedTerms)
    : toArray(focusFields).map(f => clean(f)).filter(Boolean)
  ).slice(0, 3);

  const manufacturerHosts = new Set(effectiveHostPlan.manufacturer_hosts || []);
  const plans = [];
  for (const group of searchableGroups) {
    const isManufacturer = manufacturerHosts.has(group.host);
    plans.push({
      product,
      terms: cleanTerms,
      // WHY: search-first mode — soft host bias via doc_hint, no hard site: operator
      site_target: null,
      filetype: isManufacturer ? filetype : null,
      doc_hint: isManufacturer ? docHint : group.host,
      exact_phrases: [],
      exclude_terms: [],
      time_pref: null,
      hard_site: false,
      host_pref: group.host,
    });
  }
  return plans;
}

/**
 * Compile logical plans through QueryCompiler.
 */
export function compileLogicalPlans(logicalPlans, providerName) {
  return compileQueryBatch(logicalPlans, providerName);
}

function toFieldCoverageSets(policy = {}) {
  const coverage = policy?.field_coverage || {};
  return {
    high: new Set(toArray(coverage?.high).map((value) => String(value || '').trim()).filter(Boolean)),
    medium: new Set(toArray(coverage?.medium).map((value) => String(value || '').trim()).filter(Boolean)),
    low: new Set(toArray(coverage?.low).map((value) => String(value || '').trim()).filter(Boolean)),
  };
}

function computeCoverageSignals(policy = {}, focusFields = []) {
  const fields = toArray(focusFields).map((value) => String(value || '').trim()).filter(Boolean);
  if (fields.length === 0) {
    return { needsetCoverage: 0, fieldAffinity: 0 };
  }
  const coverage = toFieldCoverageSets(policy);
  let covered = 0;
  let affinityPoints = 0;
  for (const field of fields) {
    if (coverage.high.has(field)) {
      covered += 1;
      affinityPoints += 1.0;
      continue;
    }
    if (coverage.medium.has(field)) {
      covered += 1;
      affinityPoints += 0.6;
      continue;
    }
    if (coverage.low.has(field)) {
      covered += 1;
      affinityPoints += 0.3;
    }
  }
  return {
    needsetCoverage: covered / fields.length,
    fieldAffinity: affinityPoints / fields.length,
  };
}

function computeDiversityPenalty(hostGroup = {}, searchableGroups = []) {
  const groups = toArray(searchableGroups);
  if (groups.length <= 1) return 0;
  const sameTierCount = groups.filter((group) => String(group?.tier || '') === String(hostGroup?.tier || '')).length;
  if (sameTierCount <= 1) return 0;
  return -V2_SCORING_WEIGHTS.diversity * ((sameTierCount - 1) / Math.max(1, groups.length - 1));
}

function computeHostHealthPenalty(hostGroup = {}, policy = {}) {
  if (String(hostGroup?.health_action || '') === 'excluded') {
    return -V2_SCORING_WEIGHTS.host_health;
  }
  if (String(hostGroup?.health_action || '') === 'downranked') {
    return -(V2_SCORING_WEIGHTS.host_health * 0.75);
  }
  const successRate = Number(policy?.health?.success_rate_7d);
  const blockRate = Number(policy?.health?.block_rate_7d);
  if (Number.isFinite(successRate) && successRate < 0.5) {
    return -(V2_SCORING_WEIGHTS.host_health * 0.5);
  }
  if (Number.isFinite(blockRate) && blockRate > 0.3) {
    return -(V2_SCORING_WEIGHTS.host_health * 0.5);
  }
  return 0;
}

function computeOperatorRiskPenalty(compiled = {}) {
  const warnings = toArray(compiled?.warnings).map((value) => String(value || '').trim());
  if (warnings.some((warning) => warning.startsWith('provider_none'))) {
    return -V2_SCORING_WEIGHTS.operator_risk;
  }
  const unsupportedCount = warnings.filter((warning) => warning.includes('unsupported')).length;
  if (unsupportedCount === 0) return 0;
  return -Math.min(V2_SCORING_WEIGHTS.operator_risk, unsupportedCount * 0.5);
}

function buildFallbackQueryText(logicalPlan = {}) {
  return clean([
    logicalPlan.product,
    ...toArray(logicalPlan.terms),
    logicalPlan.doc_hint,
    logicalPlan.host_pref,
    logicalPlan.filetype,
  ].filter(Boolean).join(' '));
}

function sumScoreBreakdown(scoreBreakdown = {}) {
  return [
    'base_score',
    'frontier_penalty',
    'identity_bonus',
    'variant_guard_penalty',
    'multi_model_penalty',
    'tier_bonus',
    'host_health_penalty',
    'operator_risk_penalty',
    'field_affinity_bonus',
    'diversity_penalty',
    'needset_coverage_bonus',
  ].reduce((total, key) => total + Number(scoreBreakdown?.[key] || 0), 0);
}

export function buildScoredQueryRowsFromHostPlan(effectiveHostPlan, identity, focusFields, { resolvedTerms } = {}) {
  if (!effectiveHostPlan || effectiveHostPlan.blocked) return [];

  const logicalPlans = buildLogicalPlansFromHostPlan(effectiveHostPlan, identity, focusFields, { resolvedTerms });
  const searchableGroups = toArray(effectiveHostPlan.host_groups).filter((group) => group?.searchable);
  const providerName = String(effectiveHostPlan?.provider_caps?.name || 'none').trim() || 'none';
  const deduped = new Map();

  for (const logicalPlan of logicalPlans) {
    const host = String(logicalPlan?.host_pref || logicalPlan?.site_target || '').trim().toLowerCase();
    const hostGroup = searchableGroups.find((group) => String(group?.host || '').trim().toLowerCase() === host) || null;
    const policy = effectiveHostPlan?.policy_map?.[host] || null;
    const compiled = compileQuery(logicalPlan, providerName);
    const compiledQuery = String(compiled?.query || '').trim();
    const query = compiledQuery || buildFallbackQueryText(logicalPlan);
    if (!query) {
      continue;
    }

    const { needsetCoverage, fieldAffinity } = computeCoverageSignals(policy, focusFields);
    const score_breakdown = {
      base_score: V2_SCORING_WEIGHTS.base_score,
      frontier_penalty: 0,
      identity_bonus: 0,
      variant_guard_penalty: 0,
      multi_model_penalty: 0,
      tier_bonus: Number(TIER_BONUS_BY_NUMERIC[Number(policy?.tier_numeric || 99)] || 0),
      host_health_penalty: Number(computeHostHealthPenalty(hostGroup, policy).toFixed(3)),
      operator_risk_penalty: Number(computeOperatorRiskPenalty(compiled).toFixed(3)),
      field_affinity_bonus: Number((fieldAffinity * V2_SCORING_WEIGHTS.field_affinity).toFixed(3)),
      diversity_penalty: Number(computeDiversityPenalty(hostGroup, searchableGroups).toFixed(3)),
      needset_coverage_bonus: Number((needsetCoverage * V2_SCORING_WEIGHTS.needset_coverage).toFixed(3)),
      tier_source: policy ? 'host_policy' : 'legacy',
    };
    const score = Number(sumScoreBreakdown(score_breakdown).toFixed(3));
    const row = {
      query,
      sources: ['v2.host_plan'],
      hint_source: 'v2.host_plan',
      target_fields: toArray(focusFields).map((value) => String(value || '').trim()).filter(Boolean),
      doc_hint: String(logicalPlan?.doc_hint || '').trim(),
      domain_hint: String(logicalPlan?.site_target || host || '').trim(),
      source_host: host,
      providers: providerName === 'none' ? [] : [providerName],
      warnings: toArray(compiled?.warnings),
      score,
      score_breakdown,
      provider_compiled: compiledQuery.length > 0,
      host_plan_origin: String(hostGroup?.origin || '').trim(),
      host_plan_tier: String(hostGroup?.tier || policy?.tier || '').trim(),
    };

    const dedupeKey = query.toLowerCase();
    const existing = deduped.get(dedupeKey);
    if (!existing || score > existing.score) {
      deduped.set(dedupeKey, row);
      continue;
    }
    existing.target_fields = [...new Set([...toArray(existing.target_fields), ...toArray(row.target_fields)])];
    existing.warnings = [...new Set([...toArray(existing.warnings), ...toArray(row.warnings)])];
    if (!existing.source_host && row.source_host) existing.source_host = row.source_host;
    if (!existing.domain_hint && row.domain_hint) existing.domain_hint = row.domain_hint;
  }

  return [...deduped.values()]
    .sort((left, right) => right.score - left.score || left.query.localeCompare(right.query));
}
