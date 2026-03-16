import { nextBestUrlsFromHypotheses } from '../../learning/hypothesisQueue.js';
import { buildProvisionalHypothesisQueue } from '../shared/reasoningHelpers.js';
import { isHelperSyntheticSource } from '../shared/urlHelpers.js';

function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`runHypothesisFollowups requires ${name}`);
  }
}

function buildSourceResultsWithoutSynthetic({ sourceResults = [], isHelperSyntheticSourceFn }) {
  return sourceResults.filter((source) => !isHelperSyntheticSourceFn(source));
}

function buildSeedUrlList({
  sourceResults = [],
  hypothesisQueue = [],
  followupPerRound = 1,
  nextBestUrlsFromHypothesesFn,
} = {}) {
  const consideredUrls = new Set(
    sourceResults
      .map((source) => source.finalUrl || source.url)
      .filter(Boolean),
  );
  const roundSeedUrls = [];
  for (const suggestion of nextBestUrlsFromHypothesesFn({
    hypothesisQueue,
    limit: followupPerRound * 4,
  })) {
    const url = String(suggestion?.url || '').trim();
    if (!url || consideredUrls.has(url)) {
      continue;
    }
    consideredUrls.add(url);
    roundSeedUrls.push(url);
    if (roundSeedUrls.length >= followupPerRound) {
      break;
    }
  }
  return roundSeedUrls;
}

export async function runHypothesisFollowups({
  config = {},
  startMs = 0,
  logger,
  planner,
  processPlannerQueueFn,
  sourceResults = [],
  categoryConfig,
  fieldOrder,
  anchors,
  job = {},
  productId,
  category,
  requiredFields,
  sourceIntel = {},
  hypothesisFollowupRoundsExecuted = 0,
  hypothesisFollowupSeededUrls = 0,
  buildProvisionalHypothesisQueueFn = buildProvisionalHypothesisQueue,
  nextBestUrlsFromHypothesesFn = nextBestUrlsFromHypotheses,
  isHelperSyntheticSourceFn = isHelperSyntheticSource,
  nowFn = Date.now,
} = {}) {
  validateFunctionArg('processPlannerQueueFn', processPlannerQueueFn);
  validateFunctionArg('buildProvisionalHypothesisQueueFn', buildProvisionalHypothesisQueueFn);
  validateFunctionArg('nextBestUrlsFromHypothesesFn', nextBestUrlsFromHypothesesFn);
  validateFunctionArg('isHelperSyntheticSourceFn', isHelperSyntheticSourceFn);
  validateFunctionArg('nowFn', nowFn);

  const maxFollowupRounds = Math.max(0, Number(config.hypothesisAutoFollowupRounds || 0));
  const followupPerRound = Math.max(1, Number(config.hypothesisFollowupUrlsPerRound || 12));
  for (let round = 1; round <= maxFollowupRounds; round += 1) {
    const elapsedSeconds = (nowFn() - startMs) / 1000;
    if (elapsedSeconds >= config.maxRunSeconds) {
      logger.warn('max_run_seconds_reached', { maxRunSeconds: config.maxRunSeconds });
      break;
    }

    const provisional = buildProvisionalHypothesisQueueFn({
      sourceResults: buildSourceResultsWithoutSynthetic({ sourceResults, isHelperSyntheticSourceFn }),
      categoryConfig,
      fieldOrder,
      anchors,
      identityLock: job.identityLock || {},
      productId,
      category,
      config,
      requiredFields,
      sourceIntelDomains: sourceIntel.data?.domains || {},
      brand: job.identityLock?.brand || '',
    });

    const roundSeedUrls = buildSeedUrlList({
      sourceResults,
      hypothesisQueue: provisional.hypothesisQueue,
      followupPerRound,
      nextBestUrlsFromHypothesesFn,
    });

    if (!roundSeedUrls.length) {
      logger.info('hypothesis_followup_skipped', {
        round,
        reason: 'no_candidate_urls',
        missing_required_count: provisional.missingRequiredFields.length,
        critical_fields_remaining: provisional.criticalFieldsBelowPassTarget.length,
      });
      break;
    }

    let enqueuedCount = 0;
    for (const url of roundSeedUrls) {
      if (planner.enqueue(url, `hypothesis_followup:${round}`)) {
        enqueuedCount += 1;
      }
    }

    if (!enqueuedCount) {
      logger.info('hypothesis_followup_skipped', {
        round,
        reason: 'queue_rejected_all',
        requested_urls: roundSeedUrls.length,
      });
      break;
    }

    hypothesisFollowupRoundsExecuted += 1;
    hypothesisFollowupSeededUrls += enqueuedCount;
    logger.info('hypothesis_followup_round_started', {
      round,
      enqueued_urls: enqueuedCount,
      missing_required_count: provisional.missingRequiredFields.length,
      critical_fields_remaining: provisional.criticalFieldsBelowPassTarget.length,
    });
    await processPlannerQueueFn();
  }

  return {
    hypothesisFollowupRoundsExecuted,
    hypothesisFollowupSeededUrls,
  };
}
