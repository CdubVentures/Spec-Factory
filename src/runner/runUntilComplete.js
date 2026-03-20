import { runProduct } from '../pipeline/runProduct.js';

import { configValue } from '../shared/settingsAccessor.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { evaluateSearchLoopStop } from '../features/indexing/search/index.js';
import { EventLogger } from '../logger.js';
import { loadCategoryBrain, availabilitySearchEffort } from '../features/indexing/learning/index.js';
import { normalizeFieldList } from '../utils/fieldKeys.js';
import {
  markQueueRunning,
  recordQueueRunResult,
  upsertQueueProduct
} from '../queue/queueState.js';
import { ruleAiMaxCalls } from '../engine/ruleAccessors.js';
import {
  toInt,
  toArray,
  normalizedRoundCount,
  summaryProgress,
  isCompleted,
  makeRoundHint,
  buildAvailabilityQueries,
  normalizeFieldContractToken,
  llmBlocked,
  calcProgressDelta
} from './convergenceHelpers.js';
import {
  buildContractEffortPlan,
  buildRoundConfig,
  buildRoundRequirements,
  explainSearchProviderSelection,
  evaluateRequiredSearchExhaustion,
  makeLlmTargetFields,
  resolveMissingRequiredForPlanning,
  shouldForceExpectedFieldRetry
} from './roundConfigBuilder.js';

// WHY: Extract per-field { field_key, state } snapshots from a round result
// so the next round's planner can compute deltas ("what changed this round").
function buildPreviousRoundFields(roundResult) {
  const fields = roundResult?.needSet?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return null;
  return fields
    .filter((f) => f.field_key)
    .map((f) => ({ field_key: f.field_key, state: f.state || 'unknown' }));
}

// WHY: Extract per-field history objects so the next round's computeNeedSet
// receives accumulated query_count, domains_tried, existing_queries, etc.
// Without this, every round starts fresh and repeat_count is always 0.
export function buildPreviousFieldHistories(roundResult) {
  const fields = roundResult?.needSet?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return {};
  const result = {};
  for (const f of fields) {
    if (f.field_key && f.history) result[f.field_key] = f.history;
  }
  return result;
}

// Re-exports for backward compatibility
export { normalizeFieldContractToken, calcProgressDelta, isIdentityOrEditorialField } from './convergenceHelpers.js';
export {
  buildContractEffortPlan,
  selectRoundSearchProvider,
  explainSearchProviderSelection,
  evaluateRequiredSearchExhaustion,
  shouldForceExpectedFieldRetry,
  buildRoundConfig,
  resolveMissingRequiredForPlanning,
  buildRoundRequirements,
  makeLlmTargetFields
} from './roundConfigBuilder.js';

export async function runUntilComplete({
  storage,
  config,
  s3key,
  maxRounds = 4,
  mode
}) {
  const job = await storage.readJson(s3key);
  const category = job.category || 'mouse';
  const productId = job.productId;
  if (!productId) {
    throw new Error(`Job at ${s3key} is missing productId`);
  }
  const logger = new EventLogger({
    storage,
    runtimeEventsKey: configValue(config, 'runtimeEventsKey'),
    context: {
      category,
      productId
    }
  });
  logger.info('queue_transition', {
    from: 'none',
    to: 'pending',
    reason: 'run_until_complete_started'
  });

  const categoryConfig = await loadCategoryConfig(category, { storage, config });
  const categoryBrain = await loadCategoryBrain({ storage, category });
  const fieldAvailabilityArtifact = categoryBrain?.artifacts?.fieldAvailability?.value || {};
  const defaultRounds = 8;
  let roundsLimit = normalizedRoundCount(maxRounds, defaultRounds);
  const rounds = [];

  await upsertQueueProduct({
    storage,
    category,
    productId,
    s3key,
    patch: {
      status: 'pending',
      next_action_hint: 'fast_pass'
    }
  });

  let previousSummary = null;
  let previousProgress = null;
  let previousRoundFields = null;
  let previousFieldHistories = {};
  let noProgressStreak = 0;
  let completed = false;
  let exhausted = false;
  let needsManual = false;
  let finalResult = null;
  let stopReason = '';
  let previousUrlCount = 0;
  let noNewUrlsRounds = 0;
  let noNewFieldsRounds = 0;
  let lowQualityRounds = 0;
  let requiredSearchIteration = 0;
  let expectedRetryOverrideCount = 0;
  let forcedExpectedRetryFields = [];
  const fieldCallCounts = new Map();
  let escalatedFields = [];  // Fields that failed extraction in prior round → escalate model

  for (let round = 0; round < roundsLimit; round += 1) {
    const roundHint = makeRoundHint(round);
    await markQueueRunning({
      storage,
      category,
      productId,
      s3key,
      nextActionHint: roundHint
    });
    logger.info('queue_transition', {
      from: 'pending',
      to: 'running',
      round,
      next_action_hint: roundHint
    });

    const missingRequiredForPlanning = resolveMissingRequiredForPlanning({
      previousSummary,
      categoryConfig
    });
    const missingCriticalForPlanning = normalizeFieldList(
      previousSummary?.critical_fields_below_pass_target || categoryConfig.schema?.critical_fields || [],
      { fieldOrder: categoryConfig.fieldOrder || [] }
    );
    const availabilityEffort = availabilitySearchEffort({
      artifact: fieldAvailabilityArtifact,
      missingFields: missingRequiredForPlanning,
      fieldOrder: categoryConfig.fieldOrder || []
    });
    const contractEffort = buildContractEffortPlan({
      missingRequiredFields: missingRequiredForPlanning,
      missingCriticalFields: missingCriticalForPlanning,
      categoryConfig
    });
    const missingRequiredCount = missingRequiredForPlanning.length;
    const missingExpectedCount = Math.max(
      0,
      toInt(availabilityEffort.expected_count, 0)
    );
    if (round > 0 && missingRequiredCount > 0) {
      requiredSearchIteration += 1;
    } else if (missingRequiredCount === 0) {
      requiredSearchIteration = 0;
    }
    const extraQueries = buildAvailabilityQueries({
      job,
      expectedFields: availabilityEffort.missing_expected_fields || [],
      sometimesFields: availabilityEffort.missing_sometimes_fields || [],
      criticalFields: missingCriticalForPlanning
    });

    const roundConfig = buildRoundConfig(config, {
      round,
      availabilityEffort,
      contractEffort,
      missingRequiredCount,
      missingExpectedCount,
      missingCriticalCount: missingCriticalForPlanning.length,
      previousValidated: previousSummary?.validated,
      requiredSearchIteration
    });
    const providerSelection = roundConfig.searchProviderSelection || explainSearchProviderSelection({
      baseConfig: config,
      discoveryEnabled: roundConfig.discoveryEnabled,
      missingRequiredCount,
      requiredSearchIteration
    });
    logger.info('search_provider_selected', {
      round,
      provider: providerSelection.provider,
      reason_code: providerSelection.reason_code,
      configured_provider: providerSelection.configured_provider,
      required_search_iteration: providerSelection.required_search_iteration,
      missing_required_count: providerSelection.missing_required_count,
      free_provider_ready: providerSelection.free_provider_ready,
      google_ready: providerSelection.google_ready,
      bing_ready: providerSelection.bing_ready,
      searxng_ready: providerSelection.searxng_ready
    });
    let focusFields = makeLlmTargetFields({
      previousSummary,
      categoryConfig,
      fallbackRequiredFields: missingRequiredForPlanning,
      config
    });
    if (forcedExpectedRetryFields.length > 0) {
      focusFields = [...new Set([...focusFields, ...forcedExpectedRetryFields])];
      forcedExpectedRetryFields = [];
    }
    // Per-field call budget enforcement: exclude fields that have exhausted ai_max_calls
    const ruleMap = categoryConfig?.fieldRules?.fields || {};
    const budgetExhaustedFields = [];
    focusFields = focusFields.filter((field) => {
      const key = normalizeFieldContractToken(field);
      const rule = ruleMap[key] || ruleMap[`fields.${key}`] || {};
      const maxCalls = ruleAiMaxCalls(rule);
      const currentCalls = fieldCallCounts.get(key) || 0;
      if (currentCalls >= maxCalls) {
        budgetExhaustedFields.push(key);
        return false;
      }
      return true;
    });
    if (budgetExhaustedFields.length > 0) {
      logger.info('field_budget_exhausted', {
        round,
        fields: budgetExhaustedFields,
        remaining_target_count: focusFields.length
      });
    }
    const jobOverride = buildRoundRequirements(job, focusFields, previousSummary, missingRequiredForPlanning);

    const roundResult = await runProduct({
      storage,
      config: roundConfig,
      s3Key: s3key,
      jobOverride,
      roundContext: {
        round,
        force_verify_llm: Boolean(
          config.llmVerifyMode &&
          Array.isArray(previousSummary?.missing_required_fields) &&
          previousSummary.missing_required_fields.length > 0
        ),
        missing_required_fields: missingRequiredForPlanning,
        missing_critical_fields: missingCriticalForPlanning,
        availability: availabilityEffort,
        contract_effort: contractEffort,
        focus_fields: focusFields,
        escalated_fields: escalatedFields,
        previousRoundFields,
        previousFieldHistories,
      }
    });
    finalResult = roundResult;
    // Increment per-field call counts for all fields targeted this round
    for (const field of focusFields) {
      const key = normalizeFieldContractToken(field);
      fieldCallCounts.set(key, (fieldCallCounts.get(key) || 0) + 1);
    }
    // Dynamic escalation: fields targeted this round that are still missing → escalate next round
    const stillMissing = new Set(
      (roundResult.summary?.missing_required_fields || [])
        .map((f) => normalizeFieldContractToken(f))
        .filter(Boolean)
    );
    escalatedFields = focusFields
      .map((f) => normalizeFieldContractToken(f))
      .filter((f) => stillMissing.has(f));
    if (escalatedFields.length > 0) {
      logger.info('fields_escalated_for_next_round', {
        round,
        count: escalatedFields.length,
        fields: escalatedFields.slice(0, 10)
      });
    }
    logger.info('round_completed', {
      round,
      run_id: roundResult.runId,
      validated: Boolean(roundResult.summary?.validated),
      confidence: Number(roundResult.summary?.confidence || 0),
      missing_required_count: (roundResult.summary?.missing_required_fields || []).length,
      critical_missing_count: (roundResult.summary?.critical_fields_below_pass_target || []).length
    });

    const progress = summaryProgress(roundResult.summary);
    const delta = calcProgressDelta(previousProgress, progress);
    if (delta.improved) {
      noProgressStreak = 0;
      noNewFieldsRounds = 0;
    } else {
      noProgressStreak += 1;
      noNewFieldsRounds += 1;
    }

    const budgetBlockedReason = llmBlocked(roundResult.summary);
    const urlsFetchedCount = toArray(roundResult.summary?.urls_fetched).length;
    if (urlsFetchedCount > previousUrlCount) {
      noNewUrlsRounds = 0;
      previousUrlCount = urlsFetchedCount;
    } else {
      noNewUrlsRounds += 1;
    }
    if (
      (Number.parseInt(String(roundResult.summary?.sources_identity_matched || 0), 10) || 0) === 0 ||
      progress.confidence < 0.2
    ) {
      lowQualityRounds += 1;
    } else {
      lowQualityRounds = 0;
    }

    await recordQueueRunResult({
      storage,
      category,
      s3key,
      result: roundResult,
      roundResult: {
        exhausted: false,
        budgetExceeded: false,
        nextActionHint: makeRoundHint(round + 1)
      }
    });

    rounds.push({
      round,
      round_profile: 'standard',
      run_id: roundResult.runId,
      search_provider: providerSelection.provider,
      search_provider_reason: providerSelection.reason_code || null,
      validated: progress.validated,
      missing_required_count: progress.missingRequiredCount,
      critical_missing_count: progress.criticalCount,
      contradiction_count: progress.contradictionCount,
      confidence: progress.confidence,
      llm_budget_blocked_reason: budgetBlockedReason || null,
      availability_effort: availabilityEffort,
      contract_effort: contractEffort,
      improved: delta.improved,
      improvement_reasons: delta.reasons
    });

    if (isCompleted(roundResult.summary)) {
      completed = true;
      stopReason = 'complete';
      break;
    }

    const requiredSearchStop = evaluateRequiredSearchExhaustion({
      round,
      missingRequiredCount: progress.missingRequiredCount,
      noNewUrlsRounds,
      noNewFieldsRounds,
      threshold: Math.max(1, toInt(config.requiredSearchExhaustionThreshold, 2))
    });
    if (requiredSearchStop.stop) {
      exhausted = true;
      stopReason = requiredSearchStop.reason;
      break;
    }

    const stopDecision = evaluateSearchLoopStop({
      noNewUrlsRounds,
      noNewFieldsRounds,
      budgetReached: false,
      repeatedLowQualityRounds: lowQualityRounds,
      maxNoProgressRounds: (availabilityEffort.expected_count || 0) > 0 ? 3 : 2,
      maxLowQualityRounds: 3
    });

    const noProgressLimit = (availabilityEffort.expected_count || 0) > 0 ? 3 : 2;
    if (stopDecision.stop || noProgressStreak >= noProgressLimit) {
      const expectedRetryDecision = shouldForceExpectedFieldRetry({
        summary: roundResult.summary,
        categoryConfig,
        fieldAvailabilityArtifact,
        overrideCount: expectedRetryOverrideCount
      });
      if (expectedRetryDecision.force) {
        expectedRetryOverrideCount += 1;
        forcedExpectedRetryFields = expectedRetryDecision.fields;
        noProgressStreak = 0;
        noNewFieldsRounds = 0;
        if (round + 1 >= roundsLimit) {
          roundsLimit = normalizedRoundCount(roundsLimit + 1, 12);
        }
        logger.info('expected_retry_forced', {
          round,
          fields: expectedRetryDecision.fields
        });
        previousSummary = roundResult.summary;
        previousProgress = progress;
        // WHY: Capture needset field states so the next round's planner can
        // compute deltas ("what changed this round") for the GUI.
        previousRoundFields = buildPreviousRoundFields(roundResult);
        previousFieldHistories = buildPreviousFieldHistories(roundResult);
        continue;
      }
      exhausted = true;
      stopReason = stopDecision.stop ? stopDecision.reason : `no_progress_${noProgressLimit}_rounds`;
      break;
    }

    previousSummary = roundResult.summary;
    previousProgress = progress;
    previousRoundFields = buildPreviousRoundFields(roundResult);
    previousFieldHistories = buildPreviousFieldHistories(roundResult);
  }

  if (!completed && !exhausted && rounds.length >= roundsLimit) {
    exhausted = true;
    stopReason = 'max_rounds_reached';
  }

  if (finalResult) {
    const finalStatus = completed
      ? 'complete'
      : needsManual
        ? 'needs_manual'
        : exhausted
          ? 'exhausted'
          : 'running';
    await upsertQueueProduct({
      storage,
      category,
      productId,
      s3key,
      patch: {
        status: finalStatus,
        next_action_hint: completed ? 'none' : 'manual_or_retry'
      }
    });
    logger.info('queue_transition', {
      from: 'running',
      to: finalStatus,
      reason: stopReason || (completed ? 'complete' : 'stopped')
    });
  }

  await logger.flush();

  return {
    s3key,
    productId,
    category,
    mode,
    max_rounds: roundsLimit,
    round_count: rounds.length,
    complete: completed,
    exhausted,
    needs_manual: needsManual,
    stop_reason: stopReason || null,
    final_run_id: finalResult?.runId || null,
    final_summary: finalResult?.summary || null,
    rounds
  };
}
