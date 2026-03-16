export function createSourcesReportCommand({
  loadSourceIntel,
  promotionSuggestionsKey,
}) {
  return async function commandSourcesReport(config, storage, args) {
    const category = args.category || 'mouse';
    const top = Math.max(1, Number.parseInt(args.top || '25', 10) || 25);
    const topPaths = Math.max(1, Number.parseInt(args['top-paths'] || '8', 10) || 8);

    const intel = await loadSourceIntel({ storage, config, category });
    const domains = Object.values(intel.data.domains || {}).sort(
      (a, b) => (b.planner_score || 0) - (a.planner_score || 0)
    );

    const suggestionKey = promotionSuggestionsKey(config, category);
    const suggestions = await storage.readJsonOrNull(suggestionKey);

    return {
      command: 'sources-report',
      category,
      domain_stats_key: intel.key,
      domain_count: domains.length,
      top_domains: domains.slice(0, top).map((item) => ({
        rootDomain: item.rootDomain,
        planner_score: item.planner_score,
        attempts: item.attempts,
        identity_match_rate: item.identity_match_rate,
        major_anchor_conflict_rate: item.major_anchor_conflict_rate,
        fields_accepted_count: item.fields_accepted_count,
        products_seen: item.products_seen,
        approved_attempts: item.approved_attempts,
        candidate_attempts: item.candidate_attempts,
        top_paths: Object.values(item.per_path || {})
          .sort((a, b) => (b.planner_score || 0) - (a.planner_score || 0))
          .slice(0, topPaths)
          .map((pathRow) => ({
            path: pathRow.path || '/',
            planner_score: pathRow.planner_score || 0,
            attempts: pathRow.attempts || 0,
            identity_match_rate: pathRow.identity_match_rate || 0,
            major_anchor_conflict_rate: pathRow.major_anchor_conflict_rate || 0,
            fields_accepted_count: pathRow.fields_accepted_count || 0,
          })),
      })),
      promotion_suggestions_key: suggestionKey,
      promotion_suggestion_count: suggestions?.suggestion_count || 0,
    };
  };
}
