export function computeCoverageStats(needsetRows, queryRows) {
  const totalNeeds = needsetRows.length;
  if (totalNeeds === 0) return { totalNeeds: 0, coveredNeeds: 0, gapFields: [], coverageScore: 1 };

  const coveredFields = new Set();
  for (const q of queryRows) {
    for (const f of (q.target_fields || [])) {
      coveredFields.add(f);
    }
  }

  const needFields = needsetRows.map((n) => n.field_key);
  const gapFields = needFields.filter((f) => !coveredFields.has(f));
  const coveredNeeds = totalNeeds - gapFields.length;
  const coverageScore = coveredNeeds / totalNeeds;

  return { totalNeeds, coveredNeeds, gapFields, coverageScore };
}

export function deriveQueryStatus(queryRow) {
  const resultCount = Number(queryRow.result_count || 0);
  const attempts = Number(queryRow.attempts || 0);
  if (resultCount > 0) return 'received';
  if (attempts > 0) return 'sent';
  return 'planned';
}

export function deriveStrategy(queryRow) {
  const source = String(queryRow.hint_source || '').toLowerCase();
  if (source.startsWith('llm')) return 'llm-planned';
  return 'deterministic';
}

export function deriveLlmPlannerStatus(searchProfile) {
  if (!searchProfile) return false;
  if (searchProfile.llm_query_planning === true) return true;
  if (Array.isArray(searchProfile.llm_queries) && searchProfile.llm_queries.length > 0) return true;
  if (typeof searchProfile.llm_query_model === 'string' && searchProfile.llm_query_model.trim().length > 0) return true;
  const rows = Array.isArray(searchProfile.query_rows) ? searchProfile.query_rows : [];
  for (const row of rows) {
    const source = String(row.hint_source || '').toLowerCase();
    if (source.startsWith('llm')) return true;
  }
  return false;
}

export function deriveHostPlanSummary(plan) {
  if (!plan) {
    return { hostCount: 0, searchableHostCount: 0, tierCount: 0, blocked: false, hostGroups: [], explainEntries: [] };
  }
  if (plan.blocked) {
    return {
      hostCount: 0, searchableHostCount: 0, tierCount: 0,
      blocked: true, blockReason: plan.reason || '', hostGroups: [], explainEntries: []
    };
  }
  const cs = plan.classification_summary || {};
  return {
    hostCount: Number(cs.host_count || 0),
    searchableHostCount: Number(cs.searchable_host_count || 0),
    tierCount: Number(cs.tier_count || 0),
    intentCount: Number(cs.intent_count || 0),
    unresolvedCount: Number(cs.unresolved_count || 0),
    blocked: false,
    hostGroups: Array.isArray(plan.host_groups) ? plan.host_groups : [],
    explainEntries: Array.isArray(plan.explain) ? plan.explain : [],
    providerName: plan.provider_caps?.name || undefined,
  };
}

export function buildQueryDetailPayload(queryRow, needsetRows) {
  const targetFields = queryRow.target_fields || [];
  const targetSet = new Set(targetFields);
  const matchedNeeds = needsetRows.filter((n) => targetSet.has(n.field_key));

  return {
    query: queryRow.query,
    targetFields,
    matchedNeeds,
    strategy: deriveStrategy(queryRow),
    status: deriveQueryStatus(queryRow),
    constraints: {
      doc_hint: queryRow.doc_hint || null,
      domain_hint: queryRow.domain_hint || null,
      alias: queryRow.alias || null,
    },
    resultCount: Number(queryRow.result_count || 0),
    providers: queryRow.providers || [],
  };
}
