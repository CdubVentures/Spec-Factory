import { normalizeFieldList } from '../utils/fieldKeys.js';
import {
  ruleRequiredLevel,
  ruleAvailability,
  ruleDifficulty,
  ruleEffort,
  ruleAiMode,
  ruleAiMaxCalls
} from '../engine/ruleAccessors.js';
import {
  toInt,
  toArray,
  normalizeFieldContractToken,
  isIdentityOrEditorialField
} from './convergenceHelpers.js';
import { normalizeSearchEngines } from '../features/indexing/search/searchProviders.js';

export function buildContractEffortPlan({
  missingRequiredFields = [],
  missingCriticalFields = [],
  categoryConfig = {}
} = {}) {
  const ruleMap = categoryConfig?.fieldRules?.fields || {};
  const fieldOrder = categoryConfig?.fieldOrder || [];
  const requiredFields = normalizeFieldList(toArray(missingRequiredFields), { fieldOrder })
    .map((field) => normalizeFieldContractToken(field))
    .filter(Boolean);
  const criticalSet = new Set(
    normalizeFieldList(toArray(missingCriticalFields), { fieldOrder })
      .map((field) => normalizeFieldContractToken(field))
      .filter(Boolean)
  );
  const dedupedRequired = [...new Set(requiredFields)];

  const fieldPlans = [];
  let totalEffort = 0;
  let hardMissingCount = 0;
  let expectedRequiredCount = 0;

  for (const field of dedupedRequired) {
    const rule = ruleMap[field] || ruleMap[`fields.${field}`] || {};
    const requiredLevel = ruleRequiredLevel(rule);
    const availability = ruleAvailability(rule);
    const difficulty = ruleDifficulty(rule);
    const effort = ruleEffort(rule);
    totalEffort += effort;

    if (difficulty === 'hard') {
      hardMissingCount += 1;
    }
    if (availability === 'expected') {
      expectedRequiredCount += 1;
    }
    if (requiredLevel === 'critical') {
      criticalSet.add(field);
    }

    fieldPlans.push({
      field,
      required_level: requiredLevel || null,
      availability: availability || null,
      difficulty: difficulty || null,
      effort,
      ai_mode: ruleAiMode(rule),
      ai_max_calls: ruleAiMaxCalls(rule)
    });
  }

  return {
    total_effort: Math.round(totalEffort),
    required_missing_count: dedupedRequired.length,
    critical_missing_count: criticalSet.size,
    hard_missing_count: hardMissingCount,
    expected_required_count: expectedRequiredCount,
    fields: fieldPlans
  };
}

export function selectRoundSearchProvider({
  baseConfig = {},
  discoveryEnabled = true,
  missingRequiredCount = 0,
  requiredSearchIteration = 0
}) {
  return resolveSearchProviderDecision({
    baseConfig,
    discoveryEnabled,
    missingRequiredCount,
    requiredSearchIteration
  }).provider;
}

export function explainSearchProviderSelection({
  baseConfig = {},
  discoveryEnabled = true,
  missingRequiredCount = 0,
  requiredSearchIteration = 0
}) {
  const decision = resolveSearchProviderDecision({
    baseConfig,
    discoveryEnabled,
    missingRequiredCount,
    requiredSearchIteration
  });
  return {
    provider: decision.provider,
    reason_code: decision.reasonCode,
    configured_provider: decision.configured,
    discovery_enabled: decision.discoveryEnabled,
    missing_required_count: decision.missingRequiredCount,
    required_search_iteration: decision.requiredSearchIteration,
    free_provider_ready: decision.hasFreeProvider,
    searxng_ready: decision.searxngReady,
    bing_ready: decision.bingReady,
    google_ready: decision.googleReady
  };
}

function resolveSearchProviderDecision({
  baseConfig = {},
  discoveryEnabled = true,
  missingRequiredCount = 0,
  requiredSearchIteration = 0
}) {
  const normalizedMissingRequired = Math.max(0, toInt(missingRequiredCount, 0));
  const normalizedRequiredIteration = Math.max(0, toInt(requiredSearchIteration, 0));

  const configured = normalizeSearchEngines(baseConfig.searchEngines ?? baseConfig.searchProvider);
  const searxngReady = Boolean(baseConfig.searxngBaseUrl);
  const engineList = configured ? configured.split(',') : [];
  const baseDecision = {
    configured,
    discoveryEnabled,
    missingRequiredCount: normalizedMissingRequired,
    requiredSearchIteration: normalizedRequiredIteration,
    bingReady: searxngReady && engineList.includes('bing'),
    // WHY: Google goes through Crawlee, not SearXNG — ready if configured.
    googleReady: engineList.includes('google'),
    searxngReady,
    hasFreeProvider: searxngReady
  };

  if (!discoveryEnabled) {
    return {
      ...baseDecision,
      provider: '',
      reasonCode: 'discovery_disabled',
      discoveryEnabled: false,
      bingReady: false,
      googleReady: false,
      hasFreeProvider: false
    };
  }

  if (!configured) {
    return {
      ...baseDecision,
      provider: '',
      reasonCode: 'no_engines_configured'
    };
  }
  if (searxngReady) {
    return {
      ...baseDecision,
      provider: configured,
      reasonCode: 'engines_ready'
    };
  }
  return {
    ...baseDecision,
    provider: '',
    reasonCode: 'engines_no_searxng_ready'
  };
}

export function evaluateRequiredSearchExhaustion({
  round = 0,
  missingRequiredCount = 0,
  noNewUrlsRounds = 0,
  noNewFieldsRounds = 0,
  threshold = 2
} = {}) {
  if (missingRequiredCount <= 0) {
    return { stop: false, reason: 'continue' };
  }
  const cap = Math.max(1, Number(threshold || 2));
  if (round >= cap && noNewUrlsRounds >= cap && noNewFieldsRounds >= cap) {
    return {
      stop: true,
      reason: 'required_search_exhausted_no_new_urls_or_fields'
    };
  }
  return { stop: false, reason: 'continue' };
}

export function shouldForceExpectedFieldRetry({
  summary = {},
  categoryConfig = {},
  fieldAvailabilityArtifact = {},
  overrideCount = 0
} = {}) {
  if (overrideCount > 0) {
    return {
      force: false,
      fields: [],
      reason: 'already_forced_once'
    };
  }

  for (const row of Object.values(summary.field_reasoning || {})) {
    const reason = String(row?.unknown_reason || '').trim().toLowerCase();
    if (!reason) {
      continue;
    }
    if (reason.includes('budget') || reason.includes('identity') || reason.includes('blocked')) {
      return {
        force: false,
        fields: [],
        reason: 'blocked_or_budget_or_identity'
      };
    }
  }

  const missingRequired = normalizeFieldList(
    toArray(summary.missing_required_fields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  if (!missingRequired.length) {
    return {
      force: false,
      fields: [],
      reason: 'no_missing_required'
    };
  }

  const expectedFields = [];
  for (const field of missingRequired) {
    const unknownReason = String(summary.field_reasoning?.[field]?.unknown_reason || '').trim().toLowerCase();
    const classification = String(fieldAvailabilityArtifact?.fields?.[field]?.classification || '').trim().toLowerCase();
    if (unknownReason === 'not_found_after_search' && classification === 'expected') {
      expectedFields.push(field);
    }
  }
  if (!expectedFields.length) {
    return {
      force: false,
      fields: [],
      reason: 'no_expected_required_not_found'
    };
  }

  return {
    force: true,
    fields: expectedFields,
    reason: 'expected_required_not_found'
  };
}

export function buildRoundConfig(baseConfig, {
  round,
  availabilityEffort = {},
  contractEffort = {},
  missingRequiredCount,
  missingExpectedCount,
  missingCriticalCount,
  previousValidated,
  requiredSearchIteration
} = {}) {
  const expectedCount = toInt(availabilityEffort.expected_count, 0);
  const sometimesCount = toInt(availabilityEffort.sometimes_count, 0);
  const rareCount = toInt(availabilityEffort.rare_count, 0);
  const resolvedMissingRequired = toInt(missingRequiredCount, toInt(availabilityEffort.required_count, 0));
  const resolvedMissingExpected = toInt(missingExpectedCount, expectedCount);
  const resolvedMissingCritical = toInt(missingCriticalCount, 0);
  const resolvedPreviousValidated = previousValidated === undefined ? null : Boolean(previousValidated);
  const requiredIteration = toInt(requiredSearchIteration, 0);
  const hasExplicitMissingCounts =
    missingRequiredCount !== undefined ||
    missingExpectedCount !== undefined;
  // WHY: Pipeline settings are the single source of truth. No round-mode
  // overrides — the user's configured values pass through unchanged.
  // The dynamic discovery toggle (below) and effort-based boosts are the
  // only round-aware adjustments that remain.
  const next = {
    ...baseConfig,
    llmMaxCallsPerRound: Math.max(1, baseConfig.llmMaxCallsPerRound || 4),
    maxUrlsPerProduct: baseConfig.maxUrlsPerProduct || 20,
    maxCandidateUrls: baseConfig.maxCandidateUrls || 50,
  };

  if (round > 0) {
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, Math.max(120, 25));
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, Math.max(180, toInt(baseConfig.maxCandidateUrls, 50) + 40));
    next.maxPagesPerDomain = Math.max(next.maxPagesPerDomain || 0, Math.max(3, 6));
  }

  if (expectedCount > 0) {
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, 90 + Math.min(140, expectedCount * 12));
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, 130 + Math.min(200, expectedCount * 16));
  } else if (rareCount > 0 && sometimesCount === 0) {
    next.maxUrlsPerProduct = Math.min(next.maxUrlsPerProduct || 60, 70);
    next.maxCandidateUrls = Math.min(next.maxCandidateUrls || 90, 90);
  }

  const contractTotalEffort = Math.max(0, toInt(contractEffort.total_effort, 0));
  const hardMissingCount = Math.max(0, toInt(contractEffort.hard_missing_count, 0));
  const contractCriticalMissingCount = Math.max(0, toInt(contractEffort.critical_missing_count, 0));
  const expectedRequiredCount = Math.max(0, toInt(contractEffort.expected_required_count, 0));
  if (round > 0 && contractTotalEffort > 0) {
    const effortTier = Math.min(4, Math.floor(contractTotalEffort / 8));
    const urlBoost = (effortTier * 20) + (hardMissingCount * 14) + (contractCriticalMissingCount * 10);
    const candidateBoost = (effortTier * 30) + (hardMissingCount * 18) + (contractCriticalMissingCount * 12);
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, (next.maxUrlsPerProduct || 0) + urlBoost);
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, (next.maxCandidateUrls || 0) + candidateBoost);
  }

  {
    let discoveryEnabled = Boolean(next.discoveryEnabled);

    if (hasExplicitMissingCounts) {
      const shouldContinue =
        resolvedMissingCritical > 0 ||
        resolvedPreviousValidated === false;
      if (resolvedMissingRequired === 0 && resolvedMissingExpected === 0 && !shouldContinue) {
        discoveryEnabled = false;
      } else if (
        resolvedMissingRequired > 0 &&
        Boolean(baseConfig.discoveryInternalFirst) &&
        requiredIteration > 0 &&
        requiredIteration <= 1
      ) {
        discoveryEnabled = false;
      } else {
        discoveryEnabled = true;
      }
    }

    next.discoveryEnabled = discoveryEnabled;
    const searchProviderSelection = explainSearchProviderSelection({
      baseConfig,
      discoveryEnabled,
      missingRequiredCount: resolvedMissingRequired,
      requiredSearchIteration: requiredIteration
    });
    next.searchEngines = searchProviderSelection.provider;
    next.searchProviderSelection = searchProviderSelection;
    if (!discoveryEnabled) {
      next.searchEngines = '';
      next.searchProviderSelection = {
        ...searchProviderSelection,
        provider: '',
        reason_code: 'discovery_disabled'
      };
    }
  }

  const keepRoundOpen =
    resolvedMissingCritical > 0 ||
    resolvedPreviousValidated === false;
  if (hasExplicitMissingCounts && round > 0 && resolvedMissingRequired === 0 && resolvedMissingExpected === 0 && !keepRoundOpen) {
    next.maxUrlsPerProduct = Math.min(next.maxUrlsPerProduct || 60, 48);
    next.maxCandidateUrls = Math.min(next.maxCandidateUrls || 90, 48);
  }

  {
    const roundCallFloor = 16;
    const totalCallFloor = Math.max(roundCallFloor, 48);
    if (round > 0) {
      next.llmMaxCallsPerRound = Math.max(next.llmMaxCallsPerRound || 0, roundCallFloor);
    }
    next.llmMaxCallsPerProductTotal = Math.max(next.llmMaxCallsPerProductTotal || 0, totalCallFloor);
  }

  return next;
}

export function makeLlmTargetFields({
  previousSummary,
  categoryConfig,
  fallbackRequiredFields = [],
  config = {}
}) {
  const requiredFallback = normalizeFieldList(
    toArray(fallbackRequiredFields).length > 0
      ? toArray(fallbackRequiredFields)
      : toArray(categoryConfig.requiredFields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const criticalBase = normalizeFieldList(
    toArray(categoryConfig.schema?.critical_fields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const targetCap = Math.max(
    requiredFallback.length || 1,
    Math.min(
      Math.max(1, 110),
      Math.max(1, toArray(categoryConfig.fieldOrder).length || 75)
    )
  );
  const allNonIdentityFields = normalizeFieldList(toArray(categoryConfig.fieldOrder), {
    fieldOrder: categoryConfig.fieldOrder || []
  }).filter((field) => !isIdentityOrEditorialField(field, categoryConfig));

  if (!previousSummary) {
    const base = [
      ...new Set([
        ...requiredFallback,
        ...criticalBase
      ])
    ];
    return [...new Set([...base, ...allNonIdentityFields])].slice(0, targetCap);
  }

  const missing = normalizeFieldList(
    toArray(previousSummary.missing_required_fields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const critical = normalizeFieldList(
    toArray(previousSummary.critical_fields_below_pass_target),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const belowPassTarget = normalizeFieldList(
    toArray(previousSummary.fields_below_pass_target),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const contradictions = toArray(previousSummary.constraint_analysis?.top_uncertain_fields || [])
    .map((item) => item.field)
    .filter(Boolean);
  const combined = normalizeFieldList(
    [...new Set([...missing, ...critical, ...contradictions])],
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  if (combined.length > 0) {
    return [...new Set([
      ...combined,
      ...requiredFallback,
      ...belowPassTarget,
      ...allNonIdentityFields
    ])].slice(0, targetCap);
  }
  return [...new Set([
    ...requiredFallback,
    ...criticalBase,
    ...belowPassTarget,
    ...allNonIdentityFields
  ])].slice(0, targetCap);
}

export function resolveMissingRequiredForPlanning({
  previousSummary = null,
  categoryConfig = {}
} = {}) {
  const previousMissing = normalizeFieldList(
    toArray(previousSummary?.missing_required_fields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  if (previousMissing.length > 0) {
    return previousMissing;
  }
  const requiredDefaults = normalizeFieldList(
    toArray(categoryConfig.requiredFields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  if (!previousSummary) {
    return requiredDefaults;
  }
  if (Boolean(previousSummary.validated)) {
    return previousMissing;
  }
  // Always take the aggressive path — return requiredDefaults
  return requiredDefaults;
}

export function buildRoundRequirements(job, focus_fields, previousSummary, fallbackRequiredFields = []) {
  const requirements = {
    ...(job.requirements || {})
  };
  requirements.focus_fields = focus_fields;
  const previousMissing = toArray(previousSummary?.missing_required_fields);
  const requiredSeed = previousMissing.length > 0
    ? previousMissing
    : toArray(fallbackRequiredFields);
  requirements.requiredFields = [
    ...new Set([
      ...toArray(job.requirements?.requiredFields),
      ...requiredSeed
    ])
  ];
  return {
    ...job,
    requirements
  };
}
