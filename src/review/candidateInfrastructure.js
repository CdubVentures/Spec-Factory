// Compatibility shim
export {
  stableSerialize, valueToken, hasKnownValue, clamp01,
  normalizeSourceToken, sourceLabelFromToken, sourceMethodFromToken,
  candidateSourceToken, buildPipelineAttributionContext,
  pipelineSourceFromAttribution, buildPipelineEvidenceQuote,
  reviewItemScore, buildPipelineReviewCandidate, sortCandidatesByScore,
  ensureCandidateShape, buildSyntheticSelectedCandidate,
  ensureTrackedStateCandidateInvariant, ensureEnumValueCandidateInvariant,
  isSharedLanePending, toSpecDbCandidate, appendAllSpecDbCandidates,
  hasActionableCandidate, shouldIncludeEnumValueEntry,
  buildCandidateReviewLookup, getCandidateReviewRow,
  normalizeCandidateSharedReviewStatus, annotateCandidateSharedReviews,
  reviewStatusToken, isReviewItemCandidateVisible,
} from '../features/review/domain/candidateInfrastructure.js';
