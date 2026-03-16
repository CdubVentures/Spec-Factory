// WHY: Pure adapter converting Schema 4 search_plan_handoff into the shape
// executeSearchQueries() expects. Zero side effects, zero I/O.

/**
 * Convert a Schema 4 search_plan_handoff into an execution plan.
 *
 * @param {object|null} handoff - { queries, query_hashes, total }
 * @returns {{ queries: string[], selectedQueryRowMap: Map<string, object>, queryRows: object[], source: 'schema4' }}
 */
export function convertHandoffToExecutionPlan(handoff) {
  const empty = { queries: [], selectedQueryRowMap: new Map(), queryRows: [], source: 'schema4' };

  if (!handoff?.queries?.length) return empty;

  const seen = new Set();
  const queries = [];
  const queryRows = [];
  const selectedQueryRowMap = new Map();

  for (const entry of handoff.queries) {
    const q = String(entry?.q || '').trim();
    if (!q) continue;

    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const row = {
      query: q,
      source: 'schema4_planner',
      target_fields: Array.isArray(entry.target_fields) ? entry.target_fields : [],
      domain_hint: Array.isArray(entry.preferred_domains) && entry.preferred_domains.length > 0
        ? String(entry.preferred_domains[0])
        : '',
      doc_hint: '',
      hint_source: 'schema4_search_plan',
      family: String(entry.family || ''),
      group_key: String(entry.group_key || ''),
      query_hash: String(entry.query_hash || ''),
    };

    queries.push(q);
    queryRows.push(row);
    selectedQueryRowMap.set(key, row);
  }

  return { queries, selectedQueryRowMap, queryRows, source: 'schema4' };
}
