export function resolveIndexingResumePersistenceState({
  resumePersistenceResult = {},
} = {}) {
  return {
    resumePersistedPendingCount: resumePersistenceResult.resumePersistedPendingCount,
    resumePersistedLlmRetryCount: resumePersistenceResult.resumePersistedLlmRetryCount,
    resumePersistedSuccessCount: resumePersistenceResult.resumePersistedSuccessCount,
  };
}
