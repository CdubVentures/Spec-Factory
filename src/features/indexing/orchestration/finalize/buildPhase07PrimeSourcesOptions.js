export function buildPhase07PrimeSourcesOptions({
  config = {},
} = {}) {
  return {
    maxHitsPerField: config.retrievalMaxHitsPerField || 24,
    maxPrimeSourcesPerField: config.retrievalMaxPrimeSources || 8,
    identityFilterEnabled: Boolean(config.retrievalIdentityFilterEnabled),
    retrievalEvidenceTierWeightMultiplier: config.retrievalEvidenceTierWeightMultiplier,
    retrievalEvidenceDocWeightMultiplier: config.retrievalEvidenceDocWeightMultiplier,
    retrievalEvidenceMethodWeightMultiplier: config.retrievalEvidenceMethodWeightMultiplier,
    retrievalEvidencePoolMaxRows: config.retrievalEvidencePoolMaxRows,
    retrievalSnippetsPerSourceCap: config.retrievalSnippetsPerSourceCap,
    retrievalMaxHitsCap: config.retrievalMaxHitsCap,
    retrievalEvidenceRefsLimit: config.retrievalEvidenceRefsLimit,
    retrievalReasonBadgesLimit: config.retrievalReasonBadgesLimit,
    retrievalAnchorsLimit: config.retrievalAnchorsLimit,
    retrievalPrimeSourcesMaxCap: config.retrievalPrimeSourcesMaxCap,
    retrievalFallbackEvidenceMaxRows: config.retrievalFallbackEvidenceMaxRows,
    retrievalProvenanceOnlyMinRows: config.retrievalProvenanceOnlyMinRows,
    fetchSchedulerInternalsMapJson: config.fetchSchedulerInternalsMapJson,
    repairDedupeRule: config.repairDedupeRule,
  };
}
