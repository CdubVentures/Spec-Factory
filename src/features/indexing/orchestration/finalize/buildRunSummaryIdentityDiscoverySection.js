export function buildRunSummaryIdentityDiscoverySection({
  completenessStats = {},
  anchors = {},
  allAnchorConflicts = [],
  anchorMajorConflictsCount = 0,
  identityConfidence = 0,
  identityGate = {},
  extractionGateOpen = false,
  identityLock = {},
  publishable = false,
  publishBlockers = [],
  identityReport = {},
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  newValuesProposed = [],
  sourceResults = [],
  discoveryResult = {},
  config = {},
  normalizeAmbiguityLevelFn = (value) => value,
  isHelperSyntheticSourceFn = () => false,
} = {}) {
  return {
    required_fields: completenessStats.requiredFields,
    missing_required_fields: completenessStats.missingRequiredFields,
    anchor_fields_present: Boolean(
      Object.values(anchors).find((value) => String(value || '').trim() !== ''),
    ),
    anchor_conflicts: allAnchorConflicts,
    anchor_major_conflicts_count: anchorMajorConflictsCount,
    identity_confidence: identityConfidence,
    identity_gate_validated: identityGate.validated,
    extraction_gate_open: extractionGateOpen,
    identity_ambiguity: {
      family_model_count: Number(identityLock.family_model_count || 0),
      ambiguity_level: normalizeAmbiguityLevelFn(identityLock.ambiguity_level || ''),
    },
    identity_gate: identityGate,
    publishable,
    publish_blockers: publishBlockers,
    identity_report: {
      status: identityReport.status,
      needs_review: identityReport.needs_review,
      reason_codes: identityReport.reason_codes || [],
      page_count: (identityReport.pages || []).length,
      contradiction_count: Number(identityReport.contradiction_count || 0),
      contradictions: identityReport.contradictions || [],
      accepted_exact_match_sources: identityReport.accepted_exact_match_sources || [],
      accepted_conflict_contributors: identityReport.accepted_conflict_contributors || [],
      rejected_sibling_sources: identityReport.rejected_sibling_sources || [],
      first_conflict_trigger: identityReport.first_conflict_trigger || null,
    },
    fields_below_pass_target: fieldsBelowPassTarget,
    critical_fields_below_pass_target: criticalFieldsBelowPassTarget,
    new_values_proposed: newValuesProposed,
    sources_attempted: sourceResults.length,
    sources_identity_matched: sourceResults.filter((source) => source.identity.match).length,
    discovery: {
      enabled: discoveryResult.enabled,
      fetch_candidate_sources: true,
      discovery_key: discoveryResult.discoveryKey,
      candidates_key: discoveryResult.candidatesKey,
      candidate_count: (discoveryResult.candidates || []).length,
      search_profile_key: discoveryResult.search_profile_key || null,
      search_profile_run_key: discoveryResult.search_profile_run_key || null,
      search_profile_latest_key: discoveryResult.search_profile_latest_key || null,
    },
    searches_attempted: discoveryResult.search_attempts || [],
    urls_fetched: [
      ...new Set(
        sourceResults
          .filter((source) => !isHelperSyntheticSourceFn(source))
          .map((source) => source.finalUrl || source.url)
          .filter(Boolean),
      ),
    ],
    // WHY: buildFieldHistories needs searchPlanQueries to track existing_queries,
    // query_count, and duplicate_attempts_suppressed across rounds.
    searchPlanQueries: (Array.isArray(discoveryResult.queries) ? discoveryResult.queries : [])
      .filter((q) => q && typeof q === 'object')
      .map((q) => ({
        query: String(q.query || '').trim(),
        target_fields: Array.isArray(q.target_fields) ? q.target_fields : [],
      })),
  };
}
