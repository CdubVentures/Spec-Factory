export async function runIndexingResumePersistencePhase({
  storage,
  logger,
  indexingResumeKey = '',
  category = '',
  productId = '',
  runId = '',
  planner,
  resumeCooldownSkippedUrls = new Set(),
  resumeFetchFailedUrls = new Set(),
  previousResumePendingUnseeded = [],
  resumePersistLimit = 0,
  previousResumeRetryRows = [],
  llmRetryReasonByUrl = new Map(),
  attemptedSourceUrls = new Set(),
  resumeRetryPersistLimit = 0,
  previousResumeSuccessRows = [],
  successfulSourceMetaByUrl = new Map(),
  resumeSeededPendingCount = 0,
  resumeSeededLlmRetryCount = 0,
  resumeSeededReextractCount = 0,
  indexingResumeSuccessPersistLimit,
  toIntFn,
  normalizeHttpUrlListFn,
  collectPlannerPendingUrlsFn,
  buildNextLlmRetryRowsFn,
  buildNextSuccessRowsFn,
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  const nowIso = nowIsoFn();
  const resumePendingUrls = normalizeHttpUrlListFn(
    [
      ...collectPlannerPendingUrlsFn(planner),
      ...resumeCooldownSkippedUrls,
      ...resumeFetchFailedUrls,
      ...previousResumePendingUnseeded,
    ],
    resumePersistLimit,
  );
  const resumeLlmRetryRows = buildNextLlmRetryRowsFn({
    previousRows: previousResumeRetryRows,
    newReasonByUrl: llmRetryReasonByUrl,
    attemptedUrls: attemptedSourceUrls,
    nowIso,
    limit: resumeRetryPersistLimit,
  });
  const resumeSuccessRows = buildNextSuccessRowsFn({
    previousRows: previousResumeSuccessRows,
    newSuccessByUrl: successfulSourceMetaByUrl,
    nowIso,
    limit: Math.max(80, toIntFn(indexingResumeSuccessPersistLimit, 240)),
  });
  const resumeStatePayload = {
    category,
    productId,
    runId,
    updated_at: nowIso,
    pending_urls: resumePendingUrls,
    llm_retry_urls: resumeLlmRetryRows,
    success_urls: resumeSuccessRows,
    stats: {
      seeded_pending_count: resumeSeededPendingCount,
      seeded_llm_retry_count: resumeSeededLlmRetryCount,
      seeded_reextract_count: resumeSeededReextractCount,
      persisted_pending_count: resumePendingUrls.length,
      persisted_llm_retry_count: resumeLlmRetryRows.length,
      persisted_success_count: resumeSuccessRows.length,
      cooldown_skipped_count: resumeCooldownSkippedUrls.size,
      fetch_failed_count: resumeFetchFailedUrls.size,
    },
  };
  await storage.writeObject(
    indexingResumeKey,
    Buffer.from(`${JSON.stringify(resumeStatePayload, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  const resumePersistedPendingCount = resumePendingUrls.length;
  const resumePersistedLlmRetryCount = resumeLlmRetryRows.length;
  const resumePersistedSuccessCount = resumeSuccessRows.length;
  logger.info('indexing_resume_written', {
    resume_key: indexingResumeKey,
    pending_urls: resumePersistedPendingCount,
    llm_retry_urls: resumePersistedLlmRetryCount,
    success_urls: resumePersistedSuccessCount,
  });

  return {
    resumePendingUrls,
    resumeLlmRetryRows,
    resumeSuccessRows,
    resumePersistedPendingCount,
    resumePersistedLlmRetryCount,
    resumePersistedSuccessCount,
    resumeStatePayload,
  };
}
