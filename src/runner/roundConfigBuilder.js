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

  if (!discoveryEnabled) {
    return {
      provider: 'none',
      reasonCode: 'discovery_disabled',
      configured: String(baseConfig.searchProvider || 'none').trim().toLowerCase(),
      discoveryEnabled: false,
      missingRequiredCount: normalizedMissingRequired,
      requiredSearchIteration: normalizedRequiredIteration,
      bingReady: false,
      googleReady: false,
      searxngReady: false,
      hasFreeProvider: false
    };
  }

  const configured = String(baseConfig.searchProvider || 'none').trim().toLowerCase();
  const searxngReady = Boolean(baseConfig.searxngBaseUrl);
  const hasFreeProvider = searxngReady;
  const bingReady = hasFreeProvider;
  const googleReady = hasFreeProvider;
  const baseDecision = {
    configured,
    discoveryEnabled: true,
    missingRequiredCount: normalizedMissingRequired,
    requiredSearchIteration: normalizedRequiredIteration,
    bingReady,
    googleReady,
    searxngReady,
    hasFreeProvider
  };

  if (configured === 'bing') {
    if (searxngReady) {
      return {
        ...baseDecision,
        provider: 'bing',
        reasonCode: 'configured_bing_ready'
      };
    }
    return {
      ...baseDecision,
      provider: 'none',
      reasonCode: 'configured_bing_no_provider_ready'
    };
  }
  if (configured === 'google') {
    if (searxngReady) {
      return {
        ...baseDecision,
        provider: 'google',
        reasonCode: 'configured_google_ready'
      };
    }
    return {
      ...baseDecision,
      provider: 'none',
      reasonCode: 'configured_google_no_provider_ready'
    };
  }
  if (configured === 'dual') {
    if (hasFreeProvider) {
      return {
        ...baseDecision,
        provider: 'dual',
        reasonCode: 'configured_dual_public_engines'
      };
    }
    return {
      ...baseDecision,
      provider: 'none',
      reasonCode: 'configured_dual_no_provider_ready'
    };
  }
  if (configured === 'searxng') {
    if (searxngReady) {
      return {
        ...baseDecision,
        provider: 'searxng',
        reasonCode: 'configured_searxng_ready'
      };
    }
    return {
      ...baseDecision,
      provider: 'none',
      reasonCode: 'configured_searxng_no_provider_ready'
    };
  }
  if (normalizedMissingRequired > 0) {
    if (searxngReady) {
      return {
        ...baseDecision,
        provider: 'searxng',
        reasonCode: 'auto_free_searxng_for_missing_required'
      };
    }
  } else if (searxngReady) {
    return {
      ...baseDecision,
      provider: 'searxng',
      reasonCode: 'auto_free_searxng_no_required_gap'
    };
  }
  return {
    ...baseDecision,
    provider: 'none',
    reasonCode: 'no_provider_ready'
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
  const thoroughFromRound = 2;
  const isFastRound = round === 0;
  const isThoroughRound = round >= thoroughFromRound;
  const round1UrlCap = 90;
  const round1CandidateCap = 120;
  const isRound1 = round === 1;
  const next = {
    ...baseConfig,
    runProfile: 'standard',
    discoveryEnabled: round > 0,
    fetchCandidateSources: round > 0,
    searchProvider: round === 0 ? 'none' : baseConfig.searchProvider,
    llmMaxCallsPerRound:
      round === 0
        ? Math.max(1, baseConfig.llmMaxCallsPerRound || 4)
        : Math.max(1, baseConfig.llmMaxCallsPerRound || 4),
    maxUrlsPerProduct:
      round === 0
        ? Math.min(baseConfig.maxUrlsPerProduct || 20, 24)
        : (
          round >= 2
            ? Math.max(baseConfig.maxUrlsPerProduct || 20, 220)
            : (isRound1
              ? Math.min(Math.max(baseConfig.maxUrlsPerProduct || 20, 60), round1UrlCap)
              : Math.max(baseConfig.maxUrlsPerProduct || 20, 60))
        ),
    maxCandidateUrls:
      round === 0
        ? Math.min(baseConfig.maxCandidateUrls || 50, 40)
        : (
          round >= 2
            ? Math.max(baseConfig.maxCandidateUrls || 50, 300)
            : (isRound1
              ? Math.min(Math.max(baseConfig.maxCandidateUrls || 50, 90), round1CandidateCap)
              : Math.max(baseConfig.maxCandidateUrls || 50, 90))
        )
  };

  // Inline round-specific profile effects (previously via applyRunProfile)
  if (isFastRound) {
    next.preferHttpFetcher = true;
    next.autoScrollEnabled = false;
    next.autoScrollPasses = 0;
    next.postLoadWaitMs = Math.min(next.postLoadWaitMs || 0, 0);
    next.pageGotoTimeoutMs = Math.min(next.pageGotoTimeoutMs || 12000, 12000);
    next.pageNetworkIdleTimeoutMs = Math.min(next.pageNetworkIdleTimeoutMs || 1500, 1500);
    next.endpointSignalLimit = Math.min(next.endpointSignalLimit || 24, 24);
    next.endpointSuggestionLimit = Math.min(next.endpointSuggestionLimit || 8, 8);
    next.endpointNetworkScanLimit = Math.min(next.endpointNetworkScanLimit || 400, 400);
    next.hypothesisAutoFollowupRounds = 0;
    next.hypothesisFollowupUrlsPerRound = Math.min(next.hypothesisFollowupUrlsPerRound || 8, 8);
    next.maxRunSeconds = Math.min(next.maxRunSeconds || 180, 180);
    next.maxUrlsPerProduct = Math.min(next.maxUrlsPerProduct || 12, 12);
    next.maxCandidateUrls = Math.min(next.maxCandidateUrls || 20, 20);
    next.maxPagesPerDomain = Math.min(next.maxPagesPerDomain || 2, 2);
    next.discoveryMaxQueries = Math.min(next.discoveryMaxQueries || 4, 4);
    next.discoveryResultsPerQuery = Math.min(next.discoveryResultsPerQuery || 6, 6);
    next.discoveryMaxDiscovered = Math.min(next.discoveryMaxDiscovered || 60, 60);
    next.discoveryQueryConcurrency = Math.max(next.discoveryQueryConcurrency || 0, 4);
    next.perHostMinDelayMs = Math.min(next.perHostMinDelayMs || 150, 150);
  } else if (isThoroughRound) {
    next.autoScrollEnabled = true;
    next.autoScrollPasses = Math.max(next.autoScrollPasses || 0, 3);
    next.autoScrollDelayMs = Math.max(next.autoScrollDelayMs || 0, 1200);
    next.pageGotoTimeoutMs = Math.max(next.pageGotoTimeoutMs || 0, 45000);
    next.pageNetworkIdleTimeoutMs = Math.max(next.pageNetworkIdleTimeoutMs || 0, 15000);
    next.postLoadWaitMs = Math.max(next.postLoadWaitMs || 0, 10000);
    next.maxJsonBytes = Math.max(next.maxJsonBytes || 0, 6000000);
    next.maxRunSeconds = Math.max(next.maxRunSeconds || 0, 3600);
    next.preferHttpFetcher = false;
    next.maxNetworkResponsesPerPage = Math.max(next.maxNetworkResponsesPerPage || 0, 2500);
    next.maxGraphqlReplays = Math.max(next.maxGraphqlReplays || 0, 20);
    next.maxHypothesisItems = Math.max(next.maxHypothesisItems || 0, 120);
    next.hypothesisAutoFollowupRounds = Math.max(next.hypothesisAutoFollowupRounds || 0, 2);
    next.hypothesisFollowupUrlsPerRound = Math.max(next.hypothesisFollowupUrlsPerRound || 0, 24);
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, 220);
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, 280);
    next.maxPagesPerDomain = Math.max(next.maxPagesPerDomain || 0, 8);
    next.maxGraphqlReplays = Math.max(next.maxGraphqlReplays || 0, 20);
    next.maxHypothesisItems = Math.max(next.maxHypothesisItems || 0, 120);
    next.endpointNetworkScanLimit = Math.max(next.endpointNetworkScanLimit || 0, 1800);
    next.endpointSignalLimit = Math.max(next.endpointSignalLimit || 0, 120);
    next.endpointSuggestionLimit = Math.max(next.endpointSuggestionLimit || 0, 36);
    next.discoveryEnabled = true;
    next.fetchCandidateSources = true;
    next.discoveryMaxQueries = Math.max(next.discoveryMaxQueries || 0, 24);
    next.discoveryResultsPerQuery = Math.max(next.discoveryResultsPerQuery || 0, 20);
    next.discoveryMaxDiscovered = Math.max(next.discoveryMaxDiscovered || 0, 300);
    next.discoveryQueryConcurrency = Math.max(next.discoveryQueryConcurrency || 0, 8);
  }

  if (round > 0) {
    next.discoveryMaxQueries = Math.max(next.discoveryMaxQueries || 0, Math.max(12, toInt(baseConfig.discoveryMaxQueries, 8) + 4));
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, Math.max(120, 25));
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, Math.max(180, toInt(baseConfig.maxCandidateUrls, 50) + 40));
    next.maxPagesPerDomain = Math.max(next.maxPagesPerDomain || 0, Math.max(3, 6));
  }

  if (expectedCount > 0) {
    next.discoveryMaxQueries = Math.max(next.discoveryMaxQueries || 0, 10 + Math.min(14, expectedCount * 2));
    next.discoveryResultsPerQuery = Math.max(next.discoveryResultsPerQuery || 0, 10);
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, 90 + Math.min(140, expectedCount * 12));
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, 130 + Math.min(200, expectedCount * 16));
  } else if (rareCount > 0 && sometimesCount === 0) {
    next.discoveryMaxQueries = Math.min(next.discoveryMaxQueries || 8, 6);
    next.maxUrlsPerProduct = Math.min(next.maxUrlsPerProduct || 60, 70);
    next.maxCandidateUrls = Math.min(next.maxCandidateUrls || 90, 90);
  }

  const contractTotalEffort = Math.max(0, toInt(contractEffort.total_effort, 0));
  const hardMissingCount = Math.max(0, toInt(contractEffort.hard_missing_count, 0));
  const contractCriticalMissingCount = Math.max(0, toInt(contractEffort.critical_missing_count, 0));
  const expectedRequiredCount = Math.max(0, toInt(contractEffort.expected_required_count, 0));
  if (round > 0 && contractTotalEffort > 0) {
    const effortTier = Math.min(4, Math.floor(contractTotalEffort / 8));
    const queryBoost = effortTier + Math.min(6, expectedRequiredCount);
    const urlBoost = (effortTier * 20) + (hardMissingCount * 14) + (contractCriticalMissingCount * 10);
    const candidateBoost = (effortTier * 30) + (hardMissingCount * 18) + (contractCriticalMissingCount * 12);
    next.discoveryMaxQueries = Math.max(next.discoveryMaxQueries || 0, (next.discoveryMaxQueries || 0) + queryBoost);
    next.maxUrlsPerProduct = Math.max(next.maxUrlsPerProduct || 0, (next.maxUrlsPerProduct || 0) + urlBoost);
    next.maxCandidateUrls = Math.max(next.maxCandidateUrls || 0, (next.maxCandidateUrls || 0) + candidateBoost);
  }

  {
    let discoveryEnabled = Boolean(next.discoveryEnabled);
    let fetchCandidateSources = Boolean(next.fetchCandidateSources);

    if (hasExplicitMissingCounts) {
      const shouldContinue =
        resolvedMissingCritical > 0 ||
        resolvedPreviousValidated === false;
      if (resolvedMissingRequired === 0 && resolvedMissingExpected === 0 && !shouldContinue) {
        discoveryEnabled = false;
        fetchCandidateSources = false;
      } else if (
        resolvedMissingRequired > 0 &&
        Boolean(baseConfig.discoveryInternalFirst) &&
        requiredIteration > 0 &&
        requiredIteration <= 1
      ) {
        discoveryEnabled = false;
        fetchCandidateSources = false;
      } else {
        discoveryEnabled = true;
        fetchCandidateSources = true;
      }
    }

    next.discoveryEnabled = discoveryEnabled;
    next.fetchCandidateSources = fetchCandidateSources;
    const searchProviderSelection = explainSearchProviderSelection({
      baseConfig,
      discoveryEnabled,
      missingRequiredCount: resolvedMissingRequired,
      requiredSearchIteration: requiredIteration
    });
    next.searchProvider = searchProviderSelection.provider;
    next.searchProviderSelection = searchProviderSelection;
    if (!discoveryEnabled) {
      next.searchProvider = 'none';
      next.searchProviderSelection = {
        ...searchProviderSelection,
        provider: 'none',
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

export function shouldStopForBudgetExhaustion({
  budgetBlockedReason = '',
  round = 0
} = {}) {
  const reason = String(budgetBlockedReason || '').trim().toLowerCase();
  if (!reason.includes('budget')) {
    return false;
  }
  if (round < 1) {
    return false;
  }
  // Per-round caps are soft throttles and reset each round.
  if (reason.includes('max_calls_per_round')) {
    return false;
  }
  return true;
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
