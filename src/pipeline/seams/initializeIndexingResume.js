import { resolveIndexingResumeKey, toInt, filterResumeSeedUrls } from '../../features/indexing/orchestration/index.js';
import {
  normalizeResumeMode,
  isResumeStateFresh,
  resumeStateAgeHours,
  normalizeHttpUrlList,
  selectReextractSeedUrls,
} from '../../runtime/indexingResume.js';

/**
 * Resume/seeding initialization seam — extracted from runProduct.js.
 *
 * Resolves resume key, loads previous resume state, filters seed URLs,
 * and seeds the planner queue. Returns all resume-related state consumed
 * by the persistence phase and finalization payloads.
 */
export async function initializeIndexingResume({ storage, config, category, productId, logger, planner, frontierDb }) {
  const indexingResumeKey = resolveIndexingResumeKey(storage, category, productId);
  const resumeMode = normalizeResumeMode(config.indexingResumeMode);
  const resumeMaxAgeHours = Math.max(0, toInt(config.indexingResumeMaxAgeHours, 48));
  const resumeReextractEnabled = config.indexingReextractEnabled !== false;
  const resumeReextractAfterHours = Math.max(0, toInt(config.indexingReextractAfterHours, 24));
  const resumeReextractSeedLimit = Math.max(1, toInt(config.indexingReextractSeedLimit, 8));
  const resumeSeedLimit = Math.max(4, toInt(config.indexingResumeSeedLimit, 24));
  const resumePersistLimit = Math.max(
    resumeSeedLimit * 4,
    Math.max(40, toInt(config.indexingResumePersistLimit, 160))
  );
  const resumeRetryPersistLimit = Math.max(10, toInt(config.indexingResumeRetryPersistLimit, 80));
  const rawPreviousResumeState = await storage.readJsonOrNull(indexingResumeKey).catch(() => null) || {};
  const previousResumeStateAgeHours = resumeStateAgeHours(rawPreviousResumeState.updated_at);
  const previousResumeStateFresh = isResumeStateFresh(
    rawPreviousResumeState.updated_at,
    resumeMaxAgeHours
  );
  const usePreviousResumeState =
    resumeMode === 'force_resume' ||
    (resumeMode === 'auto' && previousResumeStateFresh);
  const previousResumeState = usePreviousResumeState ? rawPreviousResumeState : {};
  if (resumeMode === 'start_over') {
    logger.info('indexing_resume_start_over', {
      resume_key: indexingResumeKey,
      mode: resumeMode
    });
  } else if (!usePreviousResumeState && rawPreviousResumeState?.updated_at) {
    logger.info('indexing_resume_expired', {
      resume_key: indexingResumeKey,
      mode: resumeMode,
      max_age_hours: resumeMaxAgeHours,
      state_age_hours: Number.isFinite(previousResumeStateAgeHours)
        ? Number(previousResumeStateAgeHours.toFixed(2))
        : null
    });
  }
  const resumeCooldownSkippedUrls = new Set();
  const resumeFetchFailedUrls = new Set();
  const previousResumePendingAll = normalizeHttpUrlList(
    previousResumeState.pending_urls || [],
    resumePersistLimit * 2
  );
  const previousResumePendingSeed = filterResumeSeedUrls({
    urls: previousResumePendingAll.slice(0, resumeSeedLimit),
    frontierDb,
    resumeCooldownSkippedUrls,
    logger,
    seedKind: 'resume_pending_seed'
  });
  const previousResumePendingUnseeded = previousResumePendingAll.slice(resumeSeedLimit, resumePersistLimit * 2);
  const previousResumeRetryRows = Array.isArray(previousResumeState.llm_retry_urls)
    ? previousResumeState.llm_retry_urls
    : [];
  const previousResumeSuccessRows = Array.isArray(previousResumeState.success_urls)
    ? previousResumeState.success_urls
    : [];
  const previousResumeRetrySeedUrls = filterResumeSeedUrls({
    urls: normalizeHttpUrlList(
      previousResumeRetryRows.map((row) => row?.url),
      resumeSeedLimit
    ),
    frontierDb,
    resumeCooldownSkippedUrls,
    logger,
    seedKind: 'resume_llm_retry_seed'
  });
  const previousResumeReextractSeedUrls = resumeReextractEnabled
    ? filterResumeSeedUrls({
      urls: selectReextractSeedUrls({
        successRows: previousResumeSuccessRows,
        afterHours: resumeReextractAfterHours,
        limit: resumeReextractSeedLimit
      }),
      frontierDb,
      resumeCooldownSkippedUrls,
      logger,
      seedKind: 'resume_reextract_seed'
    })
    : [];
  let resumeSeededPendingCount = 0;
  let resumeSeededLlmRetryCount = 0;
  let resumeSeededReextractCount = 0;
  for (const url of previousResumePendingSeed) {
    if (planner.enqueue(url, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false })) {
      resumeSeededPendingCount += 1;
    }
  }
  for (const url of previousResumeRetrySeedUrls) {
    if (planner.enqueue(url, 'resume_llm_retry_seed', { forceApproved: true, forceBrandBypass: false })) {
      resumeSeededLlmRetryCount += 1;
    }
  }
  for (const url of previousResumeReextractSeedUrls) {
    if (planner.enqueue(url, 'resume_reextract_seed', { forceApproved: true, forceBrandBypass: false })) {
      resumeSeededReextractCount += 1;
    }
  }
  if (resumeSeededPendingCount > 0 || resumeSeededLlmRetryCount > 0 || resumeSeededReextractCount > 0) {
    logger.info('indexing_resume_loaded', {
      resume_key: indexingResumeKey,
      pending_seeded: resumeSeededPendingCount,
      llm_retry_seeded: resumeSeededLlmRetryCount,
      reextract_seeded: resumeSeededReextractCount,
      resume_mode: resumeMode,
      resume_max_age_hours: resumeMaxAgeHours,
      resume_state_age_hours: Number.isFinite(previousResumeStateAgeHours)
        ? Number(previousResumeStateAgeHours.toFixed(2))
        : null,
      previous_pending_count: previousResumePendingAll.length,
      previous_llm_retry_count: previousResumeRetryRows.length,
      previous_success_count: previousResumeSuccessRows.length
    });
  }

  return {
    indexingResumeKey,
    resumeMode,
    resumeMaxAgeHours,
    previousResumeStateAgeHours,
    resumeReextractEnabled,
    resumeReextractAfterHours,
    resumePersistLimit,
    resumeRetryPersistLimit,
    previousResumePendingUnseeded,
    previousResumeRetryRows,
    previousResumeSuccessRows,
    resumeCooldownSkippedUrls,
    resumeFetchFailedUrls,
    resumeSeededPendingCount,
    resumeSeededLlmRetryCount,
    resumeSeededReextractCount,
  };
}
