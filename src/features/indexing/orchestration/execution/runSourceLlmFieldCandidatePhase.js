export function runSourceLlmFieldCandidatePhase({
  llmExtraction = {},
  llmEligibleSource = false,
  anchors = [],
  sourceUrl = '',
  llmRetryReasonByUrl = new Map(),
  logger = null,
  isIdentityLockedFieldFn = () => false,
  isAnchorLockedFn = () => false,
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
  return { llmFieldCandidates };
}
