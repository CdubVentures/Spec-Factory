/**
 * Project NeedSet planner output into a story-mode view-model for panels.
 * Merges planner core with Search Profile preview data.
 */
export function projectNeedSetStory({
  needSet = {},
  searchProfilePreview = null,
  round = 0,
} = {}) {
  const summary = needSet.summary || { core_unresolved: 0, secondary_unresolved: 0, optional_unresolved: 0, conflicts: 0, bundles_planned: 0 };
  const plannerBlockers = needSet.blockers || { missing: 0, weak: 0, conflict: 0 };
  const rows = Array.isArray(needSet.rows) ? needSet.rows : [];

  // Story-level blockers derived after Search Profile preview
  const coreUnresolved = rows.filter(r => r.priority_bucket === 'core' && r.state !== 'covered');
  const needsExactMatch = round > 0 ? coreUnresolved.length : 0;
  const searchExhausted = 0; // derived from searchProfilePreview if available

  // Enrich bundles from Search Profile preview
  const rawBundles = Array.isArray(needSet.bundles) ? needSet.bundles : [];
  const profileQueryMap = buildProfileQueryMap(searchProfilePreview);

  const enrichedBundles = rawBundles.map(bundle => {
    const profileData = profileQueryMap.get(bundle.bundle_id) || {};
    return {
      ...bundle,
      source_target: profileData.source_target || '',
      content_target: profileData.content_target || '',
      search_intent: profileData.search_intent || '',
      host_class: profileData.host_class || '',
      query_family_mix: profileData.query_family_mix || '',
      reason_active: buildReasonActive(bundle, rows),
      queries: profileData.queries || []
    };
  });

  // Profile influence
  const profileMix = needSet.profile_mix || {};
  const profileInfluence = {
    ...profileMix,
    duplicates_suppressed: searchProfilePreview?.duplicates_suppressed ?? 0,
    focused_bundles: rawBundles.length,
    targeted_exceptions: profileMix.targeted_single_field || 0,
    total_queries: searchProfilePreview?.total_queries ?? 0,
    trusted_host_share: searchProfilePreview?.trusted_host_share ?? 0,
    docs_manual_share: searchProfilePreview?.docs_manual_share ?? 0
  };

  return {
    ...needSet,
    round,
    blockers: {
      ...plannerBlockers,
      needs_exact_match: needsExactMatch,
      search_exhausted: searchExhausted
    },
    bundles: enrichedBundles,
    profile_influence: profileInfluence
  };
}

function buildProfileQueryMap(searchProfilePreview) {
  const map = new Map();
  if (!searchProfilePreview || !Array.isArray(searchProfilePreview.bundle_previews)) return map;
  for (const preview of searchProfilePreview.bundle_previews) {
    map.set(preview.bundle_id, {
      source_target: preview.source_target || '',
      content_target: preview.content_target || '',
      search_intent: preview.search_intent || '',
      host_class: preview.host_class || '',
      query_family_mix: preview.query_family_mix || '',
      queries: Array.isArray(preview.queries) ? preview.queries : []
    });
  }
  return map;
}

function buildReasonActive(bundle, rows) {
  const bundleRows = rows.filter(r => r.bundle_id === bundle.bundle_id);
  const unresolved = bundleRows.filter(r => r.state !== 'covered');
  const coreBucket = unresolved.filter(r => r.priority_bucket === 'core');
  if (coreBucket.length > 0) return `${coreBucket.length} core fields still unresolved`;
  if (unresolved.length > 0) return `${unresolved.length} fields still unresolved`;
  return 'all fields covered';
}
