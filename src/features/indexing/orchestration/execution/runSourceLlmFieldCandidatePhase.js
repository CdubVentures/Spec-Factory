export function runSourceLlmFieldCandidatePhase({
  llmExtraction = {},
  llmEligibleSource = false,
  anchors = [],
  sourceUrl = '',
  llmRetryReasonByUrl = new Map(),
  logger = null,
  isIdentityLockedFieldFn = () => false,
  isAnchorLockedFn = () => false,
  budgetRetryReason = 'llm_budget_guard_blocked',
} = {}) {
  const llmFieldCandidates = (llmExtraction.fieldCandidates || []).filter((row) => {
    if (isIdentityLockedFieldFn(row.field)) {
      return false;
    }
    if (isAnchorLockedFn(row.field, anchors)) {
      return false;
    }
    return true;
  });
  const llmNotesLower = (llmExtraction.notes || [])
    .map((note) => String(note || '').toLowerCase())
    .join(' | ');

  if (
    llmEligibleSource
    && llmFieldCandidates.length === 0
    && (llmNotesLower.includes('budget guard') || llmNotesLower.includes('skipped by budget'))
  ) {
    llmRetryReasonByUrl.set(sourceUrl, budgetRetryReason);
    logger?.info?.('llm_retry_source_queued', {
      url: sourceUrl,
      reason: budgetRetryReason
    });
  }

  return { llmFieldCandidates };
}
